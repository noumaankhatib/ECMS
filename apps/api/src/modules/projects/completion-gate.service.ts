import type {
  GateCheck,
  GateOverride,
  GateReadiness,
  ProjectReadiness,
  WorkstreamType,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';

/** A submission still with someone — anything short of a final outcome. */
const SUBMISSION_IN_PROGRESS = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED_FOR_REVISION',
  'HALTED',
];
/** The approvals inbox's own definition of "waiting for a decision". */
const AWAITING_APPROVAL = ['SUBMITTED', 'UNDER_REVIEW'];

/** What an override leaves in the audit trail beside the status change. */
export interface GateOverrideRecord {
  reason: string;
  unmet: string[];
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function readiness(checks: GateCheck[]): GateReadiness {
  return { ready: checks.every((check) => check.met), checks };
}

/**
 * The conditions a project or workstream must meet before it may be marked
 * Completed — computed fresh from the project's own records on every call,
 * never stored, the same posture `HandoverService.status` takes for closing.
 *
 * This is the one definition of "ready". The transition services call
 * `enforce` to refuse (or record an override), and `GET /projects/:id/
 * readiness` returns the same checks so the web can show what is outstanding
 * before anyone presses the button. The two cannot disagree.
 *
 *  - Planning:    no submission still in progress, every milestone reached,
 *                 every activity done.
 *  - Supervision: no open issue on the supervision work, no drawing revision
 *                 or modification still awaiting a decision.
 *  - Project:     every workstream Completed.
 *
 * Drawings and modifications belong to the project, not to a workstream, so
 * on a planning-and-supervision project the supervision gate counts all of
 * them. Archived activities and milestones are ignored; closed issues and
 * final-status records never count.
 */
@Injectable()
export class CompletionGateService {
  constructor(private readonly prisma: PrismaService) {}

  async workstream(
    projectId: string,
    type: WorkstreamType,
    projectType: string,
  ): Promise<GateReadiness> {
    if (type === 'PLANNING') {
      const [submissions, milestones, activities] = await Promise.all([
        this.prisma.submission.count({
          where: { projectId, status: { in: SUBMISSION_IN_PROGRESS } },
        }),
        this.prisma.milestone.count({
          where: { projectId, archivedAt: null, achievedDate: null },
        }),
        this.prisma.planningActivity.count({
          where: { projectId, archivedAt: null, done: false },
        }),
      ]);
      return readiness([
        {
          key: 'submissions',
          label: 'No submission still in progress',
          met: submissions === 0,
          ...(submissions > 0
            ? { detail: `${count(submissions, 'submission')} not yet decided or withdrawn.` }
            : {}),
        },
        {
          key: 'milestones',
          label: 'Every milestone reached',
          met: milestones === 0,
          ...(milestones > 0
            ? { detail: `${count(milestones, 'milestone')} not yet reached.` }
            : {}),
        },
        {
          key: 'activities',
          label: 'Every activity done',
          met: activities === 0,
          ...(activities > 0
            ? { detail: `${count(activities, 'activity', 'activities')} not done.` }
            : {}),
        },
      ]);
    }

    // On a BOTH project an issue says which workstream it belongs to; on a
    // supervision-only project every issue is supervision work.
    const [issues, revisions, modifications] = await Promise.all([
      this.prisma.issue.count({
        where: {
          projectId,
          status: { not: 'CLOSED' },
          ...(projectType === 'BOTH' ? { workstreamType: 'SUPERVISION' } : {}),
        },
      }),
      this.prisma.drawingRevision.count({
        where: { drawing: { projectId }, status: { in: AWAITING_APPROVAL } },
      }),
      this.prisma.modification.count({
        where: { projectId, status: { in: AWAITING_APPROVAL } },
      }),
    ]);
    return readiness([
      {
        key: 'issues',
        label: 'No open supervision issue',
        met: issues === 0,
        ...(issues > 0 ? { detail: `${count(issues, 'issue')} not yet closed.` } : {}),
      },
      {
        key: 'drawings',
        label: 'No drawing revision awaiting approval',
        met: revisions === 0,
        ...(revisions > 0
          ? { detail: `${count(revisions, 'revision')} awaiting a decision.` }
          : {}),
      },
      {
        key: 'modifications',
        label: 'No modification awaiting approval',
        met: modifications === 0,
        ...(modifications > 0
          ? { detail: `${count(modifications, 'modification')} awaiting a decision.` }
          : {}),
      },
    ]);
  }

  async project(projectId: string): Promise<GateReadiness> {
    const workstreams = await this.prisma.workstream.findMany({
      where: { projectId },
      select: { name: true, status: true },
      orderBy: { type: 'asc' },
    });
    const unfinished = workstreams.filter((w) => w.status !== 'COMPLETED');
    return readiness([
      {
        key: 'workstreams',
        label: 'Every workstream completed',
        met: unfinished.length === 0,
        ...(unfinished.length > 0
          ? { detail: `Still open: ${unfinished.map((w) => w.name).join(', ')}.` }
          : {}),
      },
    ]);
  }

  async readiness(projectId: string): Promise<ProjectReadiness> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { type: true },
    });
    if (!project) throw appError('NOT_FOUND');
    const workstreams = await this.prisma.workstream.findMany({
      where: { projectId },
      select: { id: true, type: true },
      orderBy: { type: 'asc' },
    });
    const [projectGate, ...workstreamGates] = await Promise.all([
      this.project(projectId),
      ...workstreams.map((w) => this.workstream(projectId, w.type as WorkstreamType, project.type)),
    ]);
    return {
      project: projectGate as GateReadiness,
      workstreams: workstreams.map((w, i) => ({
        workstreamId: w.id,
        type: w.type as WorkstreamType,
        readiness: workstreamGates[i] as GateReadiness,
      })),
    };
  }

  /**
   * Refuses when a gate is not met — unless an override was sent, in which
   * case it returns what the audit row must record. The override permission
   * itself is checked by the controller before this ever runs, so the answer
   * never depends on data the caller may not be entitled to see.
   *
   * `onRefuse` records the refusal in the audit trail (in its own
   * transaction, as every other refused transition here does) before the
   * error is thrown.
   */
  async enforce(
    gate: GateReadiness,
    override: GateOverride | undefined,
    onRefuse: () => Promise<void>,
  ): Promise<GateOverrideRecord | undefined> {
    if (gate.ready) return undefined;
    const unmet = gate.checks.filter((check) => !check.met);
    if (!override) {
      await onRefuse();
      throw appError('PRECONDITIONS_UNMET', {
        fields: unmet.map((check) => ({ field: check.key, reason: check.detail ?? check.label })),
      });
    }
    return { reason: override.reason, unmet: unmet.map((check) => check.label) };
  }
}
