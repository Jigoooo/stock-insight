import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMarketConnectionsModel,
  createMarketConnectionsModel,
  loadMarketConnectionData,
  marketConnectionScopeLabel,
  marketConnectionStrength,
  marketConnectionStrengthLabel,
} from '../src/pages/research-workspace/model/market-connections.ts';

import type { ImpactBriefResponse } from '@stock-insight/contracts';
import { geoSnapshotSchema, precisionClassSchema } from '@stock-insight/contracts/geo-api-contract';
import type {
  EntityRelationGraph,
  RadarSignalItem,
  RadarSignalPage,
} from '@stock-insight/contracts/research-workspace';

const generatedAt = '2026-08-07T09:30:00.000Z';
const occurredAt = '2026-08-07T09:00:00.000Z';

function signal(signalKey: string, overrides: Partial<RadarSignalItem> = {}): RadarSignalItem {
  return {
    signalKey,
    entityKey: 'US:NVDA',
    market: 'US',
    symbol: 'NVDA',
    name: 'NVIDIA',
    signalType: 'price_mover',
    polarity: 'positive',
    strength: 0.8,
    summary: '같은 시각에 관측된 같은 유형의 변화',
    occurredAt,
    sourceName: 'market_signals',
    watched: false,
    holding: false,
    ...overrides,
  };
}

function radarPage(items: RadarSignalItem[], scopeTotal = items.length): RadarSignalPage {
  return {
    generatedAt,
    signalAsOf: occurredAt,
    scopeTotal,
    componentWatermarks: {
      event_radar: { availability: 'available', watermarkAt: occurredAt, rowCount: items.length },
      factor_map: { availability: 'partial', watermarkAt: occurredAt, rowCount: items.length },
      propagation_map: {
        availability: 'partial',
        watermarkAt: occurredAt,
        rowCount: items.length,
      },
      theme_community: { availability: 'missing', watermarkAt: null, rowCount: 0 },
      heatmap_matrix: {
        availability: 'available',
        watermarkAt: occurredAt,
        rowCount: items.length,
      },
      timeline: { availability: 'available', watermarkAt: occurredAt, rowCount: items.length },
      map_globe: { availability: 'missing', watermarkAt: null, rowCount: 0 },
      value_chain: { availability: 'missing', watermarkAt: null, rowCount: 0 },
    },
    items,
    nextCursor: null,
  };
}

function relation(rootEntityKey = 'US:NVDA'): EntityRelationGraph {
  return {
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt,
      freshness: 'available',
      contentSnapshot: {
        analysisRunId: 'run-1',
        analysisRevision: 1,
        analysisCutoffAt: occurredAt,
        sourceWatermarkAt: occurredAt,
        freshUntil: generatedAt,
      },
      graphSnapshot: {
        requestedAsOf: occurredAt,
        knownThroughAt: occurredAt,
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: { marketDataAsOf: occurredAt },
      sourceCoverage: { linked: 0, clickable: 0, total: 0 },
      qualityFlags: [],
    },
    rootEntityKey,
    depth: 0,
    nodes: [
      {
        entityKey: rootEntityKey,
        label: rootEntityKey,
        market: rootEntityKey.startsWith('KR:') ? 'KR' : 'US',
        watched: false,
        holding: false,
      },
    ],
    edges: [],
    evidenceSummary: { evidenceCount: 0, clickableSourceCount: 0, limitation: '관계 없음' },
  };
}

function impactBrief(entityKey = 'US:NVDA'): ImpactBriefResponse {
  return {
    availability: 'available',
    data: {
      entityKey,
      contentPackId: 1,
      packDigest: 'digest-1',
      graphSnapshotId: 1,
      builtAt: generatedAt,
      freshUntil: '2026-08-08T09:30:00.000Z',
      paths: [
        {
          impactPathV2Id: 1,
          triggerEventId: 1,
          sourceEntityId: 1,
          eventType: 'earnings',
          sourceName: '낮은 연결',
          sourceEntityKey: 'US:LOW',
          hopCount: 1,
          pathScore: 0.2,
          note: '낮은 연결 근거',
          steps: null,
        },
        {
          impactPathV2Id: 2,
          triggerEventId: 2,
          sourceEntityId: 2,
          eventType: 'policy_event',
          sourceName: '가장 높은 연결',
          sourceEntityKey: 'US:HIGH',
          hopCount: 2,
          pathScore: 0.9,
          note: '높은 연결 근거',
          steps: null,
        },
        {
          impactPathV2Id: 3,
          triggerEventId: 3,
          sourceEntityId: 3,
          eventType: 'regulation',
          sourceName: '두 번째 연결',
          sourceEntityKey: 'US:MID',
          hopCount: 1,
          pathScore: 0.7,
          note: '중간 연결 근거',
          steps: null,
        },
        {
          impactPathV2Id: 4,
          triggerEventId: 4,
          sourceEntityId: 4,
          eventType: 'analyst',
          sourceName: '세 번째 연결',
          sourceEntityKey: 'US:THIRD',
          hopCount: 1,
          pathScore: 0.5,
          note: '세 번째 연결 근거',
          steps: null,
        },
      ],
    },
    error: null,
    meta: { source: 'database', generatedAt },
  } as ImpactBriefResponse;
}

