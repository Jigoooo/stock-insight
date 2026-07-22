import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createApiClient } from '../src/index.ts';

import type {
  DecisionHistoryPage,
  EntityRelationGraph,
  MyResearchOverview,
  RadarSignalPage,
  ResearchFeedItem,
  ResearchFeedPage,
  ResearchRecordDetail,
  SystemStatus,
  ThemeResearchList,
  WorkspaceSnapshotMeta,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

const meta: WorkspaceSnapshotMeta = {
  schemaVersion: 'v3',
  visibility: 'internal',
  generatedAt: '2026-07-16T15:55:00.000Z',
  freshness: 'available',
  contentSnapshot: {
    analysisRunId: 'stock:2026-07-16:us_premarket',
    analysisRevision: 1,
    analysisCutoffAt: '2026-07-16T13:05:26.678Z',
    sourceWatermarkAt: '2026-07-16T12:47:35.000Z',
    freshUntil: '2026-07-17T07:05:26.678Z',
  },
  graphSnapshot: {
    requestedAsOf: '2026-07-16T13:05:26.678Z',
    knownThroughAt: '2026-07-16T13:05:26.678Z',
    edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
  },
  marketSnapshot: { marketDataAsOf: '2026-07-16T12:40:00.000Z' },
  sourceCoverage: { linked: 1, clickable: 1, total: 1 },
  qualityFlags: [],
};

const item: ResearchFeedItem = {
  recordKey: 'record-1',
  recordType: 'briefing',
  market: 'US',
  title: '공급망 브리핑',
  summary: '공식 자료 기반 변화',
  publishedAt: '2026-07-16T12:30:00.000Z',
  affectedEntityKeys: ['US:NVDA'],
  whySurfaced: '관심 종목 직접 관련',
  relevance: { kind: 'direct', hops: 0 },
  confidence: 'high',
  sourceCoverage: { linked: 1, clickable: 1, total: 1 },
  qualityFlags: [],
};

const workspace: WorkspaceToday = {
  meta,
  summary: { laneItemCount: 1, relationCount: 1, watchlistCount: 1, sourceCount: 1 },
  lanes: [
    { lane: 'must_know', scopeTotal: 1, items: [item], nextCursor: null },
    { lane: 'for_you', scopeTotal: 0, items: [], nextCursor: null },
    { lane: 'explore', scopeTotal: 0, items: [], nextCursor: null },
  ],
  defaultRecordKey: item.recordKey,
};

const feed: ResearchFeedPage = {
  meta,
  lane: 'for_you',
  scopeTotal: 1,
  items: [item],
  nextCursor: null,
};

const detail: ResearchRecordDetail = {
  ...item,
  meta,
  body: '상세 리서치 본문',
  category: 'supply_chain',
  limitations: [],
  evidence: [
    {
      evidenceId: 'evidence-1',
      claim: '공식 공시 확인',
      sourceKeys: ['source-1'],
      quality: 'high',
    },
  ],
  sources: [
    {
      sourceKey: 'source-1',
      attributionText: 'SEC filing',
      url: 'https://www.sec.gov/example',
      publishedAt: '2026-07-16T11:00:00.000Z',
      sourceContentHash: 'a'.repeat(64),
      bindingState: 'verified',
    },
  ],
};

const status: SystemStatus = {
  generatedAt: '2026-07-16T15:55:00.000Z',
  overall: 'missing',
  datasets: [],
  sourceCoverage: { linked: 0, clickable: 0, total: 0 },
  graphSourceCoverage: { linked: 0, clickable: 0, total: 0 },
};

const history: DecisionHistoryPage = {
  generatedAt: '2026-07-17T01:00:00.000Z',
  availability: 'available',
  scopeTotal: 1,
  items: [
    {
      historyId: '5010c1ac-e77c-8986-a31e-5cca7c402bf2',
      entityKey: 'KR:005930',
      market: 'KR',
      entryType: 'alert_review',
      title: '삼성전자 경보 검토',
      thesis: '판단 조건을 다시 확인',
      evidenceCount: 2,
      sourceKind: 'user_alert_events',
      sourceRef: 'portfolio-alert:feed:580',
      occurredAt: '2026-07-16T14:00:00.000Z',
      reviewDueAt: null,
      status: 'open',
      adviceProhibited: true,
      createdAt: '2026-07-16T14:01:00.000Z',
    },
  ],
  nextCursor: null,
};

const radar: RadarSignalPage = {
  generatedAt: '2026-07-17T01:00:00.000Z',
  signalAsOf: '2026-07-16T14:00:00.000Z',
  scopeTotal: 1,
  componentWatermarks: {
    event_radar: {
      availability: 'available',
      watermarkAt: '2026-07-16T14:00:00.000Z',
      rowCount: 1,
    },
    factor_map: { availability: 'partial', watermarkAt: '2026-07-16T14:00:00.000Z', rowCount: 1 },
    propagation_map: {
      availability: 'partial',
      watermarkAt: '2026-07-16T14:00:00.000Z',
      rowCount: 1,
    },
    theme_community: { availability: 'missing', watermarkAt: null, rowCount: 0 },
    heatmap_matrix: {
      availability: 'available',
      watermarkAt: '2026-07-16T14:00:00.000Z',
      rowCount: 1,
    },
    timeline: { availability: 'available', watermarkAt: '2026-07-16T14:00:00.000Z', rowCount: 1 },
    map_globe: { availability: 'missing', watermarkAt: null, rowCount: 0 },
    value_chain: { availability: 'missing', watermarkAt: null, rowCount: 0 },
  },
  items: [
    {
      signalKey: 'signal-nvda',
      entityKey: 'US:NVDA',
      market: 'US',
      symbol: 'NVDA',
      name: 'NVIDIA',
      signalType: 'price_mover',
      polarity: 'positive',
      strength: 0.9,
      summary: '가격 변화',
      occurredAt: '2026-07-16T14:00:00.000Z',
      sourceName: 'market_signals',
      watched: true,
      holding: false,
    },
  ],
  nextCursor: null,
};

const themes: ThemeResearchList = {
  generatedAt: '2026-07-17T01:00:00.000Z',
  graphKnownThroughAt: '2026-07-16T13:05:26.678Z',
  signalAsOf: '2026-07-16T14:00:00.000Z',
  availability: 'available',
  items: [
    {
      themeKey: 'THEME:ai_semi',
      title: 'AI 반도체',
      description: '연결 종목 12개',
      memberCount: 12,
      watchedCount: 2,
      holdingCount: 1,
      recentSignalCount: 18,
      topEntityKeys: ['US:NVDA'],
    },
  ],
};

const myResearch: MyResearchOverview = {
  generatedAt: '2026-07-17T01:00:00.000Z',
  availability: 'available',
  watchlistCount: 8,
  holdingCount: 0,
  openHistoryCount: 3,
  reviewDueCount: 0,
  recentHistory: history.items,
};

const relations: EntityRelationGraph = {
  meta,
  rootEntityKey: 'US:NVDA',
  depth: 2,
  nodes: [{ entityKey: 'US:NVDA', label: 'NVIDIA', market: 'US', watched: true, holding: false }],
  edges: [],
  evidenceSummary: { evidenceCount: 0, clickableSourceCount: 0, limitation: '근거 준비중' },
};

describe('v3 research API client', () => {
  it('builds endpoint URLs and validates every v3 response', async () => {
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = input.toString();
      calls.push(url);
      if (url.includes('/api/workspace')) return new Response(JSON.stringify(workspace));
      if (url.includes('/api/feed')) return new Response(JSON.stringify(feed));
      if (url.includes('/api/records/')) return new Response(JSON.stringify(detail));
      if (url.includes('/api/status')) return new Response(JSON.stringify(status));
      if (url.includes('/api/history')) return new Response(JSON.stringify(history));
      if (url.includes('/api/radar')) return new Response(JSON.stringify(radar));
      if (url.includes('/api/themes')) return new Response(JSON.stringify(themes));
      if (url.includes('/api/my-research')) return new Response(JSON.stringify(myResearch));
      if (url.includes('/relations')) return new Response(JSON.stringify(relations));
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://stock.local', fetcher });

    assert.equal((await client.researchWorkspace()).defaultRecordKey, 'record-1');
    assert.equal(
      (await client.researchFeed({ lane: 'for_you', cursor: 'abc', limit: 10 })).lane,
      'for_you',
    );
    assert.equal((await client.researchRecord('record-1')).sources[0]?.bindingState, 'verified');
    assert.equal((await client.researchStatus()).overall, 'missing');
    assert.equal(
      (await client.decisionHistory({ cursor: 'history-cursor', limit: 10 })).scopeTotal,
      1,
    );
    assert.equal((await client.radarSignals({ cursor: 'radar-cursor', limit: 10 })).scopeTotal, 1);
    assert.equal((await client.themeResearch()).items[0]?.themeKey, 'THEME:ai_semi');
    assert.equal((await client.myResearch()).watchlistCount, 8);
    assert.equal((await client.entityRelations('US:NVDA', 2)).depth, 2);

    assert.deepEqual(calls, [
      'http://stock.local/api/workspace',
      'http://stock.local/api/feed?lane=for_you&cursor=abc&limit=10',
      'http://stock.local/api/records/record-1',
      'http://stock.local/api/status',
      'http://stock.local/api/history?cursor=history-cursor&limit=10',
      'http://stock.local/api/radar?cursor=radar-cursor&limit=10',
      'http://stock.local/api/themes',
      'http://stock.local/api/my-research',
      'http://stock.local/api/entities/US%3ANVDA/relations?depth=2',
    ]);
  });
});
