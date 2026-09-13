import {
  canTransitionProposal,
  PROPOSAL_ACTIONS,
  WORKSTREAMS_FOR_TYPE,
  type CreateProposal,
  type Page,
  type ProjectType,
  type ProposalAction,
  type ProposalListQuery,
  type ProposalStatus,
  type ProposalTransition,
  type UpdateProposal,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, Proposal } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';
import { SequenceService, type SequenceType } from '../sequence';

/**
 * Same mapping `ProjectService` keeps privately for `Project.create` — a
 * project of type BOTH reserves a Planning-style code. Duplicated rather
 * than imported: this module deliberately never reaches into `projects`'
 * internals (see `index.ts`), the same module-boundary trade `issues` and
 * `supervision` already accepted for `requireOpenProject`.
 */
const SEQUENCE_FOR_TYPE: Record<ProjectType, SequenceType> = {
  PLANNING: 'PLANNING_PROJECT',
  SUPERVISION: 'SUPERVISION_PROJECT',
  BOTH: 'PLANNING_PROJECT',
};

@Injectable()
export class ProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  async list(query: ProposalListQuery): Promise<Page<Proposal>> {
    const where: Prisma.ProposalWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.search
        ? {
            OR: [
              { contactName: { contains: query.search, mode: 'insensitive' } },
              { sketchNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where,
        orderBy: { sketchNumber: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(id: string): Promise<Proposal> {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw appError('NOT_FOUND');
    return proposal;
  }

  /**
   * Logs an inquiry.
   *
   * `clientId`/`propertyId` are validated if given, but neither is required —
   * spec §5's own "Inquiry" stage is captured before either necessarily
   * exists (docs/phase-5-plan.md §5a). A sketch number is always minted,
   * inside this same transaction, so it is never burned by a create that
   * then fails — the same guarantee `ProjectService.create` already gives
   * its own generated code.
   */
  async create(input: CreateProposal, actorId: string): Promise<Proposal> {
    return this.prisma.$transaction(async (tx) => {
      if (input.clientId) {
        const client = await tx.client.findUnique({
          where: { id: input.clientId },
          select: { archivedAt: true },
        });
        if (!client) throw appError('NOT_FOUND', { context: { client_id: input.clientId } });
        if (client.archivedAt) {
          throw appError('CONFLICT', {
            fields: [{ field: 'clientId', reason: 'That client has been archived.' }],
          });
        }
      }

      if (input.propertyId) {
        const property = await tx.property.findUnique({
          where: { id: input.propertyId },
          select: { archivedAt: true, clientId: true },
        });
        if (!property) {
          throw appError('NOT_FOUND', { context: { property_id: input.propertyId } });
        }
        if (property.archivedAt) {
          throw appError('CONFLICT', {
            fields: [{ field: 'propertyId', reason: 'That property has been archived.' }],
          });
        }
        // Same rule ProjectService.create already applies: a property that
        // contradicts the named client would let a proposal claim to sit on
        // a site that belongs to someone else.
        if (input.clientId && property.clientId !== input.clientId) {
          throw appError('CONFLICT', {
            fields: [
              { field: 'propertyId', reason: 'That property does not belong to the named client.' },
            ],
          });
        }
      }

      if (input.sketchTypeId) {
        const sketchType = await tx.proposalSketchType.findUnique({
          where: { id: input.sketchTypeId },
          select: { id: true },
        });
        if (!sketchType) {
          throw appError('NOT_FOUND', { context: { sketch_type_id: input.sketchTypeId } });
        }
      }

      const sketchNumber = (await this.sequence.next(tx, 'SKETCH')).code;

      const proposal = await tx.proposal.create({
        data: {
          contactName: input.contactName,
          contactPhone: input.contactPhone ?? null,
          clientId: input.clientId ?? null,
          propertyId: input.propertyId ?? null,
          sketchNumber,
          sketchTypeId: input.sketchTypeId ?? null,
          projectType: input.projectType ?? null,
          approxAreaSqm: input.approxAreaSqm ?? null,
          source: input.source ?? null,
          assignedArchitectId: input.assignedArchitectId ?? null,
          receivedAt: input.receivedAt ?? null,
          dueAt: input.dueAt ?? null,
          notes: input.notes ?? null,
          createdBy: actorId,
        },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Proposal',
        entityId: proposal.id,
        after: { sketchNumber: proposal.sketchNumber, contactName: proposal.contactName },
      });

      return proposal;
    });
  }

  async update(id: string, input: UpdateProposal, _actorId: string): Promise<Proposal> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.proposal.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');

      const { version: _version, ...fields } = input;
      const data: Prisma.ProposalUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          (data as Record<string, unknown>)[key] = value;
        }
      }

      const { count } = await tx.proposal.updateMany({
        where: { id, version: input.version },
        data,
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { proposal_id: id } });

      const after = await tx.proposal.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Proposal',
        entityId: id,
        before: { contactName: before.contactName, clientId: before.clientId },
        after: { contactName: after.contactName, clientId: after.clientId },
      });

