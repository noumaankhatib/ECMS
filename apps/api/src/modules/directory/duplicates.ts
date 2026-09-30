import {
  normalizePhone,
  type ClientDuplicateQuery,
  type DuplicateMatch,
  type DuplicateOverride,
  type PropertyDuplicateQuery,
} from '@ecms/contracts';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import type { Tx } from '../../shared/database/transaction';
import { appError } from '../../shared/errors/app-error';

/**
 * How alike two normalised names must be to be worth a warning.
 *
 * Measured, not guessed, against real transliteration pairs: every genuine
 * variant tried ("Muhammad Al Rawahi" / "Mohammed Al-Rawahi" 0.48, "Al Balushi"
 * / "Al Baloushi" 0.62) scored above it, and every pair of different people
 * sharing a family name ("Mohammed Al Rawahi" / "Mohammed Al Harthy" 0.42,
 * "Ahmed Al Balushi" / "Salim Al Balushi" 0.36) scored below. A false alarm
 * costs one click; a missed duplicate costs a split client history.
 */
const NAME_SIMILARITY_THRESHOLD = 0.45;

const MAX_MATCHES = 10;

type Db = Tx | PrismaService;

interface Row {
  id: string;
  name: string;
  reference: string | null;
  client_id?: string;
  field: string;
  similarity: number | null;
}

/**
 * Folds one row per (record, matched field) into one match per record, the
 * strongest reason first.
 */
