import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { latLngToCell } from 'h3-js';
import { z } from 'zod';

/**
 * Geo API contract (enhancement plan P3-6, §22.12).
 *
 * Response schemas for the geo endpoints:
 *   GET /api/geo/events            — events with resolved locations
 *   GET /api/geo/exposures         — entity geo exposures
 *   GET /api/geo/flows             — trade / supply flows
 *   GET /api/entities/:key/geo-exposure
 *   GET /api/events/:id/locations
 *   GET /api/geo/tiles/{z}/{x}/{y}.mvt   (binary; not modelled here)
 *
 * Hard rules (Geo gates):
 *   - false-precision gate: an `exact` marker must declare an uncertainty radius,
 *     and every marker carries an evidence locator (map item -> source traceable).
 *   - an exposure ratio may never drop its denominator (matches migration 035).
 */

const dateTimeSchema = z.string().datetime();
const evidenceLocatorSchema = z
  .object({
    geoEntityRevisionId: z
      .union([z.number().int().positive(), z.string().trim().min(1)])
      .optional(),
    sourceRevisionId: z.union([z.number().int().positive(), z.string().trim().min(1)]),
    rawObjectId: z.union([z.number().int().positive(), z.string().trim().min(1)]).optional(),
    sourceId: z.string().trim().min(1).optional(),
    span: z
      .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
      .refine(([start, end]) => end >= start, 'evidence span end must not precede start')
      .optional(),
  })
  .strict();

export const geoKindSchema = z.enum([
  'country',
  'admin_area',
  'city',
  'facility',
  'region',
  'point_of_interest',
]);

export const precisionClassSchema = z.enum([
  'exact',
  'approximate',
  'admin_area',
  'country',
  'unknown',
]);

const longitudeSchema = z.number().gte(-180).lte(180);
const latitudeSchema = z.number().gte(-90).lte(90);

export const geoMarkerSchema = z
  .object({
    geoEntityKey: z.string().trim().min(1),
    label: z.string().trim().min(1),
    geoKind: geoKindSchema,
    precisionClass: precisionClassSchema,
    longitude: longitudeSchema,
    latitude: latitudeSchema,
    uncertaintyRadiusKm: z.number().nonnegative().optional(),
    // Every geo item must be traceable back to its source (§22.15).
    evidenceLocator: evidenceLocatorSchema.optional(),
  })
  .superRefine((value, context) => {
    // Every geo item must be traceable back to its source (§22.15).
    if (value.evidenceLocator === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'evidence locator is required (every geo item must be traceable)',
        path: ['evidenceLocator'],
      });
    }
    // False-precision gate: an 'exact' marker must state its uncertainty so the
    // UI can draw an honest halo instead of an over-confident pin.
    if (
      value.precisionClass === 'exact' &&
      (value.uncertaintyRadiusKm === undefined || value.uncertaintyRadiusKm <= 0)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'exact precision marker must declare a positive uncertainty radius (false-precision gate)',
        path: ['uncertaintyRadiusKm'],
      });
    }
  });

export type GeoMarker = z.infer<typeof geoMarkerSchema>;

const positionSchema = z.tuple([longitudeSchema, latitudeSchema]);
type Position = z.infer<typeof positionSchema>;

function orientation(first: Position, second: Position, third: Position): number {
  return (
    (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0])
  );
}

function pointOnSegment(point: Position, start: Position, end: Position): boolean {
  return (
    orientation(start, end, point) === 0 &&
    point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1])
  );
}

function segmentsIntersect(
  firstStart: Position,
  firstEnd: Position,
  secondStart: Position,
  secondEnd: Position,
): boolean {
  const firstSide = orientation(firstStart, firstEnd, secondStart);
  const secondSide = orientation(firstStart, firstEnd, secondEnd);
  const thirdSide = orientation(secondStart, secondEnd, firstStart);
  const fourthSide = orientation(secondStart, secondEnd, firstEnd);
  if (firstSide === 0 && pointOnSegment(secondStart, firstStart, firstEnd)) return true;
  if (secondSide === 0 && pointOnSegment(secondEnd, firstStart, firstEnd)) return true;
  if (thirdSide === 0 && pointOnSegment(firstStart, secondStart, secondEnd)) return true;
  if (fourthSide === 0 && pointOnSegment(firstEnd, secondStart, secondEnd)) return true;
  return firstSide * secondSide < 0 && thirdSide * fourthSide < 0;
}

