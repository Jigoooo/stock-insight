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
    geoEntityKey: z.string().min(1),
    label: z.string().min(1),
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
    if (value.precisionClass === 'exact' && value.uncertaintyRadiusKm === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'exact precision marker must declare an uncertainty radius (false-precision gate)',
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

export const geoFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    geometry: geoGeometrySchema,
    properties: geoMarkerSchema,
  })
  .superRefine((feature, context) => {
    if (
      feature.geometry.type === 'Point' &&
      (feature.geometry.coordinates[0] !== feature.properties.longitude ||
        feature.geometry.coordinates[1] !== feature.properties.latitude)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Point geometry must match marker longitude and latitude',
        path: ['geometry', 'coordinates'],
      });
    }
  });

export type GeoFeature = z.infer<typeof geoFeatureSchema>;

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