function merge(rows: readonly Row[], exactFields: ReadonlySet<string>): DuplicateMatch[] {
  const byId = new Map<
    string,
    { -readonly [K in keyof DuplicateMatch]: DuplicateMatch[K] } & { matchedOn: string[] }
  >();

  for (const row of rows) {
    let match = byId.get(row.id);
    if (!match) {
      match = {
        id: row.id,
        name: row.name,
        reference: row.reference,
        strength: 'LIKELY',
        matchedOn: [],
        similarity: null,
        ...(row.client_id ? { clientId: row.client_id } : {}),
      };
      byId.set(row.id, match);
    }
    if (!match.matchedOn.includes(row.field)) match.matchedOn.push(row.field);
    if (exactFields.has(row.field)) match.strength = 'EXACT';
    if (row.similarity !== null) match.similarity = row.similarity;
  }

  const rank = (m: DuplicateMatch) => (m.strength === 'EXACT' ? 0 : 1);
  return [...byId.values()]
    .sort((a, b) => rank(a) - rank(b) || (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, MAX_MATCHES);
}

const excluding = (excludeId: string | undefined) =>
  excludeId ? Prisma.sql`AND id <> ${excludeId}::uuid` : Prisma.empty;

/**
 * Serialises writers of the same identity for the rest of the transaction.
 *
 * With no unique constraint (see the migration), two requests saving the same
 * CR number at the same moment would each check, each find nothing, and each
 * insert. Holding a lock keyed on the normalised identity makes the second
 * wait until the first commits; its check then runs on a fresh snapshot and
 * sees the row. Keys are always taken in the same order, so two writers
 * cannot deadlock on each other.
 */
async function lockIdentities(tx: Db, keys: readonly Prisma.Sql[]): Promise<void> {
  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

/** Pass when checking inside the transaction that is about to write. */
interface CheckOptions {
  readonly lock?: boolean;
}

const CLIENT_EXACT_FIELDS = new Set(['crNumber', 'civilId']);

export async function findClientDuplicates(
  db: Db,
  query: ClientDuplicateQuery,
  options: CheckOptions = {},
): Promise<DuplicateMatch[]> {
  const parts: Prisma.Sql[] = [];
  const skip = excluding(query.excludeId);

  if (options.lock) {
    await lockIdentities(db, [
      ...(query.crNumber ? [Prisma.sql`${'client:cr:' + query.crNumber}::text`] : []),
      ...(query.civilId ? [Prisma.sql`${'client:civil:' + query.civilId}::text`] : []),
    ]);
  }

  if (query.crNumber) {
    parts.push(Prisma.sql`
      SELECT id, name, reference, 'crNumber' AS field, NULL::float4 AS similarity
      FROM "client" WHERE archived_at IS NULL AND cr_number = ${query.crNumber} ${skip}`);
  }
  if (query.civilId) {
    parts.push(Prisma.sql`
      SELECT id, name, reference, 'civilId' AS field, NULL::float4 AS similarity
      FROM "client" WHERE archived_at IS NULL AND civil_id = ${query.civilId} ${skip}`);
  }
  if (query.name) {
    // `%` lets the trigram index find candidates; the explicit threshold then
    // applies the measured cut-off rather than pg_trgm's default of 0.3.
    parts.push(Prisma.sql`
      SELECT id, name, reference, 'name' AS field,
             similarity(ecms_normalize_name(name), ecms_normalize_name(${query.name})) AS similarity
      FROM "client"
      WHERE archived_at IS NULL
        AND ecms_normalize_name(name) % ecms_normalize_name(${query.name})
        AND similarity(ecms_normalize_name(name), ecms_normalize_name(${query.name}))
            >= ${NAME_SIMILARITY_THRESHOLD}
        ${skip}`);
  }
  const phone = query.phone ? normalizePhone(query.phone) : null;
  if (phone) {
    parts.push(Prisma.sql`
      SELECT c.id, c.name, c.reference, 'phone' AS field, NULL::float4 AS similarity
      FROM "client" c JOIN contact k ON k.client_id = c.id
      WHERE c.archived_at IS NULL AND k.archived_at IS NULL AND k.phone_normalized = ${phone}
        ${query.excludeId ? Prisma.sql`AND c.id <> ${query.excludeId}::uuid` : Prisma.empty}`);
  }

  if (parts.length === 0) return [];
  const rows = await db.$queryRaw<Row[]>(Prisma.join(parts, ' UNION ALL '));
  return merge(rows, CLIENT_EXACT_FIELDS);
}

const PROPERTY_EXACT_FIELDS = new Set(['plotNumber', 'surveyReference']);

/**
 * A plot is one piece of land whoever the client is, so identity matches are
 * searched across every client. Name likeness is not — two clients can both
 * have a "Villa" — so it is only compared within the client given.
 */
export async function findPropertyDuplicates(
  db: Db,
  query: PropertyDuplicateQuery,
  options: CheckOptions = {},
): Promise<DuplicateMatch[]> {
  const parts: Prisma.Sql[] = [];
  const skip = excluding(query.excludeId);

  if (options.lock) {
    // Normalised by the same SQL functions the comparison uses, so "As-Seeb"
    // and "as seeb" contend for one lock.
    await lockIdentities(db, [
      ...(query.plotNumber && query.wilayat
        ? [
            Prisma.sql`'property:plot:' || ecms_normalize_plot(${query.plotNumber}) || '|' || ecms_normalize_place(${query.wilayat})`,
          ]
        : []),
      ...(query.surveyReference
        ? [Prisma.sql`'property:survey:' || ecms_normalize_identifier(${query.surveyReference})`]
        : []),
    ]);
  }

  if (query.plotNumber && query.wilayat) {
    parts.push(Prisma.sql`
      SELECT id, name, reference, client_id, 'plotNumber' AS field, NULL::float4 AS similarity
      FROM property
      WHERE archived_at IS NULL AND plot_number IS NOT NULL AND wilayat IS NOT NULL
        AND ecms_normalize_plot(plot_number) = ecms_normalize_plot(${query.plotNumber})
        AND ecms_normalize_place(wilayat) = ecms_normalize_place(${query.wilayat})
        ${skip}`);
  }
  if (query.surveyReference) {
    parts.push(Prisma.sql`
      SELECT id, name, reference, client_id, 'surveyReference' AS field, NULL::float4 AS similarity
      FROM property
      WHERE archived_at IS NULL AND survey_reference IS NOT NULL
        AND ecms_normalize_identifier(survey_reference)
            = ecms_normalize_identifier(${query.surveyReference})
        ${skip}`);
  }
  if (query.name && query.clientId) {
    parts.push(Prisma.sql`
      SELECT id, name, reference, client_id, 'name' AS field,
             similarity(ecms_normalize_name(name), ecms_normalize_name(${query.name})) AS similarity
      FROM property
      WHERE archived_at IS NULL AND client_id = ${query.clientId}::uuid
        AND ecms_normalize_name(name) % ecms_normalize_name(${query.name})
        AND similarity(ecms_normalize_name(name), ecms_normalize_name(${query.name}))
            >= ${NAME_SIMILARITY_THRESHOLD}
        ${skip}`);
  }

  if (parts.length === 0) return [];
  const rows = await db.$queryRaw<Row[]>(Prisma.join(parts, ' UNION ALL '));
  return merge(rows, PROPERTY_EXACT_FIELDS);
}

/**
 * The server-side half of the rule: an identity match stops the write unless
 * the caller has chosen to override it. Returns the matches that were
 * overridden, for the audit entry; the permission to override is checked by
 * the controller before this is reached.
 *
 * Likeness matches never block here — they are shown to the user before
 * saving, and dismissing them needs nothing beyond permission to create.
 */
export function refuseUnlessOverridden(
  matches: readonly DuplicateMatch[],
  override: DuplicateOverride | undefined,
  describe: (match: DuplicateMatch) => string,
): { reason: string; matchedIds: string[] } | null {
  const exact = matches.filter((m) => m.strength === 'EXACT');
  if (exact.length === 0) return null;
  if (override) return { reason: override.reason, matchedIds: exact.map((m) => m.id) };

  throw appError('DUPLICATE_SUSPECTED', {
    fields: exact.flatMap((m) =>
      m.matchedOn
        .filter((field) => field !== 'name' && field !== 'phone')
        .map((field) => ({ field, reason: describe(m) })),
    ),
    context: { matched_ids: exact.map((m) => m.id) },
  });
}

@Injectable()
export class DuplicateService {
  constructor(private readonly prisma: PrismaService) {}

  clients(query: ClientDuplicateQuery): Promise<DuplicateMatch[]> {
    return findClientDuplicates(this.prisma, query);
  }

  properties(query: PropertyDuplicateQuery): Promise<DuplicateMatch[]> {
    return findPropertyDuplicates(this.prisma, query);
  }
}
