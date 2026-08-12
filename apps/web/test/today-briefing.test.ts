import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveTodayBriefing,
  sampleMarketIndicators,
} from '../src/pages/research-workspace/model/today-briefing.ts';

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

  it('marks every hardcoded market indicator as non-live sample data', () => {
    assert.deepEqual(
      sampleMarketIndicators.map(({ label }) => label),
      ['KOSPI', 'NASDAQ', '금'],
    );
    assert.ok(sampleMarketIndicators.every((item) => item.dataState === 'sample'));
    assert.ok(sampleMarketIndicators.every((item) => item.basisLabel.includes('예시')));
  });
});
