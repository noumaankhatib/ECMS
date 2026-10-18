import type { Prisma } from '@prisma/client';

/**
 * Splits what someone typed into words. Every word must match somewhere, so
 * "hilal seeb" finds a record whose client is Hilal and whose village is Seeb,
 * which a single contains("hilal seeb") never would. Capped so a pasted
 * paragraph cannot build an enormous query.
 */
export function searchTerms(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);
}

const insensitive = 'insensitive' as const;

/** One word against every part of a client's name and identifiers. */
export function clientMatchesTerm(term: string): Prisma.ClientWhereInput {
  const part = { contains: term, mode: insensitive };
  const phoneFragment = term.replace(/\D+/g, '');
  return {
    OR: [
      { firstName: part },
      { fatherName: part },
      { grandfatherName: part },
      { surname: part },
      { reference: part },
      { crNumber: part },
      { civilId: part },
      { mobileNumber: part },
      ...(phoneFragment.length >= 3 ? [{ mobileNumberNormalized: { contains: phoneFragment } }] : []),
    ],
  };
}

/** The individual conditions one word is tried against on a property. */
export function propertyTermConditions(term: string): Prisma.PropertyWhereInput[] {
  const part = { contains: term, mode: insensitive };
  return [
    { name: part },
    { reference: part },
    { plotNumber: part },
    { surveyReference: part },
    { wilayat: part },
    { village: part },
    { city: part },
  ];
}

/** One word against a property's name, plot, survey reference and location. */
export function propertyMatchesTerm(term: string): Prisma.PropertyWhereInput {
  return { OR: propertyTermConditions(term) };
}
