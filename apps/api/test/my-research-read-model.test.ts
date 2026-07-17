import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getMyResearchOverview,
  type MyResearchQueryExecutor,
} from '../src/my-research/read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;

describe('My Research read model', () => {
  it('serializes queries on the single snapshot executor', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const executor: MyResearchQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(sql: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight -= 1;
        return (
          sql.includes('watchlist_count')
            ? [
                {
                  watchlist_count: 0,
                  holding_count: 0,
                  open_history_count: 0,
                  review_due_count: 0,
                },
              ]
            : []
        ) as TRow[];
      },
    };

    await getMyResearchOverview(executor, {
      userScope,
      now: new Date('2026-07-17T01:00:00.000Z'),
    });

    assert.equal(maxInFlight, 1);
  });

  it('combines user-scoped counts and recent UUID history in one snapshot executor', async () => {
    const executor: MyResearchQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(sql: string, parameters = []) => {
        assert.equal(parameters[0], userScope.userId);
        if (sql.includes('watchlist_count')) {
          return [
            {
              watchlist_count: '4',
              holding_count: '2',
              open_history_count: '3',
              review_due_count: '1',
            },
          ] as unknown as TRow[];
        }
        return [
          {
            history_id: '5010c1ac-e77c-8986-a31e-5cca7c402bf2',
            entity_key: 'KR:005930',
            market: 'KR',
            entry_type: 'alert_review',
            title: '삼성전자 경보 검토',
            thesis_text: '판단 조건 확인',
            evidence_json: [],
            source_kind: null,
            source_ref: null,
            occurred_at: '2026-07-16T14:00:00.000Z',
            review_due_at: null,
            status: 'open',
            advice_prohibited: true,
            created_at: '2026-07-16T14:01:00.000Z',
            sort_at: '2026-07-16T14:00:00.000Z',
            scope_total: '3',
          },
        ] as unknown as TRow[];
      },
    };

    const result = await getMyResearchOverview(executor, {
      userScope,
      now: new Date('2026-07-17T01:00:00.000Z'),
    });

    assert.equal(result.watchlistCount, 4);
    assert.equal(result.holdingCount, 2);
    assert.equal(result.openHistoryCount, 3);
    assert.equal(result.reviewDueCount, 1);
    assert.equal(result.recentHistory[0]?.historyId, '5010c1ac-e77c-8986-a31e-5cca7c402bf2');
  });
});
