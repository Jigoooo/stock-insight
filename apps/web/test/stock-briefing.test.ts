import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildStocksBriefingModel,
  createStocksBriefingModel,
  loadStockBriefingData,
} from '../src/pages/research-workspace/model/stock-briefing.ts';
import {
  loadPreviewStockBriefing,
  stockBriefingDetailPreviewFixtures,
} from '../src/pages/dev-preview/model/stock-deep-dive-preview-fixture.ts';
import {
  stocksBriefingPreviewFixture,
  stocksPreviewFixture,
} from '../src/pages/dev-preview/model/stocks-preview-fixture.ts';

import type {
  ImpactBriefResponse,
  StockDetailResponse,
  StockListItem,
  StockListResponse,
} from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

const generatedAt = '2026-08-07T00:00:00.000Z';

function stock(overrides: Partial<StockListItem> = {}): StockListItem {
  return {
    entityKey: 'KR:005930',
    ticker: '005930',
    market: 'KR',
    name: '삼성전자',
    displayName: '삼성전자',
    isWatched: true,
    isHolding: true,
    analysisStatus: 'cached',
    ...overrides,
  };
}

function stockList(data: StockListItem[]): StockListResponse {
  return {
    availability: data.length > 0 ? 'available' : 'missing',
    data,
    error: null,
    meta: { source: 'database', generatedAt },
  } as StockListResponse;
}

const detailResponse = {
  availability: 'available',
  data: {
    stock: stock({ primaryThesis: 'HBM 수요와 메모리 가격 흐름을 함께 복기합니다.' }),
    deepReport: {
      status: 'available',
      reportMarkdown: '메모리 업황과 공급 구조를 확인합니다.',
      researchedAt: generatedAt,
      sources: [{ label: '기업 공시', url: 'https://example.com/samsung-filing' }],
    },
    relatedNews: [
      {
        id: 'news-1',
        title: 'HBM 공급망 변화',
        context: '공급 구조 변화를 확인합니다.',
        impact: '높음',
        icon: 'newspaper',
      },
    ],
    risks: ['메모리 가격 변동성'],
    checkpoints: ['다음 분기 수익성 추이'],
    companyMetrics: [],
    learningCards: [],
    glossaryTerms: [],
  },
  error: null,
  meta: { source: 'database', generatedAt },
} as StockDetailResponse;

function impactBrief(entityKey = 'KR:005930'): ImpactBriefResponse {
  return {
    availability: 'available',
    data: {
      entityKey,
      contentPackId: 1,
      packDigest: 'a'.repeat(64),
      graphSnapshotId: 1,
      builtAt: generatedAt,
      freshUntil: '2026-08-08T00:00:00.000Z',
      paths: [
        {
          impactPathV2Id: 1,
          triggerEventId: 1,
          sourceEntityId: 1,
          eventType: 'regulation',
          sourceName: '낮은 연결',
          sourceEntityKey: 'US:LOW',
          hopCount: 1,
          pathScore: 0.2,
          note: '산업 연결 강도',
          steps: null,
        },
        {
          impactPathV2Id: 2,
          triggerEventId: 2,
          sourceEntityId: 2,
          eventType: 'supply_disruption',
          sourceName: '가장 높은 연결',
          sourceEntityKey: 'US:HIGH',
          hopCount: 2,
          pathScore: 0.9,
          note: '산업 연결 강도',
          steps: null,
        },
        {
          impactPathV2Id: 3,
          triggerEventId: 3,
          sourceEntityId: 3,
          eventType: 'earnings',
          sourceName: '두 번째 연결',
          sourceEntityKey: 'US:MID',
          hopCount: 1,
          pathScore: 0.7,
          note: '산업 연결 강도',
          steps: null,
        },
        {
          impactPathV2Id: 4,
          triggerEventId: 4,
          sourceEntityId: 4,
          eventType: 'policy_event',
          sourceName: '세 번째 연결',
          sourceEntityKey: 'US:THIRD',
          hopCount: 1,
          pathScore: 0.5,
          note: '산업 연결 강도',
          steps: null,
        },
      ],
    },
    error: null,
    meta: { source: 'database', generatedAt },
  } as ImpactBriefResponse;
}

const relation = {
  rootEntityKey: 'KR:005930',
  nodes: [],
  edges: [],
} as unknown as EntityRelationGraph;

