import { describe, expect, it } from 'vitest';

import { coordinateIssues, omanrealMapUrl, propertyToWgs84 } from './geo';

describe('propertyToWgs84', () => {
  it('returns null when any input is missing', () => {
    expect(propertyToWgs84(null, 2609085, 'UTM_ZONE_40N')).toBeNull();
    expect(propertyToWgs84(643459, null, 'UTM_ZONE_40N')).toBeNull();
    expect(propertyToWgs84(643459, 2609085, null)).toBeNull();
  });

  it('returns null for an unknown projection type', () => {
    expect(propertyToWgs84(643459, 2609085, 'NOT_A_REAL_PROJECTION')).toBeNull();
  });

  it('accepts Prisma Decimal-like values (anything with toString())', () => {
    const decimalish = (value: number) => ({ toString: () => String(value) });
    const result = propertyToWgs84(decimalish(643459.29), decimalish(2609085.48), 'UTM_ZONE_40N');
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeCloseTo(23.5859, 3);
    expect(result!.longitude).toBeCloseTo(58.4059, 3);
  });

  /**
   * UTM_ZONE_40N has no datum shift (`+datum=WGS84`), so this round-trips
   * exactly by construction — it proves the zone/function wiring (no
   * transposed lat/lng, no wrong-zone bug), independent of any question about
   * Oman's historical survey datum.
   *
   * Reference point: central Muscat, ~23.5859N 58.4059E (a public,
   * well-known coordinate, not survey-specific).
   */
  it('round-trips a known WGS84 UTM zone 40N point', () => {
    const result = propertyToWgs84(643459.2886993461, 2609085.480326535, 'UTM_ZONE_40N');
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeCloseTo(23.5859, 4);
    expect(result!.longitude).toBeCloseTo(58.4059, 4);
  });

  /**
   * CLARKE_1880_ZONE_40 (Fahud 1955 datum, EPSG:3440) applies a real 7
   * parameter datum shift on top of the UTM projection, so this cannot
   * round-trip to the same degree of precision as the WGS84-native zone —
   * instead this only checks the shifted result still lands within Oman's
   * rough geographic bounds, as a smoke test against gross errors (wrong
   * hemisphere, transposed axes, wrong zone).
   *
   * NOT independently verified against a real, known plot — the datum
   * mapping (Fahud 1955 for the "old projection" options) was confirmed by
   * the product owner but the exact transform has only been checked against
   * epsg.io's published parameters, not field-tested against a known
   * real-world survey point. Replace this with a real reference point as
   * soon as one is available.
   */
  it('keeps a Fahud-datum (Clarke 1880 Zone 40) conversion within Oman', () => {
    const result = propertyToWgs84(648392, 2601336, 'CLARKE_1880_ZONE_40');
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeGreaterThan(16);
    expect(result!.latitude).toBeLessThan(27);
    expect(result!.longitude).toBeGreaterThan(52);
    expect(result!.longitude).toBeLessThan(60);
  });
});

describe('omanrealMapUrl', () => {
  it('builds the omanreal.com map link', () => {
    expect(omanrealMapUrl(23.456444, 58.402353)).toBe(
      'https://omanreal.com/Map?zoom=8&lat=23.456444&lng=58.402353',
    );
  });

  it('returns null without coordinates', () => {
    expect(omanrealMapUrl(null, 58.4)).toBeNull();
    expect(omanrealMapUrl(23.4, undefined)).toBeNull();
  });
});

describe('coordinateIssues', () => {
  it('accepts all-blank and a valid Oman point', () => {
    expect(coordinateIssues(null, null, null)).toEqual([]);
    expect(coordinateIssues(643459, 2609085, 'UTM_ZONE_40N')).toEqual([]);
  });

  it('flags the missing fields of a partial set', () => {
    const issues = coordinateIssues(643459, null, null);
    expect(issues.map((i) => i.field)).toEqual(['northing', 'projectionType']);
  });

  it('flags a point outside Oman', () => {
    expect(coordinateIssues(1, 1, 'UTM_ZONE_40N')).toHaveLength(1);
  });
});
