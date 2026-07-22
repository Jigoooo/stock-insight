import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildStockDeepDive,
  createLatestRequestGate,
  DEEP_DIVE_SECTION_IDS,
  loadStockDeepDiveData,
} from '../src/pages/research-workspace/model/stock-deep-dive.ts';

import type { StockDetailResponse } from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

const stockDetail = {
  availability: 'available',
  data: {
    stock: {
      entityKey: 'KR:005930',
      ticker: '005930',
      market: 'KR',
      name: '삼성전자',
      displayName: '삼성전자',
      analysisStatus: 'cached',
      isWatched: true,
      isHolding: true,
      latestPrice: 74000,
      currency: 'KRW',
      changePct: 1.2,
      primaryThesis: '메모리 업황 회복',
      confidence: 'medium',
    },
    latestSnapshot: {
      price: 74000,
      currency: 'KRW',
      changePct: 1.2,
      capturedAt: '2026-07-20T00:00:00.000Z',
    },
    deepReport: {
      status: 'available',
      reportMarkdown: '실적 구조와 시나리오를 분석한 보고서',
      researchedAt: '2026-07-20T00:00:00.000Z',
      sources: [{ label: '공시', url: 'https://example.com/filing' }],
    },
    relatedNews: [
      {
        id: 'news-1',
        title: 'HBM 공급 확대',
        context: '공급 계약',
        impact: '높음',
        icon: 'newspaper',
      },
    ],
    risks: ['메모리 가격 하락'],
    checkpoints: ['영업이익률 15% 하회'],
    companyProfile: {
      status: 'available',
      symbol: '005930',
      market: 'KR',
      name: '삼성전자',
      sector: '정보기술',
      industry: '반도체',
      summaryText: '글로벌 반도체 기업',
      sources: [{ label: '공시', url: 'https://example.com/profile' }],
      capturedAt: '2026-07-20T00:00:00.000Z',
    },
    companyMetrics: [
      {
        metricGroup: '수익성',
        fiscalYear: 2026,
        fiscalPeriod: 'Q2',
        currency: 'KRW',
        availability: 'available',
        reportedAt: '2026-07-20T00:00:00.000Z',
        sources: [{ label: '공시', url: 'https://example.com/metrics' }],
        metrics: [{ key: 'op-margin', label: '영업이익률', value: 18, unit: '%' }],
      },
    ],
    learningCards: [],
    glossaryTerms: [],
  },
  error: null,
  meta: { source: 'database', generatedAt: '2026-07-20T00:00:00.000Z' },
} as const;

const relation = {
  rootEntityKey: 'KR:005930',
  asOf: '2026-07-20T00:00:00.000Z',
  nodes: [
    { entityKey: 'KR:005930', label: '삼성전자', market: 'KR' },
    { entityKey: 'US:NVDA', label: 'NVIDIA', market: 'US' },
  ],
  edges: [
    {
      edgeId: 'r1',
      from: 'KR:005930',
      to: 'US:NVDA',
      relationType: 'peer',
      direction: 'undirected',
      weight: 0.8,
      approved: true,
      inferred: false,
      evidenceQuality: 'high',
      evidenceCount: 2,
      clickableSourceCount: 1,
    },
  ],
} as const;

const depthTwoRelation = {
  ...relation,
  nodes: [...relation.nodes, { entityKey: 'US:MSFT', label: 'Microsoft', market: 'US' }],
  edges: [
    { ...relation.edges[0], direction: 'directed', from: 'KR:005930', to: 'US:NVDA' },
    {
      ...relation.edges[0],
      edgeId: 'r2',
      direction: 'directed',
      from: 'US:NVDA',
      to: 'US:MSFT',
    },
  ],
} as const;

