import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getGeoMvtTile,
  getGeoSnapshot,
  type GeoSnapshotQueryExecutor,
} from '../src/geo/read-model.ts';

const knownAt = new Date('2026-07-22T05:00:00.000Z');
const now = new Date('2026-07-22T05:05:00.000Z');

const validRows = [
  {
    geo_entity_revision_id: '142',
    geo_entity_key: 'geo:facility:seoul',
    canonical_name: '서울 생산 시설',
    geo_kind: 'facility',
    precision_class: 'exact',
    geometry_json: {
      type: 'Point',
      coordinates: [127.0276, 37.4979],
    },
    longitude: '127.0276',
    latitude: '37.4979',
    uncertainty_radius_km: '0.1',
    source_revision_id: '42',
    source_id: 'official-registry',
    known_from: '2026-07-21T15:00:00.000Z',
  },
  {
    geo_entity_revision_id: '143',
    geo_entity_key: 'geo:facility:austin',
    canonical_name: '오스틴 생산 시설',
    geo_kind: 'facility',
    precision_class: 'approximate',
    geometry_json: {
      type: 'Point',
      coordinates: [-97.7431, 30.2672],
    },
    longitude: '-97.7431',
    latitude: '30.2672',
    uncertainty_radius_km: '5',
    source_revision_id: '43',
    source_id: 'official-registry',
    known_from: '2026-07-21T14:00:00.000Z',
  },
] as const;

function executorFor(rows: readonly Record<string, unknown>[]): GeoSnapshotQueryExecutor & {
  sql: string[];
  parameters: readonly unknown[][];
} {
  const sql: string[] = [];
  const parameters: readonly unknown[][] = [];
  return {
    sql,
    parameters,
    async queryRows<TRow extends Record<string, unknown>>(
      query: string,
      values: readonly unknown[] = [],
    ) {
      sql.push(query);
      (parameters as unknown[][]).push([...values]);
      if (query.includes('to_regclass')) {
        return [
          {
            geo_revision_relation: 'geo.entity_revision',
            source_revision_relation: 'ingestion.source_revision',
          },
        ] as unknown as TRow[];
      }
      return [...rows] as unknown as TRow[];
    },
  };
}

