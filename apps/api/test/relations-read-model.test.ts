import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getEntityRelations,
  type RelationGraphQueryExecutor,
} from '../src/relations/read-model.ts';

const userScope = { userId: '11111111-1111-4111-8111-111111111111' } as const;

describe('entity relation graph', () => {
  it('falls back to the latest stale publication snapshot', async () => {
    const calls: string[] = [];
    const executor: RelationGraphQueryExecutor = {
      async queryRows<TRow extends Record<string, unknown>>(sql: string): Promise<TRow[]> {
        calls.push(sql);
        if (!sql.includes('publication_projection_status')) return [];
        return [
          {
            analysis_run_id: 'stock:2026-07-16:us_premarket',
            analysis_revision: 1,
            cutoff_at: '2026-07-16T13:05:26.678Z',
            source_watermark_at: '2026-07-16T12:47:35.000Z',
            fresh_until: '2026-07-17T07:05:26.678Z',
            projection_status: 'stale',
          } as unknown as TRow,
        ];
      },
    };

    await getEntityRelations(executor, { userScope, entityKey: 'US:NVDA' });

    const projectionSql = calls.find((sql) => sql.includes('publication_projection_status'));
    assert.ok(projectionSql);
    assert.match(projectionSql, /projection_status\s+IN\s+\('available',\s*'stale'\)/);
  });
});