describe('P3-WB stock deep dive view model', () => {
  it('always returns the twelve canonical sections in the product order (§21.2)', () => {
    const result = buildStockDeepDive(stockDetail, relation);
    assert.deepEqual(
      result.sections.map((section) => section.id),
      DEEP_DIVE_SECTION_IDS,
    );
    assert.equal(result.sections.length, 12);
  });

  it('keeps identity, performance structure, direct relations and secondary exposure grounded', () => {
    const result = buildStockDeepDive(stockDetail, relation);
    assert.equal(result.availability, 'partial');
    assert.equal(result.entityKey, 'KR:005930');
    assert.equal(result.sections.find((item) => item.id === 'identity')?.availability, 'available');
    assert.equal(
      result.sections.find((item) => item.id === 'performance')?.availability,
      'available',
    );
    assert.equal(result.sections.find((item) => item.id === 'direct_relations')?.itemCount, 1);
    // Secondary exposure cannot be promoted from a one-hop relation; it is explicitly missing.
    assert.equal(
      result.sections.find((item) => item.id === 'secondary_exposure')?.availability,
      'missing',
    );
    const performance = result.sections.find((item) => item.id === 'performance');
    assert.equal(performance?.summary, '1개 근거 연결됨');
    assert.notEqual(performance?.summary, performance?.items.join(' · '));
  });

  it('keeps generic news, risks and checkpoints out of stronger semantic axes', () => {
    const result = buildStockDeepDive(stockDetail, relation);
    for (const id of ['active_events', 'counter_evidence', 'invalidation'] as const) {
      const section = result.sections.find((item) => item.id === id);
      assert.equal(section?.availability, 'missing');
      assert.deepEqual(section?.items, []);
    }
  });

  it('shows only root-adjacent direct edges and preserves directed edge orientation', () => {
    const result = buildStockDeepDive(stockDetail, depthTwoRelation);
    const direct = result.sections.find((item) => item.id === 'direct_relations');
    assert.deepEqual(direct?.items, ['삼성전자 → NVIDIA · peer']);
    assert.equal(
      result.sections.find((item) => item.id === 'secondary_exposure')?.availability,
      'missing',
    );
  });

  it('does not attach a different relation root to the selected stock', () => {
    const wrongRoot = {
      ...relation,
      rootEntityKey: 'US:NVDA',
      nodes: [
        { entityKey: 'US:NVDA', label: 'NVIDIA', market: 'US' },
        { entityKey: 'US:MSFT', label: 'Microsoft', market: 'US' },
      ],
      edges: [
        {
          ...relation.edges[0],
          from: 'US:NVDA',
          to: 'US:MSFT',
        },
      ],
    } as unknown as EntityRelationGraph;
    const result = buildStockDeepDive(stockDetail as unknown as StockDetailResponse, wrongRoot);
    const direct = result.sections.find((item) => item.id === 'direct_relations');
    assert.equal(direct?.availability, 'missing');
    assert.deepEqual(direct?.items, []);
  });

  it('treats a missing detail envelope as authoritative even if residual data is present', async () => {
    const missingWithResidualData = {
      ...stockDetail,
      availability: 'missing',
    } as unknown as StockDetailResponse;
    const built = buildStockDeepDive(
      missingWithResidualData,
      relation as unknown as EntityRelationGraph,
    );
    assert.equal(built.availability, 'missing');
    assert.ok(built.sections.every((section) => section.availability === 'missing'));

    const loaded = await loadStockDeepDiveData('KR:005930', {
      loadDetail: async () => missingWithResidualData,
      loadRelation: async () => relation as unknown as EntityRelationGraph,
    });
    assert.equal(loaded.deepDive.availability, 'missing');
    assert.equal(loaded.relation, null);
  });

  it('returns only the root-direct graph to the direct-relations renderer', async () => {
    const result = await loadStockDeepDiveData('KR:005930', {
      loadDetail: async () => stockDetail,
      loadRelation: async () => depthTwoRelation,
    });
    assert.deepEqual(
      result.relation?.edges.map(({ edgeId }) => edgeId),
      ['r1'],
    );
    assert.deepEqual(result.relation?.nodes.map(({ entityKey }) => entityKey).sort(), [
      'KR:005930',
      'US:NVDA',
    ]);
    assert.equal(result.relation?.depth, 1);
  });

  it('rejects unapproved or inferred root edges from direct text and renderer data', async () => {
    const unsafeRelation = {
      ...relation,
      edges: [
        { ...relation.edges[0], edgeId: 'unapproved', approved: false },
        { ...relation.edges[0], edgeId: 'inferred', inferred: true },
      ],
    } as unknown as EntityRelationGraph;
    const deepDive = buildStockDeepDive(stockDetail, unsafeRelation);
    const direct = deepDive.sections.find((item) => item.id === 'direct_relations');
    assert.equal(direct?.availability, 'missing');
    assert.deepEqual(direct?.items, []);

    const loaded = await loadStockDeepDiveData('KR:005930', {
      loadDetail: async () => stockDetail,
      loadRelation: async () => unsafeRelation,
    });
    assert.equal(loaded.relation, null);
  });

  it('does not promote unavailable or non-performance metric groups', () => {
    const result = buildStockDeepDive(
      {
        ...stockDetail,
        data: {
          ...stockDetail.data,
          companyProfile: { ...stockDetail.data.companyProfile, status: 'missing' },
          companyMetrics: [
            { ...stockDetail.data.companyMetrics[0], availability: 'unsupported' },
            {
              ...stockDetail.data.companyMetrics[0],
              metricGroup: 'market_snapshot',
              availability: 'available',
            },
          ],
        },
      },
      relation,
    );
    const performance = result.sections.find((item) => item.id === 'performance');
    assert.equal(performance?.availability, 'missing');
    assert.deepEqual(performance?.items, []);
  });

  it('never fabricates unsupported factor, analog, scenario or derivation data', () => {
    const result = buildStockDeepDive(stockDetail, relation);
    for (const id of ['factor_exposure', 'historical_analog', 'scenario', 'derivation'] as const) {
      const section = result.sections.find((item) => item.id === id);
      assert.equal(section?.availability, 'missing');
      assert.deepEqual(section?.items, []);
    }
  });

  it('marks the holding judgment as partial and non-actionable rather than investment advice', () => {
    const result = buildStockDeepDive(stockDetail, relation);
    const judgment = result.sections.find((item) => item.id === 'holding_judgment');
    assert.equal(judgment?.availability, 'partial');
    assert.match(judgment?.summary ?? '', /보유 상태|의사결정 근거/);
    assert.doesNotMatch(judgment?.summary ?? '', /매수|매도|추천/);
  });

  it('does not treat a thesis as a holding judgment for a non-held stock', () => {
    const result = buildStockDeepDive(
      {
        ...stockDetail,
        data: {
          ...stockDetail.data,
          stock: { ...stockDetail.data.stock, isHolding: false },
        },
      },
      relation,
    );
    const judgment = result.sections.find((item) => item.id === 'holding_judgment');
    assert.equal(judgment?.availability, 'missing');
    assert.deepEqual(judgment?.items, []);
  });

  it('returns an explicit unavailable result when stock detail is absent', () => {
    const result = buildStockDeepDive(
      {
        data: null,
        availability: 'missing',
        error: null,
        meta: { source: 'fallback', generatedAt: '2026-07-20T00:00:00.000Z' },
      },
      null,
    );
    assert.equal(result.availability, 'missing');
    assert.equal(result.sections.length, 12);
    assert.ok(result.sections.every((section) => section.availability === 'missing'));
  });

  it('keeps stock detail usable when the optional relation endpoint is unavailable', async () => {
    const result = await loadStockDeepDiveData('KR:005930', {
      loadDetail: async () => stockDetail,
      loadRelation: async () => {
        throw new Error('Entity relations failed with 404');
      },
    });
    assert.equal(result.deepDive.availability, 'partial');
    assert.equal(result.relation, null);
    assert.equal(
      result.deepDive.sections.find((section) => section.id === 'direct_relations')?.availability,
      'missing',
    );
  });

  it('fails closed for relation 5xx and stock-detail error envelopes', async () => {
    await assert.rejects(
      loadStockDeepDiveData('KR:005930', {
        loadDetail: async () => stockDetail,
        loadRelation: async () => {
          throw new Error('Entity relations failed with 500');
        },
      }),
      /500/,
    );
    await assert.rejects(
      loadStockDeepDiveData('KR:005930', {
        loadDetail: async () => ({
          data: null,
          availability: 'error',
          error: { code: 'db_error', message: 'detail failed' },
          meta: { source: 'fallback', generatedAt: '2026-07-20T00:00:00.000Z' },
        }),
        loadRelation: async () => relation,
      }),
      /detail failed/,
    );
  });

  it('preserves the requested entity identity for missing detail envelopes', async () => {
    const result = await loadStockDeepDiveData('US:UNKNOWN', {
      loadDetail: async () => ({
        data: null,
        availability: 'missing',
        error: null,
        meta: { source: 'fallback', generatedAt: '2026-07-20T00:00:00.000Z' },
      }),
      loadRelation: async () => ({
        ...relation,
        rootEntityKey: 'US:UNKNOWN',
        nodes: [{ entityKey: 'US:UNKNOWN', label: 'Unknown', market: 'US' }],
        edges: [],
      }),
    });
    assert.equal(result.deepDive.entityKey, 'US:UNKNOWN');
    assert.equal(result.deepDive.displayName, 'US:UNKNOWN');
    assert.equal(result.deepDive.availability, 'missing');
    assert.equal(result.relation, null);
  });

  it('fails closed when requested, detail and relation identities disagree', async () => {
    await assert.rejects(
      loadStockDeepDiveData('US:NVDA', {
        loadDetail: async () => stockDetail,
        loadRelation: async () => ({ ...relation, rootEntityKey: 'US:NVDA' }),
      }),
      /detail identity mismatch/,
    );
    await assert.rejects(
      loadStockDeepDiveData('KR:005930', {
        loadDetail: async () => stockDetail,
        loadRelation: async () => ({ ...relation, rootEntityKey: 'US:NVDA' }),
      }),
      /relation identity mismatch/,
    );
  });

  it('invalidates an in-flight generation on unmount cleanup', () => {
    const gate = createLatestRequestGate();
    const first = gate.next();
    assert.equal(gate.isCurrent(first), true);
    gate.invalidate();
    assert.equal(gate.isCurrent(first), false);
  });
});
