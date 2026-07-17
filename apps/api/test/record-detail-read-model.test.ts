import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getResearchRecordDetail,
  type RecordDetailRowQueryExecutor,
} from '../src/workspace/record-detail.ts';

const userScope = { userId: '11111111-1111-4111-8111-111111111111' } as const;

describe('research record detail read model', () => {
  it('binds source revisions to the selected analysis cutoff', async () => {
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
              projection_status: 'available',
            },
          ];
        }
        if (
          sql.includes('internal_web_publication_records') &&
          !sql.includes('analysis_run_record_source')
        ) {
          return [
            {
              record_key: 'record-detail',
              record_type: 'briefing',
              market: 'US',
              entity_key: 'US:NVDA',
              title: '공급망 브리핑',
              summary: '공식 자료 기반 공급망 변화',
              body: '상세 리서치 본문',
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
              source_key: 'source-verified',
              attribution_text: 'SEC filing',
              url: 'https://www.sec.gov/example',
              published_at: '2026-07-16T11:00:00.000Z',
              cutoff_content_hash: 'a'.repeat(64),
              current_content_hash: 'a'.repeat(64),
              used_claim: '공식 공시 내용이 갱신됨',
            },
            {
              source_key: 'source-superseded',
              attribution_text: '거래소 공개자료',
              url: null,
              published_at: null,
              cutoff_content_hash: 'b'.repeat(64),
              current_content_hash: 'c'.repeat(64),
              used_claim: null,
            },
            {
              source_key: 'source-missing-binding',
              attribution_text: '출처 revision 미확인',
              url: null,
              published_at: null,
              cutoff_content_hash: null,
              current_content_hash: 'd'.repeat(64),
              used_claim: 'cutoff에 결속되지 않은 주장',
            },
          ];
        }
        if (sql.includes('market_snapshots')) {
          return [{ market_data_as_of: '2026-07-16T12:40:00.000Z' }];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
    };

    const detail = await getResearchRecordDetail(executor, {
      userScope,
      recordKey: 'record-detail',
      now: new Date('2026-07-16T15:55:00.000Z'),
    });

    assert.equal(detail?.recordKey, 'record-detail');
    assert.deepEqual(
      detail?.sources.map(({ sourceKey, bindingState, url }) => ({ sourceKey, bindingState, url })),
      [
        {
          sourceKey: 'source-verified',
          bindingState: 'verified',
          url: 'https://www.sec.gov/example',
        },
        { sourceKey: 'source-superseded', bindingState: 'superseded', url: null },
        { sourceKey: 'source-missing-binding', bindingState: 'missing', url: null },
      ],
    );
    assert.deepEqual(
      detail?.evidence.map(({ sourceKeys }) => sourceKeys),
      [['source-verified'], ['source-superseded']],
    );
    assert.ok(detail?.limitations.some((item) => item.includes('cutoff')));
    assert.ok(calls.some(({ params }) => params.includes(userScope.userId)));
    assert.ok(calls.some(({ params }) => params.includes('record-detail')));
  });
});
