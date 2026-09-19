import type { ImpactNode, ImpactTree } from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';

function countNodes(node: ImpactNode): number {
  return 1 + node.children.reduce((sum: number, c: ImpactNode) => sum + countNodes(c), 0);
}

@Injectable()
export class ImpactService {
  constructor(private readonly prisma: PrismaService) {}

  async forEntity(type: string, id: string): Promise<ImpactTree> {
    let root: ImpactNode;
    switch (type) {
      case 'client':
        root = await this.buildClient(id);
        break;
      case 'property':
        root = await this.buildProperty(id);
        break;
      case 'proposal':
        root = await this.buildProposal(id);
        break;
      case 'project':
        root = await this.buildProject(id);
        break;
      default:
        throw appError('VALIDATION_FAILED', {
          fields: [{ field: 'type', reason: 'Must be client, property, proposal or project.' }],
        });
    }
    return { root, totalCount: countNodes(root) };
  }

  private async buildClient(id: string): Promise<ImpactNode> {
    const c = await this.prisma.client.findUnique({
      where: { id },
      include: {
        contacts: { select: { id: true, name: true, archivedAt: true } },
        properties: {
          select: {
            id: true,
            name: true,
            archivedAt: true,
            proposals: {
              select: { id: true, sketchNumber: true, contactName: true, convertedProjectId: true },
            },
            projects: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!c) throw appError('NOT_FOUND');

    const propertyNodes: ImpactNode[] = await Promise.all(
      c.properties.map(async (p) => {
        const projectNodes = await Promise.all(p.projects.map((pr) => this.buildProject(pr.id)));
        const proposalNodes = await Promise.all(p.proposals.map((pr) => this.buildProposal(pr.id)));
        return {
          id: p.id,
          type: 'property' as const,
          label: p.name,
          archivedAt: p.archivedAt?.toISOString() ?? null,
          children: [...proposalNodes, ...projectNodes],
        };
      }),
    );

    return {
      id,
      type: 'client',
      label: c.name,
      archivedAt: c.archivedAt?.toISOString() ?? null,
      children: [
        ...c.contacts.map((ct) => ({
          id: ct.id,
          type: 'contact' as const,
          label: ct.name,
          archivedAt: ct.archivedAt?.toISOString() ?? null,
          children: [] as ImpactNode[],
        })),
        ...propertyNodes,
      ],
    };
  }

  private async buildProperty(id: string): Promise<ImpactNode> {
    const p = await this.prisma.property.findUnique({
      where: { id },
      include: {
        proposals: {
          select: { id: true, sketchNumber: true, contactName: true, convertedProjectId: true },
        },
        projects: { select: { id: true, code: true, name: true } },
      },
    });
    if (!p) throw appError('NOT_FOUND');

    const projectNodes = await Promise.all(p.projects.map((pr) => this.buildProject(pr.id)));
    const proposalNodes = await Promise.all(p.proposals.map((pr) => this.buildProposal(pr.id)));

    return {
      id,
      type: 'property',
      label: p.name,
      archivedAt: p.archivedAt?.toISOString() ?? null,
      children: [...proposalNodes, ...projectNodes],
    };
  }

  private async buildProposal(id: string): Promise<ImpactNode> {
    const p = await this.prisma.proposal.findUnique({
      where: { id },
      select: { id: true, sketchNumber: true, contactName: true, convertedProjectId: true },
    });
    if (!p) throw appError('NOT_FOUND');

    const children: ImpactNode[] = p.convertedProjectId
      ? [await this.buildProject(p.convertedProjectId)]
      : [];

    return {
      id,
      type: 'proposal',
      label: `${p.sketchNumber} — ${p.contactName}`,
      archivedAt: null,
      children,
    };
  }

  async buildProject(id: string): Promise<ImpactNode> {
    const p = await this.prisma.project.findUnique({
      where: { id },
      include: {
        members: { select: { userId: true, roleCode: true } },
        workstreams: { select: { id: true, type: true, name: true } },
        planningActivities: { select: { id: true, name: true, archivedAt: true } },
        milestones: { select: { id: true, name: true, archivedAt: true } },
        submissions: {
          include: {
            reviews: { select: { id: true, reviewDate: true } },
            meetings: { select: { id: true, meetingAt: true } },
          },
        },
        siteVisits: {
          include: {
            observations: {
              include: {
                issues: { select: { id: true, title: true, status: true } },
                modifications: { select: { id: true, requestText: true, status: true } },
              },
            },
            instructions: { select: { id: true, directiveText: true } },
          },
        },
        supervisionAgreements: { select: { id: true, type: true, startDate: true } },
        issues: {
          select: { id: true, title: true, status: true },
          where: { observationId: null },
        },
        drawings: {
          include: {
            revisions: { select: { id: true, revisionCode: true, status: true } },
          },
        },
        documents: { select: { id: true, title: true, category: true, archivedAt: true } },
        modifications: {
          select: { id: true, requestText: true, status: true },
          where: { observationId: null, drawingRevisionId: null },
        },
        handoverChecklist: { select: { id: true } },
      },
    });
    if (!p) throw appError('NOT_FOUND');

    const children: ImpactNode[] = [];

    for (const m of p.members) {
      children.push({
        id: `${id}:${m.userId}`,
        type: 'member',
        label: `Member (${m.roleCode})`,
        archivedAt: null,
        children: [],
      });
    }

    for (const w of p.workstreams) {
      children.push({ id: w.id, type: 'workstream', label: `${w.type} — ${w.name}`, archivedAt: null, children: [] });
    }

    for (const a of p.planningActivities) {
      children.push({ id: a.id, type: 'planningActivity', label: a.name, archivedAt: a.archivedAt?.toISOString() ?? null, children: [] });
    }

    for (const m of p.milestones) {
      children.push({ id: m.id, type: 'milestone', label: m.name, archivedAt: m.archivedAt?.toISOString() ?? null, children: [] });
    }

    for (const sub of p.submissions) {
      const subChildren: ImpactNode[] = [
        ...sub.reviews.map((r) => ({
          id: r.id,
          type: 'submissionReview' as const,
          label: `Review — ${r.reviewDate instanceof Date ? r.reviewDate.toISOString().slice(0, 10) : String(r.reviewDate)}`,
          archivedAt: null,
          children: [] as ImpactNode[],
        })),
        ...sub.meetings.map((mt) => ({
          id: mt.id,
          type: 'submissionMeeting' as const,
          label: `Meeting${mt.meetingAt ? ` — ${new Date(mt.meetingAt).toISOString().slice(0, 10)}` : ''}`,
          archivedAt: null,
          children: [] as ImpactNode[],
        })),
      ];
      children.push({ id: sub.id, type: 'submission', label: `${sub.reference} (${sub.status})`, archivedAt: null, children: subChildren });
    }

    for (const sv of p.siteVisits) {
      const svChildren: ImpactNode[] = [];
      for (const obs of sv.observations) {
        const obsChildren: ImpactNode[] = [
          ...obs.issues.map((i) => ({
            id: i.id,
            type: 'issue' as const,
            label: `${i.title} (${i.status})`,
            archivedAt: null,
            children: [] as ImpactNode[],
          })),
          ...obs.modifications.map((mod) => ({
            id: mod.id,
            type: 'modification' as const,
            label: mod.requestText.slice(0, 60),
            archivedAt: null,
            children: [] as ImpactNode[],
          })),
        ];
        svChildren.push({
          id: obs.id,
          type: 'observation',
          label: obs.description.slice(0, 60),
          archivedAt: null,
          children: obsChildren,
        });
      }
      for (const instr of sv.instructions) {
        svChildren.push({ id: instr.id, type: 'instruction', label: instr.directiveText.slice(0, 60), archivedAt: null, children: [] });
      }
      const visitDate = sv.visitDate instanceof Date ? sv.visitDate.toISOString().slice(0, 10) : String(sv.visitDate);
      children.push({ id: sv.id, type: 'siteVisit', label: visitDate, archivedAt: null, children: svChildren });
    }

    for (const sa of p.supervisionAgreements) {
      const startDate = sa.startDate instanceof Date ? sa.startDate.toISOString().slice(0, 10) : String(sa.startDate);
      children.push({ id: sa.id, type: 'supervisionAgreement', label: `${sa.type} — ${startDate}`, archivedAt: null, children: [] });
    }

    for (const issue of p.issues) {
      children.push({ id: issue.id, type: 'issue', label: `${issue.title} (${issue.status})`, archivedAt: null, children: [] });
    }

    for (const dr of p.drawings) {
      const revNodes: ImpactNode[] = dr.revisions.map((r) => ({
        id: r.id,
        type: 'drawingRevision' as const,
        label: `Rev ${r.revisionCode} (${r.status})`,
        archivedAt: null,
        children: [],
      }));
      children.push({ id: dr.id, type: 'drawing', label: `${dr.number} — ${dr.title}`, archivedAt: null, children: revNodes });
    }

    for (const doc of p.documents) {
      children.push({ id: doc.id, type: 'document', label: `${doc.category}: ${doc.title}`, archivedAt: doc.archivedAt?.toISOString() ?? null, children: [] });
    }

    for (const mod of p.modifications) {
      children.push({ id: mod.id, type: 'modification', label: mod.requestText.slice(0, 60), archivedAt: null, children: [] });
    }

    if (p.handoverChecklist) {
      children.push({ id: p.handoverChecklist.id, type: 'handoverChecklist', label: 'Handover checklist', archivedAt: null, children: [] });
    }

    return { id, type: 'project', label: `${p.code} — ${p.name}`, archivedAt: null, children };
  }
}
