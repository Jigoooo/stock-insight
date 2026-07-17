import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getSystemStatus, type SystemStatusQueryExecutor } from '../src/status/read-model.ts';

describe('system status read model', () => {
  it('preserves independent dataset watermarks and source coverage', async () => {
    const executor: SystemStatusQueryExecutor = {
      async queryRows(sql) {
        if (sql.includes('dataset_watermark')) {
          return [
            {
              domain: 'stock',
              dataset_name: 'publication_records',
              status: 'available',
              watermark_at: '2026-07-16T13:05:26.678Z',
              row_count: '194',
              analysis_run_id: 'stock:2026-07-16:us_premarket',
              analysis_revision: 1,
            },
            {
              domain: 'stock',
              dataset_name: 'market_snapshots',
              status: 'stale',
              watermark_at: '2026-07-15T12:00:00.000Z',
              row_count: '26363',
              analysis_run_id: null,
              analysis_revision: null,
            },
          ];
        }
        if (sql.includes('analysis_run_record_source')) {
          return [{ total: 194, linked: 194, clickable: 67 }];
        }
        if (sql.includes('temporal_graph_evidence_health')) {
          return [{ total: 3416, linked: 1280, clickable: 420 }];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
    };

    const status = await getSystemStatus(executor, {
      now: new Date('2026-07-16T15:55:00.000Z'),
    });

    assert.equal(status.overall, 'stale');
    assert.deepEqual(
      status.datasets.map(({ datasetName, availability, watermarkAt }) => ({
        datasetName,
        availability,
        watermarkAt,
      })),
      [
        {
          datasetName: 'publication_records',
          availability: 'available',
          watermarkAt: '2026-07-16T13:05:26.678Z',
        },
        {
          datasetName: 'market_snapshots',
          availability: 'stale',
          watermarkAt: '2026-07-15T12:00:00.000Z',
        },
      ],
    );
    assert.deepEqual(status.sourceCoverage, { linked: 194, clickable: 67, total: 194 });
    assert.deepEqual(status.graphSourceCoverage, {
      linked: 1280,
      clickable: 420,
      total: 3416,
    });
  });
});