function ringSelfIntersects(ring: Position[]): boolean {
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      const adjacent = second === first + 1 || (first === 0 && second === segmentCount - 1);
      if (adjacent) continue;
      if (segmentsIntersect(ring[first]!, ring[first + 1]!, ring[second]!, ring[second + 1]!)) {
        return true;
      }
    }
  }
  return false;
}

function ringsIntersect(first: Position[], second: Position[]): boolean {
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      if (
        segmentsIntersect(
          first[firstIndex]!,
          first[firstIndex + 1]!,
          second[secondIndex]!,
          second[secondIndex + 1]!,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function pointInsideRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 2; index < ring.length - 1; previous = index++) {
    const currentPoint = ring[index]!;
    const previousPoint = ring[previous]!;
    const crossesLatitude = currentPoint[1] > point[1] !== previousPoint[1] > point[1];
    const crossingLongitude =
      ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) +
      currentPoint[0];
    if (crossesLatitude && point[0] < crossingLongitude) inside = !inside;
  }
  return inside;
}

const lineStringCoordinatesSchema = z.array(positionSchema).min(2);
const linearRingSchema = z
  .array(positionSchema)
  .min(4)
  .superRefine((ring, context) => {
    const first = ring[0];
    const last = ring.at(-1);
    if (!first || !last) return;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      context.addIssue({
        code: 'custom',
        message: 'GeoJSON linear ring must be closed',
        path: [ring.length - 1],
      });
    }
    let twiceArea = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const current = ring[index]!;
      const next = ring[index + 1]!;
      twiceArea += current[0] * next[1] - next[0] * current[1];
    }
    if (twiceArea === 0) {
      context.addIssue({
        code: 'custom',
        message: 'GeoJSON linear ring must enclose a non-zero area',
      });
    }
    if (ringSelfIntersects(ring)) {
      context.addIssue({
        code: 'custom',
        message: 'GeoJSON linear ring must not self-intersect',
      });
    }
  });
const polygonCoordinatesSchema = z
  .array(linearRingSchema)
  .min(1)
  .superRefine((rings, context) => {
    const exterior = rings[0];
    if (!exterior) return;
    for (let index = 1; index < rings.length; index += 1) {
      const hole = rings[index]!;
      if (ringsIntersect(exterior, hole) || !pointInsideRing(hole[0]!, exterior)) {
        context.addIssue({
          code: 'custom',
          message: 'GeoJSON Polygon hole must be strictly contained by its exterior ring',
          path: [index],
        });
      }
      for (let previous = 1; previous < index; previous += 1) {
        const otherHole = rings[previous]!;
        if (
          ringsIntersect(otherHole, hole) ||
          pointInsideRing(hole[0]!, otherHole) ||
          pointInsideRing(otherHole[0]!, hole)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'GeoJSON Polygon holes must not overlap or contain one another',
            path: [index],
          });
        }
      }
    }
  });
const multiPolygonCoordinatesSchema = z.array(polygonCoordinatesSchema).min(1);

const geoGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: positionSchema }),
  z.object({ type: z.literal('LineString'), coordinates: lineStringCoordinatesSchema }),
  z.object({ type: z.literal('Polygon'), coordinates: polygonCoordinatesSchema }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: multiPolygonCoordinatesSchema }),
]);

const POINT_COORDINATE_TOLERANCE = 1e-9;

