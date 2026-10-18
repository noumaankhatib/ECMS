import type {
  CreateProperty,
  DuplicateMatch,
  ListQuery,
  Page,
  UpdateProperty,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma, Property } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { appError } from '../../shared/errors/app-error';
import { clientMatchesTerm, propertyTermConditions, searchTerms } from '../../shared/search/terms';
import { AuditService } from '../audit';
import { SequenceService } from '../sequence';

import { findPropertyDuplicates, refuseUnlessOverridden } from './duplicates';
import { coordinateIssues, omanrealMapUrl, propertyToWgs84 } from './geo';

export type PropertyWithCoordinates = Property & {
  latitude: number | null;
  longitude: number | null;
  mapUrl: string | null;
};

/**
 * Derived at read time, never persisted — the same pattern used by
 * `DashboardService` and `CompletionGateService` for values computed from a
 * record's own fields rather than stored redundantly.
 */
function withCoordinates(property: Property): PropertyWithCoordinates {
  const wgs84 = propertyToWgs84(property.easting, property.northing, property.projectionType);
  const latitude = wgs84?.latitude ?? null;
  const longitude = wgs84?.longitude ?? null;
  return { ...property, latitude, longitude, mapUrl: omanrealMapUrl(latitude, longitude) };
}

function assertCoordinates(
  easting: Parameters<typeof coordinateIssues>[0],
  northing: Parameters<typeof coordinateIssues>[1],
  projectionType: string | null | undefined,
): void {
  const fields = coordinateIssues(easting, northing, projectionType);
  if (fields.length > 0) throw appError('VALIDATION_FAILED', { fields });
}