describe('market connections model', () => {
  it('preserves server order and row identity while splitting the first three personal signals', () => {
    const page = radarPage(
      [
        signal('holding-and-watched', { holding: true, watched: true, strength: 0.67 }),
        signal('watched-only', { watched: true, strength: 0.669_999 }),
        signal('market-only', { strength: 0.34 }),
        signal('holding-only', { holding: true, strength: 0.339_999 }),
        signal('fourth-personal', { watched: true, entityKey: 'US:AAPL', name: 'Apple' }),
        signal('duplicate-looking-row'),
      ],
      19,
    );

    const model = buildMarketConnectionsModel(page);

    assert.deepEqual(model.summary, {
      changeCount: 19,
      directConnectionCount: null,
      riskCount: null,
      analyzedAt: occurredAt,
    });
    assert.deepEqual(
      model.priorityChanges.map(({ connectionKey, priority }) => [connectionKey, priority]),
      [
        ['holding-and-watched', 1],
        ['watched-only', 2],
        ['holding-only', 3],
      ],
    );
    assert.deepEqual(
      model.marketChanges.map(({ connectionKey }) => connectionKey),
      ['market-only', 'fourth-personal', 'duplicate-looking-row'],
    );
    assert.equal(model.priorityChanges[0]?.connectedEntities.length, 1);
    assert.deepEqual(model.priorityChanges[0]?.connectedEntities[0], {
      entityKey: 'US:NVDA',
      displayName: 'NVIDIA',
      holding: true,
      watched: true,
    });
    assert.equal(model.priorityChanges[0]?.title, '가격 변화');
    assert.equal(model.marketChanges[0]?.scope, 'market');
    assert.equal(model.marketChanges[0]?.whyNow, undefined);
    assert.equal(model.marketChanges[0]?.primaryPath, undefined);
    assert.equal(model.marketChanges[0]?.riskSummary, undefined);
  });

  it('uses the exact strength boundaries and exposes stable labels', () => {
    assert.equal(marketConnectionStrength(0.67), 'high');
    assert.equal(marketConnectionStrength(0.669_999), 'medium');
    assert.equal(marketConnectionStrength(0.34), 'medium');
    assert.equal(marketConnectionStrength(0.339_999), 'low');
    assert.equal(marketConnectionStrengthLabel('high'), '높음');
    assert.equal(marketConnectionStrengthLabel('medium'), '보통');
    assert.equal(marketConnectionStrengthLabel('low'), '낮음');
    assert.equal(marketConnectionScopeLabel('holding'), '보유종목');
    assert.equal(marketConnectionScopeLabel('watchlist'), '관심종목');
    assert.equal(marketConnectionScopeLabel('indirect'), '간접 연결');
    assert.equal(marketConnectionScopeLabel('market'), '시장 전체');
  });

  it('deduplicates only identical keys in provided models and returns an honest empty live model', () => {
    const duplicate = {
      connectionKey: 'same-key',
      market: 'GLOBAL' as const,
      title: '같은 키',
      summary: '서버 fixture 중복',
      scope: 'market' as const,
      strength: 'low' as const,
      occurredAt,
      connectedEntities: [],
    };
    const distinct = { ...duplicate, connectionKey: 'distinct-key' };
    const normalized = createMarketConnectionsModel({
      summary: { changeCount: 2, directConnectionCount: null, riskCount: null, analyzedAt: null },
      priorityChanges: [
        duplicate,
        duplicate,
        distinct,
        { ...distinct, connectionKey: 'third' },
        { ...distinct, connectionKey: 'fourth' },
      ],
      marketChanges: [
        duplicate,
        distinct,
        { ...distinct, connectionKey: 'fourth' },
        { ...distinct, connectionKey: 'market-only' },
      ],
    });

    assert.deepEqual(
      normalized.priorityChanges.map(({ connectionKey }) => connectionKey),
      ['same-key', 'distinct-key', 'third'],
    );
    assert.deepEqual(
      normalized.marketChanges.map(({ connectionKey }) => connectionKey),
      ['fourth', 'market-only'],
    );
    assert.deepEqual(buildMarketConnectionsModel(radarPage([], 0)), {
      summary: {
        changeCount: 0,
        directConnectionCount: null,
        riskCount: null,
        analyzedAt: occurredAt,
      },
      priorityChanges: [],
      marketChanges: [],
    });
  });
});

