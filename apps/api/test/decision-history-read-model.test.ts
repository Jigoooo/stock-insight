import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getDecisionHistory,
  type DecisionHistoryQueryExecutor,
} from '../src/history/read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;

const rows = [
  {
    history_id: '5010c1ac-e77c-8986-a31e-5cca7c402bf2',
    entity_key: 'KR:005930',
    market: 'KR',
    entry_type: 'alert_review',
    title: '삼성전자 경보 검토',
    thesis_text: '경보 원인과 판단 조건을 다시 확인',
    evidence_json: [{ claim: '첫 근거' }, { claim: '둘째 근거' }],
    source_kind: 'user_alert_events',
    source_ref: 'portfolio-alert:feed:580',
    occurred_at: '2026-07-16T14:00:00.000Z',
    review_due_at: null,
    status: 'open',
    advice_prohibited: true,
    created_at: '2026-07-16T14:01:00.000Z',
    sort_at: '2026-07-16T14:00:00.000Z',
    scope_total: '3',
  },
  {
    history_id: '654406a3-5567-857b-afb3-e6f73108897f',
    entity_key: 'KR:005380',
    market: 'KR',
    entry_type: 'alert_review',
    title: '현대차 경보 검토',
    thesis_text: '변화 이벤트 확인',
    evidence_json: { sources: ['a'] },
    source_kind: null,
    source_ref: null,
    occurred_at: '2026-07-16T13:00:00.000Z',
    review_due_at: null,
    status: 'reviewed',
    advice_prohibited: true,
    created_at: '2026-07-16T13:01:00.000Z',
    sort_at: '2026-07-16T13:00:00.000Z',
    scope_total: '3',
  },
  {
    history_id: 'df9d0ac4-cb22-89b7-a8c2-99dea21b6f13',
    entity_key: 'US:NVDA',
    market: 'US',
    entry_type: 'alert_review',
    title: 'NVDA 경보 검토',
    thesis_text: '미국 시장 변화 확인',
    evidence_json: [],
    source_kind: 'user_alert_events',
    source_ref: 'portfolio-alert:feed:589',
    occurred_at: '2026-07-16T12:00:00.000Z',
    review_due_at: null,
    status: 'open',
    advice_prohibited: true,
    created_at: '2026-07-16T12:01:00.000Z',
    sort_at: '2026-07-16T12:00:00.000Z',
    scope_total: '3',
  },
] as const;

describe('decision history read model', () => {
  it('filters by canonical user UUID and paginates with an opaque stable cursor', async () => {
    const seenParameters: unknown[][] = [];
    const executor: DecisionHistoryQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(_sql: string, parameters = []) => {
        seenParameters.push([...parameters]);
        const pageRows = parameters[1] === null ? rows.slice(0, 3) : rows.slice(2, 3);
        return pageRows as unknown as TRow[];
      },
    };

    const first = await getDecisionHistory(executor, {
      userScope,
      limit: 2,
      now: new Date('2026-07-17T01:00:00.000Z'),
    });
    const second = await getDecisionHistory(executor, {
      userScope,
      limit: 2,
      cursor: first.nextCursor,
      now: new Date('2026-07-17T01:00:01.000Z'),
    });

    assert.equal(seenParameters[0]?.[0], userScope.userId);
    assert.deepEqual(
      first.items.map(({ entityKey }) => entityKey),
      ['KR:005930', 'KR:005380'],
    );
    assert.deepEqual(
      second.items.map(({ entityKey }) => entityKey),
      ['US:NVDA'],
    );
    assert.equal(first.scopeTotal, 3);
    assert.equal(first.items[0]?.evidenceCount, 2);
    assert.equal(first.nextCursor === null, false);
    assert.equal(second.nextCursor, null);
    assert.equal('userId' in (first.items[0] ?? {}), false);
    assert.equal('evidenceJson' in (first.items[0] ?? {}), false);
  });
});
