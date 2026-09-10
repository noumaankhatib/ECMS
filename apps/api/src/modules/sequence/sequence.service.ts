import { Injectable } from '@nestjs/common';

import type { Tx } from '../../shared/database/transaction';

import type { SequenceResult, SequenceType } from './sequence.types';

/**
 * Formatters, not stored logic — the same "changing this is a data change"
 * posture the permission matrix already takes (docs/phase-1-plan.md §5).
 * `value` is padded to at least 3 digits as a starting convention, not a
 * confirmed client requirement (docs/phase-4-plan.md §5) — easy to change
 * here without touching a caller.
 */
const FORMATTERS: Record<SequenceType, (year: number, value: number) => string> = {
  PLANNING_PROJECT: (year, value) => `${twoDigitYear(year)}.P.${pad(value)}`,
  SUPERVISION_PROJECT: (year, value) => `${twoDigitYear(year)}.S.${pad(value)}`,
};

function twoDigitYear(year: number): string {
  return String(year % 100).padStart(2, '0');
}

function pad(value: number): string {
  return String(value).padStart(3, '0');
}

@Injectable()
export class SequenceService {
  /**
   * Reserves the next number for `type` in `year`, inside the caller's own
   * transaction — the reservation and whatever record it names commit or
   * fail together, so a number is never burned by a create that then fails,
   * and never re-issued to someone else in the meantime either.
   *
   * A single `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` is the one
   * raw-SQL statement in this codebase, used deliberately here: it is the
   * only way to guarantee "read the last value and advance it" happens as
   * one atomic step — exactly the guarantee two concurrent project creations
   * in the same (type, year) need, the same way the drawing-revision
   * supersede-then-insert shape (docs/phase-3-plan.md §5) guarantees no two
   * rows are ever both "current" at once.
   */
  async next(
    tx: Tx,
    type: SequenceType,
    year: number = new Date().getUTCFullYear(),
  ): Promise<SequenceResult> {
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO sequence_counter (sequence_type, year, last_value)
      VALUES (${type}, ${year}, 1)
      ON CONFLICT (sequence_type, year)
      DO UPDATE SET last_value = sequence_counter.last_value + 1
      RETURNING last_value
    `;

    const value = rows[0]?.last_value;
    if (value === undefined) {
      throw new Error(`SequenceService.next produced no row for ${type}/${String(year)}`);
    }

    return { value, code: FORMATTERS[type](year, value) };
  }
}