describe('sealed geo snapshot read model', () => {
  it('seals sorted valid rows, rejects invalid rows, and derives H3 without changing truth geometry', async () => {
    const rows = [
      {
        ...validRows[0],
        source_revision_id: null,
        geo_entity_key: 'geo:facility:missing-evidence',
      },
      validRows[0],
      {
        ...validRows[1],
        geo_entity_key: 'geo:facility:invalid-geometry',
        geometry_json: { type: 'Point', coordinates: [200, 30] },
      },
      validRows[1],
    ];
    const executor = executorFor(rows);
    const snapshot = await getGeoSnapshot(executor, { knownAt, now, h3Resolution: 3 });
    const reversed = await getGeoSnapshot(executorFor([...rows].reverse()), {
      knownAt,
      now: new Date('2026-07-22T05:06:00.000Z'),
      h3Resolution: 3,
    });

    assert.equal(snapshot.availability, 'partial');
    assert.deepEqual(
      snapshot.geojson.features.map((feature) => feature.properties.geoEntityKey),
      ['geo:facility:austin', 'geo:facility:seoul'],
    );
    assert.deepEqual(snapshot.rejected, {
      count: 2,
      reasons: [
        { code: 'invalid_geometry', count: 1 },
        { code: 'missing_evidence', count: 1 },
      ],
    });
    assert.equal(snapshot.h3.cells.length, 2);
    assert.match(snapshot.h3.cells[0]!.cellId, /^[0-9a-f]{15}$/);
    assert.equal(snapshot.snapshotId, reversed.snapshotId);
    assert.equal(snapshot.digest, reversed.digest);
    assert.notEqual(snapshot.generatedAt, reversed.generatedAt);
    assert.match(snapshot.limitations.join(' '), /불확실성 반경.*근거 표/);
    assert.equal(snapshot.mvt.available, true);
    if (snapshot.mvt.available) {
      assert.match(snapshot.mvt.urlTemplate, new RegExp(`snapshot=${snapshot.snapshotId}`));
      assert.match(snapshot.mvt.urlTemplate, /knownAt=/);
    }
    assert.match(executor.sql[1]!, /distinct on/i);
    assert.match(executor.sql[1]!, /st_asgeojson/i);
    assert.match(executor.sql[1]!, /latest_revision/i);
    assert.match(executor.sql[1]!, /WHERE latest_revision\.geom IS NOT NULL/i);
    assert.doesNotMatch(executor.sql[1]!, /WHERE revision\.geom IS NOT NULL/i);
    assert.deepEqual(executor.parameters[1], [knownAt.toISOString(), knownAt.toISOString()]);
  });

  it('rejects blank and non-decimal numeric scalars before coercion', async () => {
    const rows = [
      {
        ...validRows[0],
        geo_entity_key: 'geo:facility:blank-longitude',
        geometry_json: { type: 'Point', coordinates: [0, 37.4979] },
        longitude: '   ',
      },
      {
        ...validRows[0],
        geo_entity_key: 'geo:facility:hex-longitude',
        geometry_json: { type: 'Point', coordinates: [16, 37.4979] },
        longitude: '0x10',
      },
      {
        ...validRows[0],
        geo_entity_key: 'geo:facility:blank-uncertainty',
        uncertainty_radius_km: '',
      },
    ];

    const snapshot = await getGeoSnapshot(executorFor(rows), { knownAt, now });
    assert.deepEqual(snapshot.geojson.features, []);
    assert.deepEqual(snapshot.rejected, {
      count: 3,
      reasons: [{ code: 'invalid_geometry', count: 3 }],
    });
  });

  it('rejects every non-finite scalar while accepting scientific decimals and absent uncertainty', async () => {
    const invalidRows = ['NaN', 'Infinity', '-Infinity', '1e309'].map((longitude, index) => ({
      ...validRows[1],
      geo_entity_key: `geo:facility:non-finite-${index}`,
      longitude,
    }));
    const invalidSnapshot = await getGeoSnapshot(executorFor(invalidRows), { knownAt, now });
    assert.deepEqual(invalidSnapshot.geojson.features, []);
    assert.deepEqual(invalidSnapshot.rejected, {
      count: 4,
      reasons: [{ code: 'invalid_geometry', count: 4 }],
    });

    const scientificSnapshot = await getGeoSnapshot(
      executorFor([
        {
          ...validRows[1],
          longitude: '-9.77431e1',
          latitude: '3.02672e1',
          uncertainty_radius_km: null,
        },
      ]),
      { knownAt, now },
    );
    assert.equal(scientificSnapshot.geojson.features.length, 1);
    assert.equal(
      'uncertaintyRadiusKm' in scientificSnapshot.geojson.features[0]!.properties,
      false,
    );
  });

  it('returns an honest empty snapshot when geo tables exist without spatial revisions', async () => {
    const snapshot = await getGeoSnapshot(executorFor([]), { knownAt, now });
    assert.equal(snapshot.availability, 'empty');
    assert.deepEqual(snapshot.geojson.features, []);
    assert.equal(snapshot.mvt.available, false);
    assert.deepEqual(snapshot.h3.cells, []);
  });

  it('evaluates historical snapshot freshness at its knowledge cutoff', async () => {
    const snapshot = await getGeoSnapshot(executorFor(validRows), {
      knownAt,
      now: new Date('2026-07-30T05:00:00.000Z'),
    });
    assert.equal(snapshot.availability, 'available');
  });

  it('returns unavailable without issuing the spatial query when migrations are absent', async () => {
    let calls = 0;
    const executor: GeoSnapshotQueryExecutor = {
      async queryRows<TRow extends Record<string, unknown>>() {
        calls += 1;
        return [
          { geo_revision_relation: null, source_revision_relation: null },
        ] as unknown as TRow[];
      },
    };
    const snapshot = await getGeoSnapshot(executor, { knownAt, now });
    assert.equal(calls, 1);
    assert.equal(snapshot.availability, 'unavailable');
    assert.deepEqual(snapshot.geojson.features, []);
  });

  it('serves a PostGIS MVT tile only when the requested sealed snapshot matches', async () => {
    const snapshotExecutor = executorFor(validRows);
    const snapshot = await getGeoSnapshot(snapshotExecutor, { knownAt, now, h3Resolution: 3 });
    const sql: string[] = [];
    const parameters: unknown[][] = [];
    let tileMode: 'valid' | 'null' | 'missing' | 'invalid' = 'valid';
    const executor: GeoSnapshotQueryExecutor = {
      async queryRows<TRow extends Record<string, unknown>>(
        query: string,
        values: readonly unknown[] = [],
      ) {
        sql.push(query);
        parameters.push([...values]);
        if (query.includes('to_regclass')) {
          return [
            {
              geo_revision_relation: 'geo.entity_revision',
              source_revision_relation: 'ingestion.source_revision',
            },
          ] as unknown as TRow[];
        }
        if (query.includes('ST_AsMVT(')) {
          if (tileMode === 'missing') return [];
          const tile =
            tileMode === 'null'
              ? null
              : tileMode === 'invalid'
                ? 'not-bytea'
                : Buffer.from([26, 3, 103, 101, 111]);
          return [{ tile }] as unknown as TRow[];
        }
        return [...validRows] as unknown as TRow[];
      },
    };

    const tile = await getGeoMvtTile(executor, {
      z: 3,
      x: 6,
      y: 3,
      knownAt,
      validAt: knownAt,
      snapshotId: snapshot.snapshotId,
      now,
    });
    assert.deepEqual([...tile], [26, 3, 103, 101, 111]);
    const tileSqlIndex = sql.findIndex((query) => query.includes('ST_AsMVT('));
    assert.notEqual(tileSqlIndex, -1);
    assert.match(sql[tileSqlIndex]!, /ST_TileEnvelope/i);
    assert.match(sql[tileSqlIndex]!, /ST_AsMVTGeom/i);
    assert.match(sql[tileSqlIndex]!, /latest_revision/i);
    assert.match(sql[tileSqlIndex]!, /unnest\(\$6::text\[\], \$7::bigint\[\], \$8::bigint\[\]\)/i);
    assert.match(
      sql[tileSqlIndex]!,
      /accepted\.source_revision_id = revision\.source_revision_id/i,
    );
    assert.match(sql[tileSqlIndex]!, /accepted\.geo_entity_key = entity\.geo_entity_key/i);
    assert.match(
      sql[tileSqlIndex]!,
      /accepted\.geo_entity_revision_id = revision\.geo_entity_revision_id/i,
    );
    assert.match(sql[tileSqlIndex]!, /current_revision\.geo_entity_revision_id,/i);
    assert.match(sql[tileSqlIndex]!, /current_revision\.source_revision_id,/i);
    assert.match(sql[tileSqlIndex]!, /current_revision\.geo_entity_revision_id/i);
    assert.match(sql[tileSqlIndex]!, /current_revision\.source_revision_id/i);
    assert.match(sql[tileSqlIndex]!, /WHERE latest_revision\.geom IS NOT NULL/i);
    assert.doesNotMatch(sql[tileSqlIndex]!, /WHERE revision\.geom IS NOT NULL/i);
    assert.deepEqual(parameters[tileSqlIndex], [
      3,
      6,
      3,
      knownAt.toISOString(),
      knownAt.toISOString(),
      ['geo:facility:austin', 'geo:facility:seoul'],
      [143, 142],
      [43, 42],
    ]);

    tileMode = 'null';
    await assert.rejects(
      () =>
        getGeoMvtTile(executor, {
          z: 3,
          x: 6,
          y: 3,
          knownAt,
          validAt: knownAt,
          snapshotId: snapshot.snapshotId,
          now,
        }),
      /tile payload is missing/,
    );

    tileMode = 'missing';
    await assert.rejects(
      () =>
        getGeoMvtTile(executor, {
          z: 3,
          x: 6,
          y: 3,
          knownAt,
          validAt: knownAt,
          snapshotId: snapshot.snapshotId,
          now,
        }),
      /tile payload is missing/,
    );

    tileMode = 'invalid';
    await assert.rejects(
      () =>
        getGeoMvtTile(executor, {
          z: 3,
          x: 6,
          y: 3,
          knownAt,
          validAt: knownAt,
          snapshotId: snapshot.snapshotId,
          now,
        }),
      /tile payload is invalid/,
    );

    await assert.rejects(
      () =>
        getGeoMvtTile(executor, {
          z: 3,
          x: 6,
          y: 3,
          knownAt,
          validAt: knownAt,
          snapshotId: 'geo_aaaaaaaaaaaaaaaaaaaaaaaa',
          now,
        }),
      /snapshot mismatch/,
    );
    await assert.rejects(
      () =>
        getGeoMvtTile(executor, {
          z: 3,
          x: 8,
          y: 3,
          knownAt,
          validAt: knownAt,
          snapshotId: snapshot.snapshotId,
          now,
        }),
      /tile coordinate/,
    );
  });
});