@Injectable()
export class PropertyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  async list(
    query: ListQuery,
    clientId?: string,
    options: { searchClients: boolean } = { searchClients: false },
  ): Promise<Page<PropertyWithCoordinates>> {
    const terms = searchTerms(query.search);
    const where: Prisma.PropertyWhereInput = {
      ...(clientId ? { clientId } : {}),
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(terms.length > 0
        ? {
            // Every word must match somewhere on the plot, its owner, or — only
            // where the caller may see clients — the client it belongs to.
            AND: terms.map((term) => ({
              OR: [
                ...propertyTermConditions(term),
                // A plot is more often looked up by its own number than its
                // name in practice — see docs/phase-4-plan.md §7.
                { postcode: { contains: term, mode: 'insensitive' as const } },
                { ownerName: { contains: term, mode: 'insensitive' as const } },
                { ownerNationalId: { contains: term, mode: 'insensitive' as const } },
                ...(options.searchClients ? [{ client: { is: clientMatchesTerm(term) } }] : []),
              ],
            })),
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      items: items.map(withCoordinates),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async byId(id: string): Promise<PropertyWithCoordinates> {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw appError('NOT_FOUND');
    return withCoordinates(property);
  }

  async create(input: CreateProperty, actorId: string): Promise<Property> {
    assertCoordinates(input.easting, input.northing, input.projectionType);
    return this.prisma.$transaction(async (tx) => {
      // A property must belong to a live client. Attaching one to an archived
      // client would create a record nobody can reach.
      const client = await tx.client.findUnique({
        where: { id: input.clientId },
        select: { id: true, archivedAt: true },
      });
      if (!client) throw appError('NOT_FOUND', { context: { client_id: input.clientId } });
      if (client.archivedAt) {
        throw appError('CONFLICT', {
          fields: [{ field: 'clientId', reason: 'That client has been archived.' }],
        });
      }

      const overridden = refuseUnlessOverridden(
        await findPropertyDuplicates(
          tx,
          {
            plotNumber: input.plotNumber ?? undefined,
            wilayat: input.wilayat ?? undefined,
          },
          { lock: true },
        ),
        input.duplicateOverride,
        describeMatch,
      );

      // Left blank, a reference is minted from the PROPERTY series, the same
      // pattern Client.reference and Project.code already follow.
      const reference = input.reference ?? (await this.sequence.next(tx, 'PROPERTY')).code;

      const property = await tx.property
        .create({
          data: {
            clientId: input.clientId,
            name: input.name,
            reference,
            addressLine1: input.addressLine1 ?? null,
            addressLine2: input.addressLine2 ?? null,
            city: input.city ?? null,
            postcode: input.postcode ?? null,
            country: input.country ?? null,
            notes: input.notes ?? null,
            plotNumber: input.plotNumber ?? null,
            wilayat: input.wilayat ?? null,
            village: input.village ?? null,
            surveyReference: input.surveyReference ?? null,
            titleDeedReference: input.titleDeedReference ?? null,
            ownerName: input.ownerName ?? null,
            ownerNationalId: input.ownerNationalId ?? null,
            blockNumber: input.blockNumber ?? null,
            plotArea: input.plotArea ?? null,
            landUseType: input.landUseType ?? null,
            easting: input.easting ?? null,
            northing: input.northing ?? null,
            projectionType: input.projectionType ?? null,
            createdBy: actorId,
          },
        })
        .catch(rethrowDuplicateReference);

      await this.audit.record(tx, {
        action: 'CREATED',
        entityType: 'Property',
        entityId: property.id,
        after: {
          name: property.name,
          clientId: property.clientId,
          ...(overridden ? { duplicateOverride: overridden } : {}),
        },
      });

      return property;
    });
  }

  async update(id: string, input: UpdateProperty, _actorId: string): Promise<Property> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.property.findUnique({ where: { id } });
      if (!before) throw appError('NOT_FOUND');
      if (before.archivedAt) throw appError('CONFLICT');

      assertCoordinates(
        input.easting !== undefined ? input.easting : before.easting,
        input.northing !== undefined ? input.northing : before.northing,
        input.projectionType !== undefined ? input.projectionType : before.projectionType,
      );

      // Checked only when the plot's identity is being changed, against the
      // identity it will have afterwards — a new plot number is compared with
      // the wilayat already on file. surveyReference is excluded from this
      // soft warn-and-override check — it's hard-unique (see
      // rethrowDuplicateReference below), not a judgement call.
      const identityChanged = [
        ['plotNumber', before.plotNumber],
        ['wilayat', before.wilayat],
      ].some(([key, old]) => {
        const next = input[key as 'plotNumber' | 'wilayat'];
        return next != null && next !== old;
      });
      const overridden = identityChanged
        ? refuseUnlessOverridden(
            await findPropertyDuplicates(
              tx,
              {
                plotNumber:
                  (input.plotNumber !== undefined ? input.plotNumber : before.plotNumber) ??
                  undefined,
                wilayat:
                  (input.wilayat !== undefined ? input.wilayat : before.wilayat) ?? undefined,
                excludeId: id,
              },
              { lock: true },
            ),
            input.duplicateOverride,
            describeMatch,
          )
        : null;

      const { version: _version, duplicateOverride: _override, ...fields } = input;
      const data: Prisma.PropertyUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          (data as Record<string, unknown>)[key] = value;
        }
      }

      const { count } = await tx.property
        .updateMany({
          where: { id, version: input.version },
          data,
        })
        .catch(rethrowDuplicateReference);
      if (count === 0) throw appError('STALE_RECORD', { context: { property_id: id } });

      const after = await tx.property.findUniqueOrThrow({ where: { id } });

      await this.audit.record(tx, {
        action: 'UPDATED',
        entityType: 'Property',
        entityId: id,
        before: { name: before.name, reference: before.reference, city: before.city },
        after: {
          name: after.name,
          reference: after.reference,
          city: after.city,
          ...(overridden ? { duplicateOverride: overridden } : {}),
        },
      });

      return after;
    });
  }

  /**
   * Archives a property.
   *
   * Refuses while any project sits on it, for the same reason a client with
   * properties is refused: the project would be left pointing at a site that no
   * longer appears anywhere.
   *
   * The refusal is audited in a transaction of its own. Nothing changed, so
   * there is nothing for it to be atomic with — and inside the failing
   * transaction the rollback would erase the record of the refusal.
   */
  async archive(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true, archivedAt: true },
    });
    if (!existing) throw appError('NOT_FOUND');

    if (!existing.archivedAt) {
      const projects = await this.prisma.project.count({ where: { propertyId: id } });
      if (projects > 0) {
        await this.prisma.$transaction((tx) =>
          this.audit.record(tx, {
            action: 'ARCHIVED',
            entityType: 'Property',
            entityId: id,
            outcome: 'REJECTED',
          }),
        );

        throw appError('DEPENDENCY_EXISTS', {
          fields: [
            {
              field: 'projects',
              reason: `${String(projects)} ${projects === 1 ? 'project is' : 'projects are'} attached to this property.`,
            },
          ],
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({ where: { id } });
      if (!property) throw appError('NOT_FOUND');
      if (property.archivedAt) return;

      await tx.property.update({
        where: { id },
        data: { archivedAt: new Date(), archivedBy: actorId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        action: 'ARCHIVED',
        entityType: 'Property',
        entityId: id,
        after: { archivedAt: new Date().toISOString() },
      });
    });
  }
}

/** What the user is told a clashing plot is already recorded as. */
function describeMatch(match: DuplicateMatch): string {
  const ref = match.reference ? ` (${match.reference})` : '';
  return `Already recorded as property "${match.name}"${ref}.`;
}

function rethrowDuplicateReference(error: unknown): never {
  const err = error as { code?: string; meta?: { target?: unknown }; message?: string };
  if (err.code === 'P2002') {
    const detail = `${JSON.stringify(err.meta?.target ?? '')}${err.message ?? ''}`;
    if (detail.includes('survey_reference')) {
      throw appError('CONFLICT', {
        fields: [
          {
            field: 'surveyReference',
            reason: 'Another property already uses this survey reference (Land ID).',
          },
        ],
      });
    }
    throw appError('CONFLICT', {
      fields: [{ field: 'reference', reason: 'Another property already uses this reference.' }],
    });
  }
  throw error;
}
