import {
  type CreateClient,
  type DuplicateMatch,
  formatClientName,
  type ListQuery,
  normalizePhone,
  type Page,
  type UpdateClient,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Client, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { AuditService } from '../audit';
import { SequenceService } from '../sequence';

import { findClientDuplicates, refuseUnlessOverridden } from './duplicates';

@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  async list(query: ListQuery): Promise<Page<Client>> {
    // Digits-only fragment of the search term, for matching against the
    // normalized phone column regardless of how the stored or typed number is
    // formatted (spaces, dashes, country code). Not run through
    // `normalizePhone` itself — that requires a full 8+ digit number and
    // would reject a partial, mid-typing search like "9989".
    const phoneFragment = query.search?.replace(/\D+/g, '') ?? '';

    const where: Prisma.ClientWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { fatherName: { contains: query.search, mode: 'insensitive' } },
              { grandfatherName: { contains: query.search, mode: 'insensitive' } },
              { surname: { contains: query.search, mode: 'insensitive' } },
              { reference: { contains: query.search, mode: 'insensitive' } },
              { crNumber: { contains: query.search, mode: 'insensitive' } },
              { civilId: { contains: query.search, mode: 'insensitive' } },
              { mobileNumber: { contains: query.search, mode: 'insensitive' } },
              ...(phoneFragment.length >= 3
                ? [{ mobileNumberNormalized: { contains: phoneFragment } }]
                : []),
            ],
          }
        : {}),
    };

    // Count and page in one round trip rather than two sequential ones.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: [{ firstName: 'asc' }, { surname: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async byId(id: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw appError('NOT_FOUND');
    return client;
  }

  async create(input: CreateClient, actorId: string): Promise<Client> {
    return this.prisma.$transaction(async (tx) => {
      const overridden = refuseUnlessOverridden(
        await findClientDuplicates(
          tx,
          {
            crNumber: input.crNumber ?? undefined,
            civilId: input.civilId ?? undefined,
          },
          { lock: true },
        ),
        input.duplicateOverride,
        describeMatch,
      );

      // Left blank, a reference is minted from the CLIENT series
      // (docs/phase-4-plan.md §4's pattern, same as Project.code) — reserved
      // inside this same transaction, so the number and the client it names
      // commit together or not at all.
      const reference = input.reference ?? (await this.sequence.next(tx, 'CLIENT')).code;

      const client = await tx.client
        .create({
          data: {
            firstName: input.firstName,
            fatherName: input.fatherName ?? null,
            grandfatherName: input.grandfatherName ?? null,
            surname: input.surname ?? null,
            reference,
            notes: input.notes ?? null,
            clientType: input.clientType ?? null,
            crNumber: input.crNumber ?? null,
            civilId: input.civilId ?? null,
            mobileNumber: input.mobileNumber ?? null,
            mobileNumberNormalized: input.mobileNumber ? normalizePhone(input.mobileNumber) : null,
            createdBy: actorId,
          },
        })
        .catch(rethrowDuplicateReference);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Client',
        entityId: client.id,
        after: {
          name: formatClientName(client),
          reference: client.reference,
          crNumber: client.crNumber,
          civilId: client.civilId,
          mobileNumber: client.mobileNumber,
          ...(overridden ? { duplicateOverride: overridden } : {}),
        },
      });

      return client;
    });
  }

  /**
   * Applies an edit, but only if nobody else has changed the record since the
   * caller read it.
   *
   * The version is part of the WHERE clause, so a stale write matches zero rows
   * and is refused. Checking first and then writing would leave a gap between
   * the two in which another request could land.
   */
  async update(id: string, input: UpdateClient, _actorId: string): Promise<Client> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');
      if (before.archivedAt) throw appError('CONFLICT');

      // Only a CHANGED identifier is checked. Re-saving a record that was
      // already let through with an override must not demand the reason again.
      const crChanged = input.crNumber != null && input.crNumber !== before.crNumber;
      const civilChanged = input.civilId != null && input.civilId !== before.civilId;
      const overridden =
        crChanged || civilChanged
          ? refuseUnlessOverridden(
              await findClientDuplicates(
                tx,
                {
                  crNumber: crChanged ? (input.crNumber ?? undefined) : undefined,
                  civilId: civilChanged ? (input.civilId ?? undefined) : undefined,
                  excludeId: id,
                },
                { lock: true },
              ),
              input.duplicateOverride,
              describeMatch,
            )
          : null;

      const { count } = await tx.client.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.fatherName !== undefined ? { fatherName: input.fatherName } : {}),
          ...(input.grandfatherName !== undefined
            ? { grandfatherName: input.grandfatherName }
            : {}),
          ...(input.surname !== undefined ? { surname: input.surname } : {}),
          ...(input.reference !== undefined ? { reference: input.reference } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.clientType !== undefined ? { clientType: input.clientType } : {}),
          ...(input.crNumber !== undefined ? { crNumber: input.crNumber } : {}),
          ...(input.civilId !== undefined ? { civilId: input.civilId } : {}),
          ...(input.mobileNumber !== undefined
            ? {
                mobileNumber: input.mobileNumber,
                mobileNumberNormalized: input.mobileNumber
                  ? normalizePhone(input.mobileNumber)
                  : null,
              }
            : {}),
          version: { increment: 1 },
        },
      });

      if (count === 0) throw appError('STALE_RECORD', { context: { client_id: id } });

      const after = await tx.client.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Client',
        entityId: id,
        before: {
          name: formatClientName(before),
          reference: before.reference,
          notes: before.notes,
          clientType: before.clientType,
          crNumber: before.crNumber,
          civilId: before.civilId,
          mobileNumber: before.mobileNumber,
        },
        after: {
          name: formatClientName(after),
          reference: after.reference,
          notes: after.notes,
          clientType: after.clientType,
          crNumber: after.crNumber,
          civilId: after.civilId,
          mobileNumber: after.mobileNumber,
          ...(overridden ? { duplicateOverride: overridden } : {}),
        },
      });

      return after;
    });
  }

  /**
   * Archives a client.
   *
   * PRD §6 forbids destructive deletion where dependent history exists, so this
   * never deletes. It also refuses while live properties remain attached —
   * archiving the parent would otherwise strand them, visible but belonging to
   * nothing.
   */
  async archive(id: string, actorId: string): Promise<void> {
    // The dependency check runs first, and on its own.
    //
    // A refusal must be RECORDED, and a refusal changes nothing — so it cannot
    // be audited inside the transaction it is about to abort. Rolling that
    // transaction back would take the audit row with it, and the refusal would
    // leave no trace at all.
    //
    // The two cases are genuinely different:
    //   a change      → audit belongs in the same transaction, so neither can
    //                   exist without the other
    //   a refusal     → nothing changed, so the audit row stands alone and
    //                   commits by itself
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw appError('NOT_FOUND');
    if (client.archivedAt) return; // Already archived; nothing to do.

    const liveProperties = await this.prisma.property.count({
      where: { clientId: id, archivedAt: null },
    });

    // Projects count whatever their status, including closed ones. A project is
    // the record of an engagement, and PRD §6 does not let the customer it was
    // for quietly disappear from underneath it.
    //
    // The consequence is deliberate and worth stating: a client the consultancy
    // has ever worked for cannot be archived. That is the letter of the plan's
    // definition of done, and it is the safe direction to be wrong in — but it
    // is a question to put back to the client, because tidying away a customer
    // from ten years ago is a reasonable thing to want.
    const projects = await this.prisma.project.count({ where: { clientId: id } });

    if (liveProperties > 0 || projects > 0) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'ARCHIVED',
          entityType: 'Client',
          entityId: id,
          outcome: 'REJECTED',
        }),
      );

      throw appError('DEPENDENCY_EXISTS', {
        fields: [
          ...(liveProperties > 0
            ? [
                {
                  field: 'properties',
                  reason: `${String(liveProperties)} active ${liveProperties === 1 ? 'property is' : 'properties are'} still attached to this client.`,
                },
              ]
            : []),
          ...(projects > 0
            ? [
                {
                  field: 'projects',
                  reason: `${String(projects)} ${projects === 1 ? 'project belongs' : 'projects belong'} to this client.`,
                },
              ]
            : []),
        ],
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();

      // Re-checked inside the transaction and conditional on the row still
      // being live, so two simultaneous archive requests cannot both proceed.
      const { count } = await tx.client.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt, archivedBy: actorId, version: { increment: 1 } },
      });
      if (count === 0) return;

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Client',
        entityId: id,
        before: { archivedAt: null },
        after: { archivedAt: archivedAt.toISOString() },
      });
    });
  }
}

/** What the user is told a clashing identifier already belongs to. */
function describeMatch(match: DuplicateMatch): string {
  const ref = match.reference ? ` (${match.reference})` : '';
  return `Already recorded for client "${match.name}"${ref}.`;
}

/**
 * Turns the database's uniqueness refusal into a message about the field the
 * user actually filled in.
 */
function rethrowDuplicateReference(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    throw appError('CONFLICT', {
      fields: [{ field: 'reference', reason: 'Another client already uses this reference.' }],
    });
  }
  throw error;
}
