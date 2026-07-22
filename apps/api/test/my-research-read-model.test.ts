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
        return (sql.includes("to_regclass('personalization.decision_packet')")
          ? [{ relation_name: null }]
          : sql.includes('watchlist_count')
            ? [
                {
                  watchlist_count: 0,
                  holding_count: 0,
                  open_history_count: 0,
                  review_due_count: 0,
                },
              ]
            : []) as unknown as TRow[];
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
      queryRows: async <TRow extends Record<string, unknown>>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) => {
        if (sql.includes("to_regclass('personalization.decision_packet')")) {
          return [{ relation_name: null }] as unknown as TRow[];
        }
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
    assert.equal(result.decisionSupport.availability, 'missing');
    assert.equal(result.decisionSupport.latestPacket, null);
  });

  it('redacts an actionable packet until legal read-only review is approved', async () => {
    let decisionSql = '';
    const packetRow = {
      decision_packet_id: '6b4aa839-4f76-4ca0-932e-93d1075e7b92',
      entity_key: 'KR:005930',
      entity_name: '삼성전자',
      action: 'REDUCE',
      action_reason: '비중 상한 초과',
      abstention_reason: null,
      common_view_as_of: '2026-07-21T23:30:00.000Z',
      expires_at: '2026-07-23T00:00:00.000Z',
      generated_at: '2026-07-22T00:00:00.000Z',
      legal_review_status: 'required',
      advice_prohibited: true,
      order_executable: false,
      packet_count: '1',
    };
    let decisionParams: readonly unknown[] = [];
    let probeSql = '';
    const executor: MyResearchQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ) => {
        if (sql.includes("to_regclass('personalization.decision_packet')")) {
          probeSql = sql;
          return [
            {
              relation_name: 'personalization.decision_packet',
              review_relation_name: 'personalization.decision_packet_legal_review',
              seal_relation_name: 'personalization.portfolio_snapshot_seal',
            },
          ] as unknown as TRow[];
        }
        if (sql.includes('FROM personalization.decision_packet')) {
          decisionSql = sql;
          decisionParams = params;
          return [packetRow] as unknown as TRow[];
        }
        if (sql.includes('watchlist_count')) {
          return [
            {
              watchlist_count: 0,
              holding_count: 0,
              open_history_count: 0,
              review_due_count: 0,
            },
          ] as unknown as TRow[];
        }
        return [];
      },
    };

    const restricted = await getMyResearchOverview(executor, {
      userScope,
      now: new Date('2026-07-22T01:00:00.000Z'),
    });
    assert.equal(restricted.decisionSupport.availability, 'available');
    assert.equal(restricted.decisionSupport.latestPacket?.action, null);
    assert.equal(restricted.decisionSupport.latestPacket?.actionReason, null);
    assert.equal(
      restricted.decisionSupport.latestPacket?.restrictionReason,
      'LEGAL_REVIEW_REQUIRED',
    );
    assert.match(decisionSql, /FROM personalization\.decision_packet_legal_review review/);
    assert.match(
      decisionSql,
      /JOIN personalization\.portfolio_snapshot_seal seal[\s\S]*seal\.portfolio_snapshot_id = packet\.portfolio_snapshot_id[\s\S]*seal\.user_id = packet\.user_id/,
    );
    assert.match(decisionSql, /legal_review\.review_status = 'approved_read_only'/);
    assert.match(decisionSql, /ELSE 'required'/);
    assert.doesNotMatch(decisionSql, /ELSE packet\.legal_review_status/);
    assert.match(decisionSql, /packet\.generated_at <= \$2::timestamptz/);
    assert.match(decisionSql, /review\.reviewed_at <= \$2::timestamptz/);
    assert.match(probeSql, /to_regclass\('personalization\.portfolio_snapshot_seal'\)/);
    assert.deepEqual(decisionParams, [userScope.userId, '2026-07-22T01:00:00.000Z']);

    packetRow.legal_review_status = 'approved_read_only';
    const approved = await getMyResearchOverview(executor, {
      userScope,
      now: new Date('2026-07-22T01:00:00.000Z'),
    });
    assert.equal(approved.decisionSupport.latestPacket?.action, 'REDUCE');
    assert.equal(approved.decisionSupport.latestPacket?.actionReason, '비중 상한 초과');
    assert.equal(approved.decisionSupport.latestPacket?.restrictionReason, null);

    const expired = await getMyResearchOverview(executor, {
      userScope,
      now: new Date('2026-07-23T00:00:00.000Z'),
    });
    assert.equal(expired.decisionSupport.availability, 'stale');
    assert.equal(expired.decisionSupport.latestPacket?.action, null);
    assert.equal(expired.decisionSupport.latestPacket?.actionReason, null);
    assert.equal(expired.decisionSupport.latestPacket?.restrictionReason, 'PACKET_EXPIRED');
  });
});
