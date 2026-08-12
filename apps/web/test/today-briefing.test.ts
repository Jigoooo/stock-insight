import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveTodayBriefing } from '../src/pages/research-workspace/model/today-briefing.ts';

import type { ResearchFeedItem, WorkspaceToday } from '@stock-insight/contracts/research-workspace';

function feedItem(
  recordKey: string,
  relevance: ResearchFeedItem['relevance']['kind'],
): ResearchFeedItem {
  return {
    recordKey,
    recordType: 'briefing',
    market: 'US',
    title: `${recordKey} 제목`,
    summary: `${recordKey} 요약`,
    publishedAt: '2026-08-06T00:00:00.000Z',
    affectedEntityKeys: ['US:NVDA'],
    whySurfaced: `${recordKey} 연결 이유`,
    relevance: { kind: relevance, hops: relevance === 'direct' ? 0 : 1 },
    confidence: 'high',
    sourceCoverage: { linked: 1, clickable: 1, total: 1 },
    qualityFlags: [],
  };
}

function workspaceToday({
  mustKnow = [],
  forYou = [],
  explore = [],
}: {
  mustKnow?: ResearchFeedItem[];
  forYou?: ResearchFeedItem[];
  explore?: ResearchFeedItem[];
}): WorkspaceToday {
  return {
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt: '2026-08-06T00:00:00.000Z',
      freshness: 'available',
      contentSnapshot: {
        analysisRunId: 'run-1',
        analysisRevision: 1,
        analysisCutoffAt: '2026-08-06T00:00:00.000Z',
        sourceWatermarkAt: '2026-08-06T00:00:00.000Z',
        freshUntil: '2026-08-06T01:00:00.000Z',
      },
      graphSnapshot: {
        requestedAsOf: '2026-08-06T00:00:00.000Z',
        knownThroughAt: '2026-08-06T00:00:00.000Z',
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: { marketDataAsOf: null },
      sourceCoverage: { linked: 4, clickable: 4, total: 4 },
      qualityFlags: [],
    },
    summary: {
      laneItemCount: mustKnow.length + forYou.length + explore.length,
      relationCount: 3,
      watchlistCount: 1,
      sourceCount: 4,
    },
    lanes: [
      { lane: 'must_know', scopeTotal: mustKnow.length, items: mustKnow, nextCursor: null },
      { lane: 'for_you', scopeTotal: forYou.length, items: forYou, nextCursor: null },
      { lane: 'explore', scopeTotal: explore.length, items: explore, nextCursor: null },
    ],
    marketIndicators: [],
    upcomingEvents: [],
    upcomingEventTotal: 0,
    defaultRecordKey: mustKnow[0]?.recordKey ?? forYou[0]?.recordKey ?? null,
  };
}

describe('Today briefing derivation', () => {
  it('splits headlines, curated news, and the remaining list without duplicates', () => {
    const mustOne = feedItem('must-1', 'market');
    const mustTwo = feedItem('must-2', 'indirect');
    const curated = feedItem('for-you-1', 'direct');
    const remaining = feedItem('list-1', 'discovery');
    const data = workspaceToday({ mustKnow: [mustOne, mustTwo], forYou: [curated] });

    const result = deriveTodayBriefing(data, [mustOne, mustTwo, curated, remaining]);

    assert.deepEqual(
      result.headlineItems.map(({ recordKey }) => recordKey),
      ['must-1', 'must-2'],
    );
    assert.deepEqual(
      result.curatedItems.map(({ recordKey }) => recordKey),
      ['for-you-1'],
    );
    assert.deepEqual(
      result.listItems.map(({ recordKey }) => recordKey),
      ['list-1'],
    );
    assert.equal(
      new Set(
        [...result.headlineItems, ...result.curatedItems, ...result.listItems].map(
          ({ recordKey }) => recordKey,
        ),
      ).size,
      4,
    );
  });

  it('keeps only direct or related personalized records and handles empty lanes', () => {
    const direct = feedItem('direct-1', 'direct');
    const market = feedItem('market-1', 'market');
    const data = workspaceToday({ forYou: [direct, market] });

    assert.deepEqual(
      deriveTodayBriefing(data, [direct, market]).curatedItems.map(({ recordKey }) => recordKey),
      ['direct-1'],
    );
    assert.deepEqual(deriveTodayBriefing(workspaceToday({}), []).listItems, []);
  });

  /**
   * 하드코딩 지표가 전부 `dataState:'sample'` 인지 보던 단언이 여기 있었다.
   * 그 상수(KOSPI·NASDAQ·금)는 「오늘의 시장 요약」이 정본 01 §2 네 축의
   * 실데이터로 바뀌면서 사라졌다. 정직성은 없어진 것이 아니라 옮겨갔다 —
   * 이제 행마다 `availability` 와 관측일·자격이 붙고, 그것을
   * `today-view-structure.test.ts` 가 구조로 단언한다.
   */

  it('연결 패널이 headline·curated 항목을 재사용하지 않는다', () => {
    // 한 화면에서 같은 뉴스가 세 번 나오던 것을 막는다. `connectionItems` 가
    // 위 두 패널의 항목을 그대로 다시 쓰고 있었다 — 정본 01 §2 는 이 자리에
    // "공통 opportunity 후보" 를 요구하고, 재탕은 후보도 새 정보도 아니다.
    const mustOne = feedItem('must-1', 'market');
    const mustTwo = feedItem('must-2', 'indirect');
    const curated = feedItem('for-you-1', 'direct');
    const remaining = feedItem('list-1', 'discovery');
    const data = workspaceToday({ mustKnow: [mustOne, mustTwo], forYou: [curated] });

    const result = deriveTodayBriefing(data, [mustOne, mustTwo, curated, remaining]);
    const shown = new Set([
      ...result.headlineItems.map(({ recordKey }) => recordKey),
      ...result.curatedItems.map(({ recordKey }) => recordKey),
    ]);

    assert.deepEqual(
      result.connectionItems.filter(({ recordKey }) => shown.has(recordKey)),
      [],
    );
  });
});