export const geoFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    geometry: geoGeometrySchema,
    properties: geoMarkerSchema,
  })
  .superRefine((feature, context) => {
    if (
      feature.geometry.type === 'Point' &&
      (Math.abs(feature.geometry.coordinates[0] - feature.properties.longitude) >
        POINT_COORDINATE_TOLERANCE ||
        Math.abs(feature.geometry.coordinates[1] - feature.properties.latitude) >
          POINT_COORDINATE_TOLERANCE)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Point geometry must match marker longitude and latitude',
        path: ['geometry', 'coordinates'],
      });
    }
  });

export type GeoFeature = z.infer<typeof geoFeatureSchema>;

export const geoFeatureCollectionSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(geoFeatureSchema),
  })
  .superRefine((collection, context) => {
    const keys = collection.features.map((feature) => feature.properties.geoEntityKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        message: 'GeoJSON feature collection must not repeat a geo entity key',
        path: ['features'],
      });
    }
  });

export type GeoFeatureCollection = z.infer<typeof geoFeatureCollectionSchema>;

export const geoSnapshotAvailabilitySchema = z.enum([
  'available',
  'partial',
  'empty',
  'unavailable',
  'stale',
  'error',
]);

const geoMvtDescriptorSchema = z.discriminatedUnion('available', [
  z.object({
    available: z.literal(true),
    contentType: z.literal('application/vnd.mapbox-vector-tile'),
    minZoom: z.number().int().min(0).max(22),
    maxZoom: z.number().int().min(0).max(22),
    urlTemplate: z.string().min(1),
  }),
  z.object({
    available: z.literal(false),
    contentType: z.literal('application/vnd.mapbox-vector-tile'),
    minZoom: z.number().int().min(0).max(22),
    maxZoom: z.number().int().min(0).max(22),
    urlTemplate: z.null(),
  }),
]);

const h3CellSchema = z
  .object({
    cellId: z.string().regex(/^[0-9a-f]{15}$/),
    featureCount: z.number().int().positive(),
    geoEntityKeys: z.array(z.string().min(1)).min(1),
  })
  .superRefine((cell, context) => {
    const uniqueKeys = new Set(cell.geoEntityKeys);
    if (uniqueKeys.size !== cell.geoEntityKeys.length || cell.featureCount !== uniqueKeys.size) {
      context.addIssue({
        code: 'custom',
        message: 'H3 feature count must equal its unique geo entity keys',
        path: ['geoEntityKeys'],
      });
    }
  });

export type GeoSnapshotSealMaterial = Readonly<{
  version: 1;
  knownAt: string;
  validAt: string;
  sourceAsOf: string | null;
  availability: z.infer<typeof geoSnapshotAvailabilitySchema>;
  geojson: GeoFeatureCollection;
  mvt: Readonly<{
    contentType: 'application/vnd.mapbox-vector-tile';
    minZoom: number;
    maxZoom: number;
  }>;
  h3: Readonly<{
    resolution: number;
    cells: ReadonlyArray<z.infer<typeof h3CellSchema>>;
  }>;
  rejected: Readonly<{
    count: number;
    reasons: ReadonlyArray<Readonly<{ code: string; count: number }>>;
  }>;
  limitations: readonly string[];
}>;

function compareCanonicalText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareCanonicalText)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function computeGeoSnapshotDigest(material: GeoSnapshotSealMaterial): string {
  const canonical = stableJson({
    version: material.version,
    knownAt: material.knownAt,
    validAt: material.validAt,
    sourceAsOf: material.sourceAsOf,
    availability: material.availability,
    geojson: material.geojson,
    h3: material.h3,
    rejected: material.rejected,
    limitations: material.limitations,
    mvt: {
      contentType: material.mvt.contentType,
      minZoom: material.mvt.minZoom,
      maxZoom: material.mvt.maxZoom,
    },
  });
  return bytesToHex(sha256(utf8ToBytes(canonical)));
}

export function deriveGeoSnapshotId(digest: string): string {
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('Geo snapshot digest is invalid');
  return `geo_${digest.slice(0, 24)}`;
}

