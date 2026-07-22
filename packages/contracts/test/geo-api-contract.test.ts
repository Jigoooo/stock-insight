import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  geoExposureResponseSchema,
  geoFeatureSchema,
  parseGeoMarker,
  precisionClassSchema,
} from '../src/geo-api-contract.ts';

const validMarker = {
  geoEntityKey: 'geo:country:KR',
  label: '대한민국',
  geoKind: 'country',
  precisionClass: 'country',
  longitude: 127.5,
  latitude: 36.5,
  uncertaintyRadiusKm: 50,
  evidenceLocator: { sourceRevisionId: 12, span: [0, 4] },
};

describe('P3-WA2 geo API contract', () => {
  it('exposes the geo precision-class vocabulary that matches the geo layer (§22)', () => {
    assert.deepEqual(
      [...precisionClassSchema.options].sort(),
      ['admin_area', 'approximate', 'country', 'exact', 'unknown'].sort(),
    );
  });

  it('accepts a marker that carries uncertainty + evidence', () => {
    const parsed = parseGeoMarker(validMarker);
    assert.equal(parsed.ok, true);
  });

  it('rejects a false-precision marker: exact precision with no uncertainty radius', () => {
    const bad = { ...validMarker, precisionClass: 'exact', uncertaintyRadiusKm: undefined };
    const parsed = parseGeoMarker(bad);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.reason, /uncertainty|precision|false.?precision/i);
    }
  });

  it('rejects a marker with no evidence locator (every geo item must be traceable)', () => {
    const bad = { ...validMarker, evidenceLocator: undefined };
    const parsed = parseGeoMarker(bad);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.reason, /evidence/i);
    }
  });

  it('rejects empty or unidentifiable evidence locators', () => {
    assert.equal(parseGeoMarker({ ...validMarker, evidenceLocator: {} }).ok, false);
    assert.equal(
      parseGeoMarker({ ...validMarker, evidenceLocator: { note: '근거 있음' } }).ok,
      false,
    );
  });

  it('rejects malformed or out-of-range GeoJSON coordinates', () => {
    assert.throws(() =>
      geoFeatureSchema.parse({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [[127.5, 36.5]] },
        properties: validMarker,
      }),
    );
    assert.throws(() =>
      geoFeatureSchema.parse({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [127.5, 36.5],
            [181, 37],
          ],
        },
        properties: validMarker,
      }),
    );
  });

  it('rejects a Point geometry that contradicts its marker coordinates', () => {
    assert.throws(() =>
      geoFeatureSchema.parse({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [129, 35] },
        properties: validMarker,
      }),
    );
  });

  it('rejects open, degenerate or self-intersecting Polygon rings and exterior holes', () => {
    for (const coordinates of [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [3, 3],
        [0, 3],
        [3, 0],
        [4, 2],
        [0, 0],
      ],
    ]) {
      assert.throws(() =>
        geoFeatureSchema.parse({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coordinates] },
          properties: validMarker,
        }),
      );
    }

    assert.throws(() =>
      geoFeatureSchema.parse({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [4, 0],
              [4, 4],
              [0, 4],
              [0, 0],
            ],
            [
              [5, 5],
              [6, 5],
              [6, 6],
              [5, 6],
              [5, 5],
            ],
          ],
        },
        properties: validMarker,
      }),
    );
  });

  it('rejects exposure ratios outside 0..1 and non-positive denominators', () => {
    const exposure = {
      entityKey: 'KR:005930',
      exposures: [
        {
          geoEntityKey: 'geo:country:KR',
          exposureType: 'REVENUE',
          ratio: 0.6,
          denominator: 1000,
          asOf: '2026-07-20T00:00:00.000Z',
          evidenceLocator: { sourceRevisionId: 1 },
        },
      ],
    };
    for (const [ratio, denominator] of [
      [-0.1, 1000],
      [1.1, 1000],
      [0.6, -1],
    ]) {
      const bad = structuredClone(exposure);
      bad.exposures[0]!.ratio = ratio;
      bad.exposures[0]!.denominator = denominator;
      assert.throws(() => geoExposureResponseSchema.parse(bad));
    }
  });

  it('rejects out-of-range coordinates', () => {
    assert.equal(parseGeoMarker({ ...validMarker, longitude: 999 }).ok, false);
    assert.equal(parseGeoMarker({ ...validMarker, latitude: -100 }).ok, false);
  });

  it('validates a GeoJSON-style feature wrapping a marker', () => {
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [127.5, 36.5] },
      properties: validMarker,
    };
    assert.doesNotThrow(() => geoFeatureSchema.parse(feature));
  });

  it('requires a geo exposure response ratio to keep its denominator (no bare ratio)', () => {
    const withDenominator = {
      entityKey: 'KR:005930',
      exposures: [
        {
          geoEntityKey: 'geo:country:KR',
          exposureType: 'REVENUE',
          ratio: 0.6,
          denominator: 1000,
          asOf: '2026-07-20T00:00:00.000Z',
          evidenceLocator: { sourceRevisionId: 1 },
        },
      ],
    };
    assert.doesNotThrow(() => geoExposureResponseSchema.parse(withDenominator));

    const bareRatio = structuredClone(withDenominator);
    // A ratio without a denominator is false precision and must be rejected.
    delete (bareRatio.exposures[0] as Record<string, unknown>).denominator;
    assert.throws(() => geoExposureResponseSchema.parse(bareRatio));
  });
});
