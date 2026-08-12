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
      if (
        sql.includes('analytics.graph_snapshot') &&
        sql.includes('user_watchlist') &&
        sql.includes('market_snapshots')
      ) {
        return [
          {
            relation_count: 4,
            watchlist_count: 1,
            market_data_as_of: '2026-07-16T12:40:00.000Z',
          },
        ];
      }
      if (sql.includes('analytics.graph_snapshot')) return [{ relation_count: 4 }];
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
    // 거시 지표 조회가 네 번째다. 정본 01 §2 의 금리·FX·원자재·정책 축은 발행
    // 프로젝션과 무관한 시장 단위 자료라 별도 쿼리로 온다.
    assert.equal(calls.length, 4);
    assert.ok(calls.some(({ sql }) => sql.includes('macro_series_topic')));
    assert.deepEqual(calls[2]?.params, ['2026-07-16T13:05:26.678Z', userScope.userId]);
    assert.ok(calls.some(({ params }) => params.includes(userScope.userId)));
    assert.equal(
      calls.some(({ sql }) => /\b(insert|update|delete|alter|drop|create)\b/i.test(sql)),
      false,
    );
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

/**
 * 오래된 발행 프로젝션은 **오류가 아니라 상태**다.
 *
 * `LATEST_RUN_SQL` 이 `projection_status = 'available'` 로 걸러서, 프로젝션이
 * 만료되는 순간 0행 → `throw` → today 화면 전체가
 * "워크스페이스를 불러오지 못했습니다" 로 죽었다. 라이브에서 실제로 죽어 있었다
 * (2026-08-12 09:25Z): stock 행 47개가 invalid 22 · stale 25 로 `available` 이
 * 하나도 없었고, 가장 최근 프로젝션의 `fresh_until` 은 같은 날 07:05Z 였다.
 * 매일 그 시각에 죽고 다음 발행까지 돌아오지 않는 구조다.
 *
 * UX 헌법 6번이 뒤집힌 모양이다 — 그 조항은 오류를 부재로 위장하지 말라고 하는데
 * 여기서는 반대로 상태여야 할 것이 오류가 됐다.
 */
describe('만료된 발행 프로젝션', () => {
  function executorWithStatus(projectionStatus: string, freshUntil: string) {
    const base = createExecutor();
    const executor: WorkspaceRowQueryExecutor = {
      async queryRows(sql, params = []) {
        const rows = await base.executor.queryRows(sql, params);
        if (sql.includes('publication_projection_status')) {
          return rows.map((row) => ({
            ...row,
            projection_status: projectionStatus,
            fresh_until: freshUntil,
          }));
        }
        return rows;
      },
    };
    return executor;
  }

  it('stale 프로젝션을 예외가 아니라 stale 로 돌려준다', async () => {
    const today = await getWorkspaceToday(executorWithStatus('stale', '2026-07-17T07:05:26.678Z'), {
      userScope,
      now: new Date('2026-07-18T00:00:00.000Z'),
    });

    assert.equal(today.meta.freshness, 'stale');
    // 내용이 사라지지 않는다. 오래된 브리핑은 기준 시각과 함께 읽을 수 있어야 한다.
    assert.ok(today.lanes.length > 0);
  });

  // `invalid` 는 오래된 것이 아니라 **믿을 수 없는** 것이다. 둘을 같은 낱말로
  // 뭉개면 깨진 프로젝션이 "조금 지난 자료" 로 읽힌다.
  it('invalid 프로젝션은 stale 이 아니라 error 로 구분한다', async () => {
    const today = await getWorkspaceToday(
      executorWithStatus('invalid', '2999-01-01T00:00:00.000Z'),
      { userScope, now: new Date('2026-07-16T14:00:00.000Z') },
    );

    assert.equal(today.meta.freshness, 'error');
  });

  it('SQL 이 projection_status 로 거르지 않는다', async () => {
    const base = createExecutor();
    await getWorkspaceToday(base.executor, {
      userScope,
      now: new Date('2026-07-16T14:00:00.000Z'),
    });
    const projectionCall = base.calls.find(({ sql }) =>
      sql.includes('publication_projection_status'),
    );

    assert.ok(projectionCall);
    // 이 필터가 돌아오면 만료 순간 화면이 다시 죽는다.
    assert.doesNotMatch(projectionCall.sql, /projection_status\s*=\s*'available'/);
  });
});
