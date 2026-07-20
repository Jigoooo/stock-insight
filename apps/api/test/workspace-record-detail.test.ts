import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getResearchRecordDetail,
  type RecordDetailRowQueryExecutor,
} from '../src/workspace/record-detail.ts';

const userScope = { userId: '11111111-1111-4111-8111-111111111111' } as const;

function createStaleExecutor() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const executor: RecordDetailRowQueryExecutor = {
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
            projection_status: 'stale',
          },
        ];
      }
      if (
        sql.includes('internal_web_publication_records') &&
        !sql.includes('analysis_run_record_source')
      ) {
        return [
          {
            record_key: 'feed:stale-record',
            record_type: 'briefing',
            market: 'US',
            entity_key: 'US:NVDA',
            title: 'stale snapshot 브리핑',
            summary: 'stale snapshot에서도 제공되는 기록',
            body: '선택한 분석 시점에 결속된 상세 본문',
            category: 'supply_chain',
            published_at: '2026-07-16T12:30:00.000Z',
            confidence: 'high',
            quality_flags: [],
            has_direct: true,
            has_related: false,
            has_indirect: false,
            min_indirect_hops: null,
            primary_kind: 'direct',
            top_reason: '관심 종목 직접 관련',
          },
        ];
      }
      if (sql.includes('analysis_run_record_source')) {
        return [
          {
            source_key: 'source-stale-verified',
            attribution_text: 'SEC filing',
            url: 'https://www.sec.gov/example',
            published_at: '2026-07-16T11:00:00.000Z',
            cutoff_content_hash: 'a'.repeat(64),
            current_content_hash: 'a'.repeat(64),
            used_claim: '선택한 cutoff에 결속된 주장',
          },
        ];
      }
      if (sql.includes('market_snapshots')) {
        return [{ market_data_as_of: '2026-07-16T12:40:00.000Z' }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return { calls, executor };
}

describe('workspace record detail', () => {
  it('serves a record and evidence from the requested stale publication snapshot', async () => {
    const { calls, executor } = createStaleExecutor();
    const detail = await getResearchRecordDetail(executor, {
      userScope,
      recordKey: 'feed:stale-record',
      now: new Date('2026-07-16T15:55:00.000Z'),
      snapshot: {
        analysisRunId: 'stock:2026-07-16:us_premarket',
        analysisRevision: 1,
      },
    });

    if (!detail) assert.fail('expected stale record detail');
    assert.equal(detail.recordKey, 'feed:stale-record');
    assert.equal(detail.meta.freshness, 'stale');
    assert.deepEqual(detail.meta.contentSnapshot, {
      analysisRunId: 'stock:2026-07-16:us_premarket',
      analysisRevision: 1,
      analysisCutoffAt: '2026-07-16T13:05:26.678Z',
      sourceWatermarkAt: '2026-07-16T12:47:35.000Z',
      freshUntil: '2026-07-17T07:05:26.678Z',
    });
    assert.deepEqual(detail.affectedEntityKeys, ['US:NVDA']);
    assert.deepEqual(
      detail.evidence.map(({ sourceKeys }) => sourceKeys),
      [['source-stale-verified']],
    );
    assert.deepEqual(
      detail.sources.map(({ sourceKey, bindingState }) => ({ sourceKey, bindingState })),
      [{ sourceKey: 'source-stale-verified', bindingState: 'verified' }],
    );
    const projectionCall = calls.find(({ sql }) => sql.includes('publication_projection_status'));
    assert.match(projectionCall?.sql ?? '', /projection_status\s+IN\s+\('available',\s*'stale'\)/);
    assert.ok(calls.some(({ params }) => params.includes('stock:2026-07-16:us_premarket')));
    assert.ok(calls.some(({ params }) => params.includes('feed:stale-record')));
    assert.deepEqual(projectionCall?.params, ['stock:2026-07-16:us_premarket', 1]);
  });
});
