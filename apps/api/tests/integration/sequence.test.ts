import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { SequenceService } from '../../src/modules/sequence';
import type { PrismaService } from '../../src/shared/database/prisma.service';

/**
 * SequenceService — real, annual-reset numbering (docs/phase-4-plan.md §4).
 *
 * The one property worth proving beyond ordinary CRUD: two callers racing for
 * the same (type, year) never receive the same number. Everything else is
 * the formatter, which is a pure function and needs no database at all.
 */
describe('sequence', () => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env['DATABASE_URL'] as string,
  }) as unknown as PrismaService;

  const sequence = new SequenceService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('formats a supervision-project number as YY.S.NNN, zero-padded', async () => {
    const year = 3000 + Math.floor(Math.random() * 900); // an isolated year, never touched by other tests
    const result = await prisma.$transaction((tx) =>
      sequence.next(tx, 'SUPERVISION_PROJECT', year),
    );

    expect(result.value).toBe(1);
    expect(result.code).toBe(`${String(year % 100).padStart(2, '0')}.S.001`);
  });

  it('formats a planning-project number as YY.P.NNN', async () => {
    const year = 3900 + Math.floor(Math.random() * 90);
    const result = await prisma.$transaction((tx) => sequence.next(tx, 'PLANNING_PROJECT', year));

    expect(result.code).toBe(`${String(year % 100).padStart(2, '0')}.P.001`);
  });

  it('advances by one on each call, within the same year', async () => {
    const year = 4000 + Math.floor(Math.random() * 900);

    const first = await prisma.$transaction((tx) => sequence.next(tx, 'SUPERVISION_PROJECT', year));
    const second = await prisma.$transaction((tx) =>
      sequence.next(tx, 'SUPERVISION_PROJECT', year),
    );
    const third = await prisma.$transaction((tx) => sequence.next(tx, 'SUPERVISION_PROJECT', year));

    expect([first.value, second.value, third.value]).toEqual([1, 2, 3]);
  });

  it('keeps separate counters per type for the same year', async () => {
    const year = 4900 + Math.floor(Math.random() * 90);

    const planning = await prisma.$transaction((tx) => sequence.next(tx, 'PLANNING_PROJECT', year));
    const supervision = await prisma.$transaction((tx) =>
      sequence.next(tx, 'SUPERVISION_PROJECT', year),
    );

    expect(planning.value).toBe(1);
    expect(supervision.value).toBe(1);
  });

  it('never issues the same number twice under concurrent callers', async () => {
    const year = 5000 + Math.floor(Math.random() * 900);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        prisma.$transaction((tx) => sequence.next(tx, 'SUPERVISION_PROJECT', year)),
      ),
    );

    const values = results.map((r) => r.value).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
