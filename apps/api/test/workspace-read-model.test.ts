import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getResearchFeedPage,
  getWorkspaceToday,
  type WorkspaceRowQueryExecutor,
} from '../src/workspace/read-model.ts';

const userScope = { userId: '11111111-1111-4111-8111-111111111111' } as const;

function createExecutor() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const executor: WorkspaceRowQueryExecutor = {
    async queryRows(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('publication_projection_status')) {
        return [
          {
            analysis_run_id: 'stock:2026-07-16:us_premarket',
            analysis_revision: 1,
            cutoff_at: '2026-07-16T13:05:26.678Z',
            source_watermark_at: '2026-07-16T12:47:35.000Z',
            fresh_until: '2026-07-17T07:05:26.678Z',
            projection_status: 'available',
          },
        ];
      }
      if (sql.includes('internal_web_publication_records')) {
        return [
          {
            record_key: 'record-direct',
            record_type: 'briefing',
            market: 'US',
            entity_key: 'US:NVDA',
            title: '직접 관련 브리핑',
            summary: '관심 종목과 직접 연결된 새 자료',
            published_at: '2026-07-16T12:30:00.000Z',
            confidence: 'high',
            quality_flags: [],
            has_direct: true,
            has_related: false,
            has_indirect: false,
            min_indirect_hops: null,
            primary_kind: 'direct',
            top_reason: '관심 종목 직접 관련',
            source_count: 1,
            clickable_source_count: 1,
          },
          {
            record_key: 'record-related',
            record_type: 'market_snapshot',
            market: 'KR',
            entity_key: 'KR:005930',
            title: '연관 종목 변화',
            summary: '관심 종목과 연관된 시장 변화',
            published_at: '2026-07-16T12:20:00.000Z',
            confidence: 'medium',
            quality_flags: [],
            has_direct: false,
            has_related: true,
            has_indirect: false,
            min_indirect_hops: null,
            primary_kind: 'related',
            top_reason: '연관 종목',
            source_count: 1,
            clickable_source_count: 0,
          },
          {
            record_key: 'record-indirect',
            record_type: 'macro_observation',
            market: 'KR',
            entity_key: null,
            title: '간접 관련 거시 변화',
            summary: '관심 종목에 간접적으로 연결된 거시 변화',
            published_at: '2026-07-16T12:10:00.000Z',
            confidence: null,
            quality_flags: ['attribution_only'],
            has_direct: false,
            has_related: false,
            has_indirect: true,
            min_indirect_hops: 2,
            primary_kind: 'indirect',
            top_reason: '2단계 간접 연결',
            source_count: 1,
            clickable_source_count: 0,
          },
          {
            record_key: 'record-explore',
            record_type: 'candidate',
            market: 'US',
            entity_key: 'US:AMD',
            title: '새 발굴 후보',
            summary: '관심 목록 밖에서 발견된 새 후보',
            published_at: '2026-07-16T12:00:00.000Z',
            confidence: 'low',
            quality_flags: [],
            has_direct: false,
            has_related: false,
            has_indirect: false,
            min_indirect_hops: null,
            primary_kind: null,
            top_reason: null,
            source_count: 1,
            clickable_source_count: 1,
          },
        ];
      }
      if (sql.includes('current_temporal_graph_edge')) return [{ relation_count: 4 }];
      if (sql.includes('user_watchlist')) return [{ watchlist_count: 1 }];
      if (sql.includes('market_snapshots')) {
        return [{ market_data_as_of: '2026-07-16T12:40:00.000Z' }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return { calls, executor };
}

describe('workspace read model', () => {
  it('builds disjoint priority lanes from one content snapshot', async () => {
    const { calls, executor } = createExecutor();
    const result = await getWorkspaceToday(executor, {
      userScope,
      now: new Date('2026-07-16T15:55:00.000Z'),
      laneLimit: 24,
    });

    assert.deepEqual(
      result.lanes.map(({ lane, items, scopeTotal }) => ({
        lane,
        keys: items.map(({ recordKey }) => recordKey),
        scopeTotal,
      })),
      [
        { lane: 'must_know', keys: ['record-direct', 'record-related'], scopeTotal: 2 },
        { lane: 'for_you', keys: ['record-indirect'], scopeTotal: 1 },
        { lane: 'explore', keys: ['record-explore'], scopeTotal: 1 },
      ],
    );
    assert.equal(result.defaultRecordKey, 'record-direct');
    assert.equal(result.meta.freshness, 'available');
    assert.deepEqual(result.meta.sourceCoverage, { linked: 4, clickable: 2, total: 4 });
    assert.equal(result.summary.relationCount, 4);
    assert.ok(calls.some(({ params }) => params.includes(userScope.userId)));
    assert.equal(
      calls.some(({ sql }) => /\b(insert|update|delete|alter|drop|create)\b/i.test(sql)),
      false,
    );
  });

  it('falls back to the latest stale publication snapshot', async () => {
    const { calls, executor } = createExecutor();
    await getWorkspaceToday(executor, { userScope });

    const projectionCall = calls.find(({ sql }) => sql.includes('publication_projection_status'));
    assert.ok(projectionCall);
    assert.match(projectionCall.sql, /projection_status\s+IN\s+\('available',\s*'stale'\)/);
  });

  it('consumes an opaque cursor without duplicating records', async () => {
    const { executor } = createExecutor();
    const first = await getResearchFeedPage(executor, {
      userScope,
      lane: 'must_know',
      limit: 1,
      now: new Date('2026-07-16T15:55:00.000Z'),
    });
    assert.deepEqual(
      first.items.map(({ recordKey }) => recordKey),
      ['record-direct'],
    );
    assert.ok(first.nextCursor);

    const second = await getResearchFeedPage(executor, {
      userScope,
      lane: 'must_know',
      limit: 1,
      cursor: first.nextCursor!,
      now: new Date('2026-07-16T15:55:00.000Z'),
    });
    assert.deepEqual(
      second.items.map(({ recordKey }) => recordKey),
      ['record-related'],
    );
    assert.equal(second.nextCursor, null);
    assert.equal(second.scopeTotal, 2);
  });
});
