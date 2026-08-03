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
        if (sql.includes('analytics.graph_snapshot_edge')) {
          assert.match(sql, /knowledge\.relation_evidence_ledger/);
          assert.doesNotMatch(sql, /current_temporal_graph_edge/);
          return [{ total: 3416, linked: 1280, clickable: 420 }];
        }
        if (sql.includes('migration_runs')) {
          return [];
        }
        if (sql.includes('governance.coverage_ledger')) {
          return [];
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

describe('pipeline job status', () => {
  // On 2026-08-01 the analytics pipeline failed three scheduled runs in a row and
  // the only trace was rows in public.migration_runs that no endpoint read.
  function executorWith(rows: Array<Record<string, unknown>>): SystemStatusQueryExecutor {
    return {
      async queryRows(sql) {
        if (sql.includes('migration_runs')) return rows;
        if (sql.includes('dataset_watermark')) return [];
        if (sql.includes('governance.coverage_ledger')) return [];
        return [{ total: 0, linked: 0, clickable: 0 }];
      },
    };
  }

  const base = {
    job_name: 'j',
    last_run_at: '2026-08-01T14:04:00.000Z',
    last_success_at: null,
    last_failure_at: '2026-08-01T14:04:00.000Z',
    last_status: 'failed',
    consecutive_failures: 3,
    records_failures: true,
    stuck_since: null,
  };

  it('carries the failure streak and the job name through', async () => {
    const status = await getSystemStatus(executorWith([base]));
    assert.equal(status.pipelineJobs.length, 1);
    assert.equal(status.pipelineJobs[0]?.consecutiveFailures, 3);
    assert.equal(status.pipelineJobs[0]?.lastStatus, 'failed');
  });

  it('keeps both success vocabularies instead of normalising them', async () => {
    // sync_daily_to_postgres writes 'success' while everything else writes
    // 'completed'. Collapsing them would misreport one of the two.
    const status = await getSystemStatus(
      executorWith([{ ...base, last_status: 'success', consecutive_failures: 0 }]),
    );
    assert.equal(status.pipelineJobs[0]?.lastStatus, 'success');
  });

  it('keeps partial distinct from failed', async () => {
    // dart-financial-facts writes 'partial' when the OpenDART quota runs out
    // mid-run. That is designed behaviour, not a failure.
    const status = await getSystemStatus(
      executorWith([{ ...base, last_status: 'partial', consecutive_failures: 0 }]),
    );
    assert.equal(status.pipelineJobs[0]?.lastStatus, 'partial');
  });

  it('does not invent a status for an unknown value', async () => {
    const status = await getSystemStatus(executorWith([{ ...base, last_status: 'weird' }]));
    assert.equal(status.pipelineJobs[0]?.lastStatus, null);
  });

  it('marks jobs that cannot record their own failures', async () => {
    // Wrapper stages insert only on success, so a zero streak from one means "no
    // record kept", not "nothing went wrong".
    const status = await getSystemStatus(
      executorWith([{ ...base, records_failures: false, consecutive_failures: 0 }]),
    );
    assert.equal(status.pipelineJobs[0]?.recordsFailures, false);
  });

  it('surfaces a run that was killed while still marked running', async () => {
    // Two such rows have been sitting in the table since 2026-07-26 and
    // 2026-07-27 with nothing anywhere noticing.
    const status = await getSystemStatus(
      executorWith([{ ...base, last_status: 'running', stuck_since: '2026-07-26T08:45:33.000Z' }]),
    );
    assert.equal(status.pipelineJobs[0]?.stuckSince, '2026-07-26T08:45:33.000Z');
  });
});