export const geoSnapshotSchema = z
  .object({
    version: z.literal(1),
    snapshotId: z.string().regex(/^geo_[0-9a-f]{24}$/),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    generatedAt: dateTimeSchema,
    knownAt: dateTimeSchema,
    validAt: dateTimeSchema,
    sourceAsOf: dateTimeSchema.nullable(),
    availability: geoSnapshotAvailabilitySchema,
    geojson: geoFeatureCollectionSchema,
    mvt: geoMvtDescriptorSchema.superRefine((descriptor, context) => {
      if (descriptor.maxZoom < descriptor.minZoom) {
        context.addIssue({
          code: 'custom',
          message: 'MVT max zoom must not precede min zoom',
          path: ['maxZoom'],
        });
      }
    }),
    h3: z.object({
      resolution: z.number().int().min(0).max(15),
      cells: z.array(h3CellSchema),
    }),
    rejected: z.object({
      count: z.number().int().nonnegative(),
      reasons: z.array(
        z.object({
          code: z.string().regex(/^[a-z][a-z0-9_]*$/),
          count: z.number().int().positive(),
        }),
      ),
    }),
    limitations: z.array(z.string().min(1)),
  })
  .superRefine((snapshot, context) => {
    const featureCount = snapshot.geojson.features.length;
    const contentState = ['available', 'partial', 'stale'].includes(snapshot.availability);
    snapshot.geojson.features.forEach((feature, index) => {
      if (feature.properties.evidenceLocator?.geoEntityRevisionId === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'sealed geo feature requires exact geo entity revision lineage',
          path: ['geojson', 'features', index, 'properties', 'evidenceLocator'],
        });
      }
    });
    if (contentState && (featureCount === 0 || snapshot.sourceAsOf === null)) {
      context.addIssue({
        code: 'custom',
        message: 'content-bearing geo snapshot requires features and sourceAsOf',
        path: ['availability'],
      });
    }
    if (!contentState && featureCount > 0) {
      context.addIssue({
        code: 'custom',
        message: 'non-content geo snapshot must not expose features',
        path: ['geojson', 'features'],
      });
    }
    if (snapshot.availability === 'partial' && snapshot.rejected.count === 0) {
      context.addIssue({
        code: 'custom',
        message: 'partial geo snapshot requires rejected rows',
        path: ['rejected', 'count'],
      });
    }
    if (contentState && snapshot.availability !== 'partial' && snapshot.rejected.count > 0) {
      context.addIssue({
        code: 'custom',
        message: 'non-partial content snapshot must not carry rejected rows',
        path: ['rejected', 'count'],
      });
    }
    if (snapshot.mvt.available !== contentState || snapshot.h3.cells.length > featureCount) {
      context.addIssue({
        code: 'custom',
        message: 'geo representations must match snapshot content availability',
        path: ['mvt'],
      });
    }
    if (
      snapshot.mvt.available &&
      (!snapshot.mvt.urlTemplate.includes(`snapshot=${snapshot.snapshotId}`) ||
        !snapshot.mvt.urlTemplate.includes('knownAt=') ||
        !snapshot.mvt.urlTemplate.includes('validAt='))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'MVT descriptor must bind snapshot id, validAt, and knownAt',
        path: ['mvt', 'urlTemplate'],
      });
    }
    const cellIds = snapshot.h3.cells.map((cell) => cell.cellId);
    if (new Set(cellIds).size !== cellIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'H3 cells must be unique',
        path: ['h3', 'cells'],
      });
    }
    const featureKeys = snapshot.geojson.features.map((feature) => feature.properties.geoEntityKey);
    const h3Keys = snapshot.h3.cells.flatMap((cell) => cell.geoEntityKeys);
    if (
      h3Keys.length !== featureKeys.length ||
      new Set(h3Keys).size !== h3Keys.length ||
      h3Keys.some((key) => !featureKeys.includes(key))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'H3 membership must exactly cover the sealed feature set',
        path: ['h3', 'cells'],
      });
    }
    const h3CellByGeoEntityKey = new Map<string, { cellId: string; index: number }>();
    snapshot.h3.cells.forEach((cell, index) => {
      cell.geoEntityKeys.forEach((key) =>
        h3CellByGeoEntityKey.set(key, { cellId: cell.cellId, index }),
      );
    });
    snapshot.geojson.features.forEach((feature) => {
      const { geoEntityKey, latitude, longitude } = feature.properties;
      const assignment = h3CellByGeoEntityKey.get(geoEntityKey);
      const expectedCellId = latLngToCell(latitude, longitude, snapshot.h3.resolution);
      if (assignment && assignment.cellId !== expectedCellId) {
        context.addIssue({
          code: 'custom',
          message: 'H3 cell must contain its sealed feature position at the declared resolution',
          path: ['h3', 'cells', assignment.index, 'cellId'],
        });
      }
    });
    const rejectedCount = snapshot.rejected.reasons.reduce((total, item) => total + item.count, 0);
    if (rejectedCount !== snapshot.rejected.count) {
      context.addIssue({
        code: 'custom',
        message: 'geo rejection count must equal reason counts',
        path: ['rejected', 'count'],
      });
    }
    const expectedDigest = computeGeoSnapshotDigest(snapshot);
    if (snapshot.digest !== expectedDigest) {
      context.addIssue({
        code: 'custom',
        message: 'geo snapshot digest must bind the canonical payload',
        path: ['digest'],
      });
    }
    if (
      /^[0-9a-f]{64}$/.test(snapshot.digest) &&
      snapshot.snapshotId !== deriveGeoSnapshotId(snapshot.digest)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'geo snapshot id must derive from its digest',
        path: ['snapshotId'],
      });
    }
  });

