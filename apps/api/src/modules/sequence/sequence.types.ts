/**
 * Every series this system mints a number from. Adding one is adding a
 * literal here and a formatter in `sequence.service.ts` — never a schema
 * change (docs/phase-4-plan.md §4).
 */
export const SEQUENCE_TYPES = ['PLANNING_PROJECT', 'SUPERVISION_PROJECT'] as const;
export type SequenceType = (typeof SEQUENCE_TYPES)[number];

export interface SequenceResult {
  readonly value: number;
  readonly code: string;
}
