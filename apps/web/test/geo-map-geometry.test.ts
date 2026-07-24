import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectGeometryPositions,
  summarizeGeometryForEvidence,
  unwrapPositionsForMinimumLongitudeSpan,
} from '../src/pages/research-workspace/model/geo-map-geometry.ts';

describe('geo map geometry bounds', () => {
  it('returns every point and line vertex', () => {
    assert.deepEqual(collectGeometryPositions({ type: 'Point', coordinates: [1, 2] }), [[1, 2]]);
    assert.deepEqual(
      collectGeometryPositions({
        type: 'LineString',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      }),
      [
        [1, 2],
        [3, 4],
      ],
    );
  });

  it('returns every polygon and multipolygon ring vertex', () => {
    const ring = [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 0],
    ] as [number, number][];
    assert.deepEqual(collectGeometryPositions({ type: 'Polygon', coordinates: [ring] }), ring);
    assert.deepEqual(
      collectGeometryPositions({
        type: 'MultiPolygon',
        coordinates: [[ring], [ring.map(([longitude, latitude]) => [longitude + 10, latitude])]],
      }),
      [...ring, ...ring.map(([longitude, latitude]) => [longitude + 10, latitude])],
    );
  });

  it('unwraps longitudes onto the minimum arc across the antimeridian', () => {
    const unwrapped = unwrapPositionsForMinimumLongitudeSpan([
      [179, 10],
      [-179, 20],
    ]);
    const longitudes = unwrapped.map(([longitude]) => longitude);
    assert.equal(Math.max(...longitudes) - Math.min(...longitudes), 2);
    assert.deepEqual(
      unwrapped.map(([, latitude]) => latitude),
      [10, 20],
    );
  });

  it('summarizes point coordinates and non-point extent for the semantic fallback', () => {
    assert.match(
      summarizeGeometryForEvidence({ type: 'Point', coordinates: [127.0276, 37.4979] }),
      /점 · 경도 127\.0276° · 위도 37\.4979°/,
    );
    assert.match(
      summarizeGeometryForEvidence({
        type: 'LineString',
        coordinates: [
          [179, 10],
          [-179, 20],
        ],
      }),
      /선 · 좌표 2개 · 경도 폭 2\.00° · 위도 10\.00°~20\.00°/,
    );
  });
});