export type GeoSnapshot = z.infer<typeof geoSnapshotSchema>;

export const geoEventLocationSchema = z.object({
  eventId: z.string().min(1),
  role: z.enum(['source', 'actual', 'jurisdiction', 'target', 'affected']),
  marker: geoMarkerSchema,
  occurredAt: dateTimeSchema.optional(),
});

export const geoExposureItemSchema = z
  .object({
    geoEntityKey: z.string().min(1),
    exposureType: z.enum(['REVENUE', 'ASSET', 'PRODUCTION', 'SUPPLY', 'EMPLOYMENT', 'OTHER']),
    ratio: z.number().finite().min(0).max(1).optional(),
    denominator: z.number().finite().positive().optional(),
    denominatorUnit: z.string().optional(),
    asOf: dateTimeSchema,
    evidenceLocator: evidenceLocatorSchema,
  })
  .superRefine((value, context) => {
    // Matches migration 035: a ratio may only exist alongside a positive
    // denominator. A bare ratio is false precision.
    if (value.ratio !== undefined && value.denominator === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'geo exposure ratio requires a positive denominator (no bare ratio)',
        path: ['denominator'],
      });
    }
  });

export const geoExposureResponseSchema = z.object({
  entityKey: z.string().min(1),
  exposures: z.array(geoExposureItemSchema),
});

export type GeoExposureResponse = z.infer<typeof geoExposureResponseSchema>;

export const geoFlowSchema = z.object({
  flowKey: z.string().min(1),
  origin: geoMarkerSchema,
  destination: geoMarkerSchema,
  flowKind: z.enum(['trade', 'supply', 'sanction', 'disaster']),
  transportMode: z.enum(['sea', 'air', 'rail', 'road', 'pipeline']).optional(),
  evidenceLocator: evidenceLocatorSchema,
});

export type GeoFlow = z.infer<typeof geoFlowSchema>;

export type GeoMarkerParse = { ok: true; marker: GeoMarker } | { ok: false; reason: string };

/** Parse + validate a marker, returning a fail-closed result with a reason. */
export function parseGeoMarker(input: unknown): GeoMarkerParse {
  const result = geoMarkerSchema.safeParse(input);
  if (result.success) {
    return { ok: true, marker: result.data };
  }
  const issue = result.error.issues[0];
  return { ok: false, reason: issue?.message ?? 'invalid geo marker' };
}
