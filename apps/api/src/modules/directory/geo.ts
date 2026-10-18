import type { ProjectionType } from '@ecms/contracts';
import proj4 from 'proj4';


/**
 * Proj4 definitions pulled directly from epsg.io, not hand-derived — a wrong
 * datum-shift constant here would silently place a property in the wrong
 * real-world location.
 *
 * The "old projection" options are grid coordinates in the Fahud 1955 datum
 * (Oman's historical survey datum), not WGS84, so they need the 7-parameter
 * Helmert shift in `+towgs84` on top of the UTM projection itself.
 */
const PROJ4_DEFINITIONS: Record<ProjectionType, string> = {
  // EPSG:3439 — Fahud / UTM zone 39N
  CLARKE_1880_ZONE_39:
    '+proj=utm +zone=39 +a=6378249.145 +rf=293.465 +towgs84=-180.624,-225.516,173.919,-0.81,-1.898,8.336,16.71006 +units=m +no_defs +type=crs',
  // EPSG:3440 — Fahud / UTM zone 40N
  CLARKE_1880_ZONE_40:
    '+proj=utm +zone=40 +a=6378249.145 +rf=293.465 +towgs84=-180.624,-225.516,173.919,-0.81,-1.898,8.336,16.71006 +units=m +no_defs +type=crs',
  // EPSG:32639 — WGS 84 / UTM zone 39N
  UTM_ZONE_39N: '+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs',
  // EPSG:32640 — WGS 84 / UTM zone 40N
  UTM_ZONE_40N: '+proj=utm +zone=40 +datum=WGS84 +units=m +no_defs',
};

/** Prisma's `Decimal` (and anything else stringifiable), without importing
 *  `@prisma/client/runtime` into this pure-math module. */
type Decimalish = number | string | { toString(): string };

/**
 * Converts a property's raw survey-grid coordinates to WGS84 latitude and
 * longitude, or returns `null` if any input is missing — never throws.
 */
export function propertyToWgs84(
  easting: Decimalish | null | undefined,
  northing: Decimalish | null | undefined,
  projectionType: string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (easting == null || northing == null || !projectionType) {
    return null;
  }
  const def = PROJ4_DEFINITIONS[projectionType as ProjectionType];
  if (!def) {
    return null;
  }
  const eastingNum = Number(easting);
  const northingNum = Number(northing);
  if (!Number.isFinite(eastingNum) || !Number.isFinite(northingNum)) {
    return null;
  }
  const [longitude, latitude] = proj4(def, 'WGS84', [eastingNum, northingNum]);
  return { latitude, longitude };
}

/** Wide enough to orient, close enough to find the plot on omanreal.com. */
const OMANREAL_MAP_ZOOM = 8;

/** Deep link to a point on omanreal.com's map, or `null` without coordinates. */
export function omanrealMapUrl(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  zoom: number = OMANREAL_MAP_ZOOM,
): string | null {
  if (latitude == null || longitude == null) {
    return null;
  }
  return `https://omanreal.com/Map?zoom=${zoom}&lat=${latitude}&lng=${longitude}`;
}

/** Generous bounding box around Oman, only to catch a wrong projection choice. */
const OMAN_BOUNDS = { minLat: 16.5, maxLat: 26.5, minLng: 51.5, maxLng: 60.0 };

/**
 * Problems with a property's coordinate trio, as `{ field, reason }` issues.
 * Empty when all three are blank, or all three are present and land in Oman.
 */
export function coordinateIssues(
  easting: Decimalish | null | undefined,
  northing: Decimalish | null | undefined,
  projectionType: string | null | undefined,
): { field: string; reason: string }[] {
  const present = [easting != null, northing != null, !!projectionType];
  if (present.every((p) => !p)) {
    return [];
  }
  if (!present.every(Boolean)) {
    const reason = 'Easting, northing and projection type must be entered together.';
    return [
      ['easting', easting],
      ['northing', northing],
      ['projectionType', projectionType],
    ]
      .filter(([, value]) => value == null || value === '')
      .map(([field]) => ({ field: field as string, reason }));
  }
  const wgs84 = propertyToWgs84(easting, northing, projectionType);
  if (
    !wgs84 ||
    wgs84.latitude < OMAN_BOUNDS.minLat ||
    wgs84.latitude > OMAN_BOUNDS.maxLat ||
    wgs84.longitude < OMAN_BOUNDS.minLng ||
    wgs84.longitude > OMAN_BOUNDS.maxLng
  ) {
    return [
      {
        field: 'easting',
        reason: 'These coordinates fall outside Oman — check the values and projection type.',
      },
    ];
  }
  return [];
}
