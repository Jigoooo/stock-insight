import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type PublicationProjectionRow,
  selectPublicationProjection,
} from '../src/workspace/publication-snapshot.ts';

const availableProjection: PublicationProjectionRow = {
  analysis_run_id: 'run-available',
  analysis_revision: 7,
  cutoff_at: '2026-07-20T00:00:00.000Z',
  fresh_until: '2026-07-20T02:00:00.000Z',
  projection_status: 'available',
  source_watermark_at: '2026-07-19T23:59:00.000Z',
};

describe('publication snapshot selection', () => {
  it('orders available projections ahead of stale fallback rows', async () => {
    const projection = await selectPublicationProjection({
      queryRows: async <TRow extends Record<string, unknown>>(sql: string) => {
        assert.match(
          sql,
          /ORDER BY CASE projection_status WHEN 'available' THEN 0 ELSE 1 END,[\s\S]*cutoff_at DESC/,
        );
        return [availableProjection as unknown as TRow];
      },
    });

    assert.equal(projection?.projection_status, 'available');
    assert.equal(projection?.analysis_run_id, 'run-available');
  });

  it('uses exact run and revision parameters for a pinned snapshot', async () => {
    const projection = await selectPublicationProjection(
      {
        queryRows: async <TRow extends Record<string, unknown>>(
          sql: string,
          params: readonly unknown[] = [],
        ) => {
          assert.match(sql, /analysis_run_id = \$1/);
          assert.deepEqual(params, ['run-available', 7]);
          return [availableProjection as unknown as TRow];
        },
      },
      { analysisRunId: 'run-available', analysisRevision: 7 },
    );

    assert.equal(projection?.analysis_revision, 7);
  });
});
