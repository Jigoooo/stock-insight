import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeGeoSnapshotDigest,
  deriveGeoSnapshotId,
  geoSnapshotSchema,
} from '../src/geo-api-contract.ts';

const pointFeature = {
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [127.0276, 37.4979] as [number, number] },
  properties: {
    geoEntityKey: 'geo:facility:seoul-fixture',
    label: '서울 검증 위치',
    geoKind: 'facility' as const,
    precisionClass: 'exact' as const,
    longitude: 127.0276,
    latitude: 37.4979,
    uncertaintyRadiusKm: 0.1,
    evidenceLocator: {
      geoEntityRevisionId: 142,
      sourceRevisionId: 42,
      sourceId: 'official-registry',
    },
  },
};

function sealFixture(material: Parameters<typeof computeGeoSnapshotDigest>[0]) {
  const digest = computeGeoSnapshotDigest(material);
  const snapshotId = deriveGeoSnapshotId(digest);
  const contentAvailable = ['available', 'partial', 'stale'].includes(material.availability);
  return {
    ...material,
    snapshotId,
    digest,
    generatedAt: '2026-07-22T05:00:00.000Z',
    mvt: contentAvailable
      ? {
          ...material.mvt,
          available: true as const,
          urlTemplate: `/api/geo/tiles/{z}/{x}/{y}?snapshot=${snapshotId}&validAt=2026-07-22T05%3A00%3A00.000Z&knownAt=2026-07-22T05%3A00%3A00.000Z`,
        }
      : { ...material.mvt, available: false as const, urlTemplate: null },
  };
}

const availableMaterial = {
  version: 1 as const,
  knownAt: '2026-07-22T05:00:00.000Z',
  validAt: '2026-07-22T05:00:00.000Z',
  sourceAsOf: '2026-07-21T15:00:00.000Z',
  availability: 'available' as const,
  geojson: { type: 'FeatureCollection' as const, features: [pointFeature] },
  mvt: {
    contentType: 'application/vnd.mapbox-vector-tile' as const,
    minZoom: 0,
    maxZoom: 14,
  },
  h3: {
    resolution: 3,
    cells: [
      {
        cellId: '8330e1fffffffff',
        featureCount: 1,
        geoEntityKeys: ['geo:facility:seoul-fixture'],
      },
    ],
  },
  rejected: { count: 0, reasons: [] },
  limitations: ['H3는 파생 집계이며 정본 위치가 아닙니다.'],
};

const availableSnapshot = sealFixture(availableMaterial);

describe('sealed geo snapshot contract', () => {
  it('accepts a coherent renderer-neutral GeoJSON/MVT/H3 snapshot', () => {
    assert.equal(geoSnapshotSchema.parse(availableSnapshot).geojson.features.length, 1);
  });

  it('rejects an H3 cell that does not contain the sealed feature position', () => {
    assert.equal(
      geoSnapshotSchema.safeParse(
        sealFixture({
          ...availableMaterial,
          h3: {
            resolution: 3,
            cells: [
              {
                cellId: '832830fffffffff',
                featureCount: 1,
                geoEntityKeys: ['geo:facility:seoul-fixture'],
              },
            ],
          },
        }),
      ).success,
      false,
    );
  });

  it('rejects a sealed feature without an exact geo entity revision id', () => {
    assert.equal(
      geoSnapshotSchema.safeParse(
        sealFixture({
          ...availableMaterial,
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                ...pointFeature,
                properties: {
                  ...pointFeature.properties,
                  evidenceLocator: { sourceRevisionId: 42, sourceId: 'official-registry' },
                },
              },
            ],
          },
        }),
      ).success,
      false,
    );
  });

  it('rejects payload mutation when the sealed digest is unchanged', () => {
    assert.equal(
      geoSnapshotSchema.safeParse({
        ...availableSnapshot,
        geojson: {
          ...availableSnapshot.geojson,
          features: [
            {
              ...pointFeature,
              properties: { ...pointFeature.properties, label: '변조된 위치 이름' },
            },
          ],
        },
      }).success,
      false,
    );
  });

  it('rejects a snapshot id that does not derive from the digest', () => {
    const snapshotId = 'geo_aaaaaaaaaaaaaaaaaaaaaaaa';
    assert.equal(
      geoSnapshotSchema.safeParse({
        ...availableSnapshot,
        snapshotId,
        mvt: {
          ...availableSnapshot.mvt,
          urlTemplate: availableSnapshot.mvt.urlTemplate?.replace(
            availableSnapshot.snapshotId,
            snapshotId,
          ),
        },
      }).success,
      false,
    );
  });

  it('accepts an honest empty snapshot without fabricated render descriptors', () => {
    const result = geoSnapshotSchema.parse(
      sealFixture({
        ...availableMaterial,
        sourceAsOf: null,
        availability: 'empty',
        geojson: { type: 'FeatureCollection', features: [] },
        h3: { resolution: 3, cells: [] },
      }),
    );
    assert.equal(result.availability, 'empty');
  });

  it('rejects malformed digests and inconsistent partial/rejection accounting', () => {
    assert.equal(
      geoSnapshotSchema.safeParse({ ...availableSnapshot, digest: 'not-a-digest' }).success,
      false,
    );
    assert.equal(
      geoSnapshotSchema.safeParse(
        sealFixture({
          ...availableMaterial,
          availability: 'partial',
          rejected: { count: 2, reasons: [{ code: 'missing_evidence', count: 1 }] },
        }),
      ).success,
      false,
    );
  });

  it('rejects rejected rows outside partial content and H3 keys outside the feature set', () => {
    assert.equal(
      geoSnapshotSchema.safeParse(
        sealFixture({
          ...availableMaterial,
          rejected: { count: 1, reasons: [{ code: 'missing_evidence', count: 1 }] },
        }),
      ).success,
      false,
    );
    assert.equal(
      geoSnapshotSchema.safeParse(
        sealFixture({
          ...availableMaterial,
          h3: {
            resolution: 3,
            cells: [
              {
                cellId: '832830fffffffff',
                featureCount: 1,
                geoEntityKeys: ['geo:facility:not-in-feature-set'],
              },
            ],
          },
        }),
      ).success,
      false,
    );
  });

  it('rejects duplicate geo entity features and H3 keys', () => {
    assert.equal(
      geoSnapshotSchema.safeParse(
        sealFixture({
          ...availableMaterial,
          geojson: { type: 'FeatureCollection', features: [pointFeature, pointFeature] },
          h3: {
            resolution: 3,
            cells: [
              {
                cellId: '832830fffffffff',
                featureCount: 2,
                geoEntityKeys: ['geo:facility:seoul-fixture', 'geo:facility:seoul-fixture'],
              },
            ],
          },
        }),
      ).success,
      false,
    );
  });
});