describe('market connection live detail loader', () => {
  it('keeps base signal detail and sorts at most three supplementary impact paths', async () => {
    const result = await loadMarketConnectionData(signal('signal-detail'), {
      loadRelation: async () => relation(),
      loadImpactBrief: async () => impactBrief(),
    });

    assert.equal(result.detail.item.connectionKey, 'signal-detail');
    assert.equal(result.detail.item.title, '가격 변화');
    assert.equal(result.detail.generatedAt, occurredAt);
    assert.equal(result.detail.availability, 'available');
    assert.deepEqual(
      result.detail.paths.map(({ id, label, summary }) => [id, label, summary]),
      [
        ['impact-2', '가장 높은 연결', '높은 연결 근거'],
        ['impact-3', '두 번째 연결', '중간 연결 근거'],
        ['impact-4', '세 번째 연결', '세 번째 연결 근거'],
      ],
    );
    assert.deepEqual(result.detail.sources, [
      {
        id: 'radar-signal-detail',
        title: '가격 변화',
        summary: '같은 시각에 관측된 같은 유형의 변화',
        sourceName: 'market_signals',
        publishedAt: occurredAt,
      },
    ]);
    assert.equal(result.detail.sources[0]?.url, undefined);
    assert.deepEqual(result.detail.risks, []);
    assert.deepEqual(result.detail.counterEvidence, []);
    assert.deepEqual(result.detail.checkpoints, []);
    assert.deepEqual(result.detail.relatedEvents, []);
    assert.deepEqual(result.detail.partialFailures, {});
    assert.equal(result.relation?.rootEntityKey, 'US:NVDA');
    assert.equal(result.geo, null);
  });

  it('localizes relation and impact transport failures without losing base detail', async () => {
    const relationFailure = await loadMarketConnectionData(signal('relation-failure'), {
      loadRelation: async () => {
        throw new Error('relation unavailable');
      },
      loadImpactBrief: async () => impactBrief(),
    });
    const impactFailure = await loadMarketConnectionData(signal('impact-failure'), {
      loadRelation: async () => relation(),
      loadImpactBrief: async () => {
        throw new Error('impact unavailable');
      },
    });

    assert.equal(relationFailure.detail.availability, 'partial');
    assert.deepEqual(relationFailure.detail.partialFailures, {
      relation: 'relation unavailable',
    });
    assert.equal(relationFailure.relation, null);
    assert.equal(relationFailure.detail.paths.length, 3);
    assert.equal(impactFailure.detail.availability, 'partial');
    assert.deepEqual(impactFailure.detail.partialFailures, { impact: 'impact unavailable' });
    assert.equal(impactFailure.relation?.rootEntityKey, 'US:NVDA');
    assert.deepEqual(impactFailure.detail.paths, []);
    assert.equal(impactFailure.detail.item.connectionKey, 'impact-failure');
    assert.equal(impactFailure.detail.sources[0]?.sourceName, 'market_signals');
  });

  it('discards only mismatched supplementary results and records both identities', async () => {
    const result = await loadMarketConnectionData(signal('identity-mismatch'), {
      loadRelation: async () => relation('US:AAPL'),
      loadImpactBrief: async () => impactBrief('US:MSFT'),
    });

    assert.equal(result.detail.availability, 'partial');
    assert.equal(result.relation, null);
    assert.deepEqual(result.detail.paths, []);
    assert.match(result.detail.partialFailures.relation ?? '', /US:NVDA.*US:AAPL/);
    assert.match(result.detail.partialFailures.impact ?? '', /US:NVDA.*US:MSFT/);
    assert.equal(result.detail.item.connectionKey, 'identity-mismatch');
    assert.equal(result.detail.item.summary, '같은 시각에 관측된 같은 유형의 변화');
  });
});