      return after;
    });
  }

  /**
   * Moves a proposal to a new status. The named action decides the target,
   * `canTransitionProposal` decides whether the move is legal from where the
   * proposal currently is, and the write is conditional on the proposal
   * still being in that state — the same three-layer discipline
   * `ProjectService.transition`/`IssueService.transition` already use.
   *
   * `WON → CONVERTED` is deliberately not reachable here — see the `convert`
   * action (docs/phase-5-plan.md §4), which creates a Project alongside the
   * status write and must go through its own code path.
   */
  async transition(
    id: string,
    action: ProposalAction,
    input: ProposalTransition,
  ): Promise<Proposal> {
    const target: ProposalStatus = PROPOSAL_ACTIONS[action];

    const current = await this.prisma.proposal.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) throw appError('NOT_FOUND');

    const from = current.status as ProposalStatus;
    if (!canTransitionProposal(from, target)) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'Proposal',
          entityId: id,
          outcome: 'REJECTED',
          before: { status: from },
          after: { status: target },
        }),
      );

      throw appError('ILLEGAL_TRANSITION', {
        fields: [{ field: 'status', reason: `A proposal cannot go from ${from} to ${target}.` }],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.proposal.updateMany({
        where: { id, status: from, version: input.version },
        data: { status: target, version: { increment: 1 } },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { proposal_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Proposal',
        entityId: id,
        before: { status: from },
        after: { status: target, reason: input.reason ?? null },
      });

      return tx.proposal.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * The one path from `WON` to `CONVERTED` (docs/phase-5-plan.md §4). Unlike
   * every other transition, this one creates a second record — reserving a
   * project code, inserting the `Project` row with its opening workstreams
   * and its creator's membership, and marking the proposal converted, all in
   * one transaction. Either the whole thing lands, or none of it does — the
   * same all-or-nothing rule Phase 4 already applied to "reserve the number
   * and create the record together."
   */
  async convert(id: string, input: ProposalTransition, actorId: string): Promise<Proposal> {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({ where: { id } });
      if (!proposal) throw appError('NOT_FOUND');

      if (proposal.status !== 'WON') {
        throw appError('ILLEGAL_TRANSITION', {
          fields: [
            {
              field: 'status',
              reason: `A proposal cannot go from ${proposal.status} to CONVERTED.`,
            },
          ],
        });
      }

      // Decision §5d: no inline property creation shortcut. A caller must
      // attach or create the property first, and is told so by name.
      if (!proposal.propertyId) {
        throw appError('CONFLICT', {
          fields: [
            {
              field: 'propertyId',
              reason: 'Attach a property to this proposal before converting it.',
            },
          ],
        });
      }

      const property = await tx.property.findUnique({
        where: { id: proposal.propertyId },
        select: { id: true, clientId: true, archivedAt: true },
      });
      if (!property) {
        throw appError('NOT_FOUND', { context: { property_id: proposal.propertyId } });
      }
      if (property.archivedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'propertyId', reason: 'That property has been archived.' }],
        });
      }
      if (proposal.clientId && property.clientId !== proposal.clientId) {
        throw appError('CONFLICT', {
          fields: [
            { field: 'propertyId', reason: 'That property does not belong to this proposal\'s client.' },
          ],
        });
      }

      const client = await tx.client.findUnique({
        where: { id: property.clientId },
        select: { archivedAt: true },
      });
      if (!client) throw appError('NOT_FOUND', { context: { client_id: property.clientId } });
      if (client.archivedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'clientId', reason: 'That client has been archived.' }],
        });
      }

      const type: ProjectType = (proposal.projectType as ProjectType | null) ?? 'PLANNING';
      const code = (await this.sequence.next(tx, SEQUENCE_FOR_TYPE[type])).code;

      const project = await tx.project.create({
        data: {
          clientId: property.clientId,
          propertyId: property.id,
          code,
          name: proposal.contactName,
          type,
          createdBy: actorId,
          members: { create: { userId: actorId, roleCode: 'PROJECT_MANAGER' } },
          workstreams: {
            create: WORKSTREAMS_FOR_TYPE[type].map((workstreamType) => ({
              type: workstreamType,
              name: workstreamType === 'PLANNING' ? 'Planning' : 'Supervision',
            })),
          },
        },
      });

      const { count } = await tx.proposal.updateMany({
        where: { id, status: 'WON', version: input.version },
        data: {
          status: 'CONVERTED',
          convertedProjectId: project.id,
          convertedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw appError('STALE_RECORD', { context: { proposal_id: id } });

      await this.audit.record(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Proposal',
        entityId: id,
        before: { status: 'WON' },
        after: { status: 'CONVERTED', convertedProjectId: project.id, reason: input.reason ?? null },
      });

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Project',
        entityId: project.id,
        projectId: project.id,
        after: { code: project.code, name: project.name, type: project.type, fromProposal: id },
      });

      return tx.proposal.findUniqueOrThrow({ where: { id } });
    });
  }
}