describe('stock briefing model', () => {
  it('caps priorities at three and consolidates the same stock into the priority section', () => {
    const model = createStocksBriefingModel({
      summary: { holdingCount: 4, connectedNewsCount: 7, riskCount: 2, analyzedAt: generatedAt },
      priorityHoldings: [
        {
          entityKey: 'KR:005930',
          priority: 1,
          changeSummary: 'A',
          connectionReason: 'A',
          newsCount: 2,
        },
        {
          entityKey: 'KR:005930',
          changeSummary: '중복 A',
          connectionReason: '중복 A',
          newsCount: 2,
        },
        {
          entityKey: 'KR:000660',
          priority: 2,
          changeSummary: 'B',
          connectionReason: 'B',
          newsCount: 1,
        },
        {
          entityKey: 'KR:035420',
          priority: 3,
          changeSummary: 'C',
          connectionReason: 'C',
          newsCount: 1,
        },
        { entityKey: 'KR:051910', changeSummary: 'D', connectionReason: 'D', newsCount: 1 },
      ],
      watchlistChanges: [
        { entityKey: 'KR:005930', changeSummary: '중복', connectionReason: '중복', newsCount: 2 },
        { entityKey: 'US:NVDA', changeSummary: 'E', connectionReason: 'E', newsCount: 1 },
      ],
    });

    assert.deepEqual(
      model.priorityHoldings.map(({ entityKey }) => entityKey),
      ['KR:005930', 'KR:000660', 'KR:035420'],
    );
    assert.deepEqual(
      model.watchlistChanges.map(({ entityKey }) => entityKey),
      ['US:NVDA'],
    );
  });

  it('derives only supported live summary values and does no browser-side prioritization', () => {
    const model = buildStocksBriefingModel(
      stockList([
        stock({ lastAnalyzedAt: '2026-08-05T00:00:00.000Z' }),
        stock({
          entityKey: 'KR:000660',
          ticker: '000660',
          name: 'SK하이닉스',
          displayName: 'SK하이닉스',
          lastAnalyzedAt: '2026-08-06T00:00:00.000Z',
        }),
        stock({
          entityKey: 'US:NVDA',
          ticker: 'NVDA',
          market: 'US',
          name: 'NVIDIA',
          displayName: 'NVIDIA',
          isHolding: false,
          lastAnalyzedAt: '2026-08-07T00:00:00.000Z',
        }),
      ]),
    );

    assert.deepEqual(model, {
      summary: {
        holdingCount: 2,
        connectedNewsCount: null,
        riskCount: null,
        analyzedAt: '2026-08-06T00:00:00.000Z',
      },
      priorityHoldings: [],
      watchlistChanges: [],
    });
  });

  it('returns an honest empty derivation', () => {
    assert.deepEqual(buildStocksBriefingModel(stockList([])), {
      summary: { holdingCount: 0, connectedNewsCount: null, riskCount: null, analyzedAt: null },
      priorityHoldings: [],
      watchlistChanges: [],
    });
  });

  it('localizes relation and impact failures while preserving base detail and news', async () => {
    const result = await loadStockBriefingData('KR:005930', {
      loadDetail: async () => detailResponse,
      loadRelation: async () => {
        throw new Error('Entity relations failed with 503');
      },
      loadImpactBrief: async () => impactBrief('US:NVDA'),
    });

    assert.equal(result.detail.stock.entityKey, 'KR:005930');
    assert.equal(result.detail.news[0]?.title, 'HBM 공급망 변화');
    assert.equal(result.relation, null);
    assert.match(result.detail.partialFailures.relation ?? '', /503/);
    assert.match(result.detail.partialFailures.impact ?? '', /identity mismatch/);
  });

  it('rejects mandatory detail identity mismatch', async () => {
    await assert.rejects(
      loadStockBriefingData('KR:005930', {
        loadDetail: async () => ({
          ...detailResponse,
          data: {
            ...detailResponse.data!,
            stock: stock({ entityKey: 'US:NVDA', ticker: 'NVDA', market: 'US' }),
          },
        }),
        loadRelation: async () => relation,
        loadImpactBrief: async () => impactBrief(),
      }),
      /Stock detail identity mismatch/,
    );
  });

  it('rejects mandatory stock-detail errors', async () => {
    await assert.rejects(
      loadStockBriefingData('KR:005930', {
        loadDetail: async () => ({
          ...detailResponse,
          availability: 'error',
          error: { code: 'DETAIL_FAILED', message: 'Stock detail failed with 503' },
        }),
        loadRelation: async () => relation,
      }),
      /Stock detail failed with 503/,
    );
  });

  it('localizes supplementary identity mismatches instead of rejecting base detail', async () => {
    const result = await loadStockBriefingData('KR:005930', {
      loadDetail: async () => detailResponse,
      loadRelation: async () => ({ ...relation, rootEntityKey: 'US:NVDA' }),
      loadImpactBrief: async () => impactBrief('US:NVDA'),
    });

    assert.equal(result.detail.stock.entityKey, 'KR:005930');
    assert.equal(result.relation, null);
    assert.match(result.detail.partialFailures.relation ?? '', /identity mismatch/);
    assert.match(result.detail.partialFailures.impact ?? '', /identity mismatch/);
  });

  it('sorts impact paths by score and exposes at most three', async () => {
    const result = await loadStockBriefingData('KR:005930', {
      loadDetail: async () => detailResponse,
      loadRelation: async () => relation,
      loadImpactBrief: async () => impactBrief(),
    });

    assert.deepEqual(
      result.detail.paths.map(({ id, label }) => [id, label]),
      [
        ['impact-2', '가장 높은 연결'],
        ['impact-3', '두 번째 연결'],
        ['impact-4', '세 번째 연결'],
      ],
    );
  });

  it('provides the locked deterministic preview portfolio and briefing order', () => {
    const holdings = stocksPreviewFixture.stocks.data.filter(({ isHolding }) => isHolding);
    const watchlistOnly = stocksPreviewFixture.stocks.data.filter(
      ({ isHolding, isWatched }) => !isHolding && isWatched,
    );

    assert.equal(holdings.length, 5);
    assert.equal(watchlistOnly.length, 4);
    assert.deepEqual(
      stocksBriefingPreviewFixture.priorityHoldings.map(({ entityKey }) => entityKey),
      ['KR:005930', 'KR:000660', 'KR:035420'],
    );
    assert.deepEqual(
      stocksBriefingPreviewFixture.watchlistChanges.map(({ entityKey }) => entityKey),
      ['US:NVDA', 'US:MU'],
    );
  });

  it('serves preview detail through the new loader with valid HTTPS sources', async () => {
    const result = await loadPreviewStockBriefing('KR:005930');
    const urls = Object.values(stockBriefingDetailPreviewFixtures).flatMap(({ news }) =>
      news.flatMap(({ url }) => (url ? [url] : [])),
    );

    assert.equal(result.detail.stock.displayName, '삼성전자');
    assert.equal(result.relation, null);
    assert.ok(urls.length >= 5);
    assert.ok(urls.every((url) => new URL(url).protocol === 'https:'));
  });
});