describe('market connections development preview', () => {
  async function loadPreviewFixture() {
    const fixtureModule =
      await import('../src/pages/dev-preview/model/market-connections-preview-fixture.ts').catch(
        () => null,
      );
    assert.ok(fixtureModule, 'expected the Market Connections preview fixture to exist');
    return fixtureModule;
  }

  it('provides complete deterministic grouped stories with unique HTTPS evidence', async () => {
    const fixtureModule = await loadPreviewFixture();
    if (!fixtureModule) return;

    const first = fixtureModule.resolveMarketConnectionsPreview('default');
    const second = fixtureModule.resolveMarketConnectionsPreview('default');
    const visibleItems = [
      ...first.marketConnections.priorityChanges,
      ...first.marketConnections.marketChanges,
    ];

    assert.equal(first.data.view, 'radar');
    assert.equal(first.data.geoSnapshot.availability, 'available');
    assert.equal(geoSnapshotSchema.safeParse(first.data.geoSnapshot).success, true);
    assert.ok(first.data.geoSnapshot.geojson.features.length > 0);
    assert.equal(new URL(first.data.geoSnapshot.mvt.urlTemplate ?? '').protocol, 'https:');
    assert.equal(first.marketConnections.priorityChanges.length, 3);
    assert.ok(first.marketConnections.marketChanges.some(({ scope }) => scope !== 'market'));
    assert.ok(
      first.marketConnections.marketChanges.filter(({ scope }) => scope === 'market').length >= 2,
    );
    assert.ok(visibleItems.some(({ connectedEntities }) => connectedEntities.length > 1));
    assert.equal(
      new Set(visibleItems.map(({ connectionKey }) => connectionKey)).size,
      visibleItems.length,
    );
    assert.deepEqual(
      first.marketConnections.priorityChanges.map(({ connectionKey, priority }) => [
        connectionKey,
        priority,
      ]),
      second.marketConnections.priorityChanges.map(({ connectionKey, priority }) => [
        connectionKey,
        priority,
      ]),
    );

    for (const item of visibleItems) {
      const result = await first.loader(item.connectionKey);
      assert.equal(result.detail.item.connectionKey, item.connectionKey);
      assert.ok(result.detail.paths.length > 0);
      assert.ok(result.detail.sources.length > 0 && result.detail.sources.length <= 3);
      assert.ok(result.detail.risks.length > 0);
      assert.ok(result.detail.counterEvidence.length > 0);
      assert.ok(result.detail.checkpoints.length > 0);
      assert.ok(result.detail.relatedEvents.length > 0);
      assert.ok(result.detail.evidenceLevel);
      assert.ok(result.relation);
      assert.ok(result.geo);
      assert.equal(geoSnapshotSchema.safeParse(result.geo).success, true);
      assert.ok(
        result.geo.geojson.features.every(
          ({ properties }) => properties.evidenceLocator?.sourceId === item.connectionKey,
        ),
      );
      for (const source of result.detail.sources) {
        assert.equal(new URL(source.url ?? '').protocol, 'https:');
      }
    }

    const firstResult = await first.loader(visibleItems[0]!.connectionKey);
    const secondResult = await first.loader(visibleItems[1]!.connectionKey);
    assert.notEqual(firstResult.geo?.snapshotId, secondResult.geo?.snapshotId);
    assert.notDeepEqual(
      firstResult.geo?.geojson.features.map(({ properties }) => properties.geoEntityKey),
      secondResult.geo?.geojson.features.map(({ properties }) => properties.geoEntityKey),
    );
  });

  it('maps every contract precision value without accepting invented values', async () => {
    const model = await import('../src/pages/research-workspace/model/market-connections.ts');
    assert.equal(typeof model.marketConnectionGeoPrecisionLabel, 'function');
    if (typeof model.marketConnectionGeoPrecisionLabel !== 'function') return;

    assert.deepEqual(precisionClassSchema.options.map(model.marketConnectionGeoPrecisionLabel), [
      '정확한 위치',
      '근사 위치',
      '행정구역',
      '국가 범위',
      '정밀도 미확인',
    ]);
  });

  it('omits valid no-content Geo unless a localized failure owns the section', async () => {
    const fixtureModule = await loadPreviewFixture();
    if (!fixtureModule) return;

    const partial = fixtureModule.resolveMarketConnectionsPreview('partial');
    const partialItem = partial.marketConnections.priorityChanges[0]!;
    const partialResult = await partial.loader(partialItem.connectionKey);
    const model = await import('../src/pages/research-workspace/model/market-connections.ts');

    assert.equal(geoSnapshotSchema.safeParse(partial.data.geoSnapshot).success, true);
    assert.equal(partial.data.geoSnapshot.geojson.features.length, 0);
    assert.equal(typeof model.hasMarketConnectionGeoSection, 'function');
    if (typeof model.hasMarketConnectionGeoSection !== 'function') return;

    assert.equal(model.hasMarketConnectionGeoSection(partial.data.geoSnapshot, undefined), false);
    assert.equal(
      model.hasMarketConnectionGeoSection(
        partialResult.geo,
        partialResult.detail.partialFailures.geo,
      ),
      true,
    );
  });

  it('keeps each preview scenario honest and never reaches a live loader', async () => {
    const fixtureModule = await loadPreviewFixture();
    if (!fixtureModule) return;

    const originalFetch = globalThis.fetch;
    let networkCallCount = 0;
    globalThis.fetch = (() => {
      networkCallCount += 1;
      throw new Error('preview fixture attempted a network call');
    }) as typeof fetch;

    try {
      const noPersonalized = fixtureModule.resolveMarketConnectionsPreview('no-personalized');
      const noPersonalizedItems = [
        ...noPersonalized.marketConnections.priorityChanges,
        ...noPersonalized.marketConnections.marketChanges,
      ];
      assert.deepEqual(noPersonalized.marketConnections.priorityChanges, []);
      assert.ok(noPersonalizedItems.length >= 2);
      assert.ok(noPersonalizedItems.every(({ scope }) => scope === 'market'));
      await noPersonalized.loader(noPersonalizedItems[0]!.connectionKey);
      await assert.rejects(
        noPersonalized.loader('preview:semiconductor-ai-supply'),
        /Unknown Market Connections preview/,
      );

      const empty = fixtureModule.resolveMarketConnectionsPreview('empty');
      assert.equal(empty.marketConnections.summary.changeCount, 0);
      assert.deepEqual(empty.marketConnections.priorityChanges, []);
      assert.deepEqual(empty.marketConnections.marketChanges, []);
      await assert.rejects(
        empty.loader('preview:semiconductor-ai-supply'),
        /Unknown Market Connections preview/,
      );

      const partial = fixtureModule.resolveMarketConnectionsPreview('partial');
      const partialItem = partial.marketConnections.priorityChanges[0]!;
      const partialResult = await partial.loader(partialItem.connectionKey);
      assert.equal(partialResult.detail.item.connectionKey, partialItem.connectionKey);
      assert.equal(partial.data.geoSnapshot.availability, 'unavailable');
      assert.equal(geoSnapshotSchema.safeParse(partial.data.geoSnapshot).success, true);
      assert.equal(partialResult.detail.availability, 'partial');
      assert.ok(partialResult.detail.paths.length > 0);
      assert.ok(partialResult.detail.sources.length > 0);
      assert.deepEqual(partialResult.detail.relatedEvents, []);
      assert.deepEqual(Object.keys(partialResult.detail.partialFailures).sort(), [
        'geo',
        'history',
        'relation',
      ]);
      assert.equal(partialResult.relation, null);
      assert.equal(partialResult.geo, null);

      const detailError = fixtureModule.resolveMarketConnectionsPreview('detail-error');
      const selected = detailError.marketConnections.priorityChanges[0]!;
      await assert.rejects(detailError.loader(selected.connectionKey), /개발 미리보기/);
      assert.equal(
        detailError.marketConnections.priorityChanges.find(
          ({ connectionKey }) => connectionKey === selected.connectionKey,
        ),
        selected,
      );

      const defaultPreview = fixtureModule.resolveMarketConnectionsPreview('default');
      await defaultPreview.loader(
        defaultPreview.marketConnections.priorityChanges[0]!.connectionKey,
      );
      assert.equal(networkCallCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
