import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MARKET_EXPLORATION_IDS,
  buildMarketOverview,
  resolveMarketExplorationState,
} from '../src/pages/research-workspace/model/market-overview.ts';

import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type {
  MarketComponentWatermarks,
  RadarSignalItem,
} from '@stock-insight/contracts/research-workspace';

const signals: RadarSignalItem[] = [
  {
    signalKey: 'signal-1',
    entityKey: 'KR:005930',
    market: 'KR',
    symbol: '005930',
    name: '삼성전자',
    signalType: 'price_spike',
    polarity: 'positive',
    strength: 0.9,
    summary: '가격 급등 신호',
    occurredAt: '2026-07-22T01:00:00.000Z',
    sourceName: '시장 데이터',
    watched: true,
    holding: false,
  },
  {
    signalKey: 'signal-2',
    entityKey: 'US:NVDA',
    market: 'US',
    symbol: 'NVDA',
    name: 'NVIDIA',
    signalType: 'price_spike',
    polarity: 'positive',
    strength: 0.7,
    summary: '동일 유형 신호',
    occurredAt: '2026-07-22T02:00:00.000Z',
    sourceName: '시장 데이터',
    watched: false,
    holding: true,
  },
  {
    signalKey: 'signal-3',
    entityKey: 'US:META',
    market: 'US',
    symbol: 'META',
    name: 'Meta Platforms',
    signalType: 'volume_spike',
    polarity: 'neutral',
    strength: 0.5,
    summary: '거래량 급증 신호',
    occurredAt: '2026-07-21T23:00:00.000Z',
    sourceName: null,
    watched: false,
    holding: false,
  },
];

const watermarks = {
  event_radar: { availability: 'stale', watermarkAt: '2026-07-20T00:00:00.000Z', rowCount: 30 },
  factor_map: { availability: 'partial', watermarkAt: '2026-07-21T00:00:00.000Z', rowCount: 3 },
  propagation_map: {
    availability: 'available',
    watermarkAt: '2026-07-21T01:00:00.000Z',
    rowCount: 2,
  },
  theme_community: { availability: 'missing', watermarkAt: null, rowCount: 0 },
  heatmap_matrix: {
    availability: 'available',
    watermarkAt: '2026-07-21T02:00:00.000Z',
    rowCount: 99,
  },
  timeline: { availability: 'stale', watermarkAt: '2026-07-21T03:00:00.000Z', rowCount: 1 },
  map_globe: { availability: 'missing', watermarkAt: null, rowCount: 0 },
  value_chain: { availability: 'missing', watermarkAt: null, rowCount: 0 },
} satisfies MarketComponentWatermarks;

describe('market secondary exploration model', () => {
  it('exposes exactly four secondary explorations with factor map first', () => {
    assert.deepEqual(MARKET_EXPLORATION_IDS, [
      'factor_map',
      'propagation_map',
      'timeline',
      'map_globe',
    ]);
    assert.equal(buildMarketOverview(signals).explorations[0]?.id, 'factor_map');
  });

  it('retains the observed groups, heatmap rows, ordered propagation and chronology', () => {
    const overview = buildMarketOverview(signals);
    assert.deepEqual(overview.signalTypeGroups, [
      {
        signalType: 'price_spike',
        signalCount: 2,
        maxStrength: 0.9,
        targets: [
          { entityKey: 'KR:005930', name: '삼성전자', symbol: '005930', market: 'KR' },
          { entityKey: 'US:NVDA', name: 'NVIDIA', symbol: 'NVDA', market: 'US' },
        ],
        semantics: 'observed_association',
      },
      {
        signalType: 'volume_spike',
        signalCount: 1,
        maxStrength: 0.5,
        targets: [{ entityKey: 'US:META', name: 'Meta Platforms', symbol: 'META', market: 'US' }],
        semantics: 'observed_association',
      },
    ]);
    assert.deepEqual(
      overview.heatmapRows.map(({ signalKey, strengthPercent }) => ({
        signalKey,
        strengthPercent,
      })),
      [
        { signalKey: 'signal-1', strengthPercent: 90 },
        { signalKey: 'signal-2', strengthPercent: 70 },
        { signalKey: 'signal-3', strengthPercent: 50 },
      ],
    );
    assert.deepEqual(
      overview.propagationItems.map(({ signalType }) => signalType),
      ['price_spike', 'volume_spike'],
    );
    assert.deepEqual(
      overview.timelineItems.map(({ signalKey }) => signalKey),
      ['signal-2', 'signal-1', 'signal-3'],
    );
  });

  it('keeps empty derived collections honest', () => {
    const overview = buildMarketOverview([]);
    assert.deepEqual(overview.signalTypeGroups, []);
    assert.deepEqual(overview.heatmapRows, []);
    assert.deepEqual(overview.propagationItems, []);
    assert.deepEqual(overview.timelineItems, []);
  });

  it('resolves each exploration from its own component clock', () => {
    assert.deepEqual(resolveMarketExplorationState('factor_map', watermarks), {
      availability: 'partial',
      watermarkAt: '2026-07-21T00:00:00.000Z',
      rowCount: 3,
    });
    assert.deepEqual(resolveMarketExplorationState('propagation_map', watermarks), {
      availability: 'available',
      watermarkAt: '2026-07-21T01:00:00.000Z',
      rowCount: 2,
    });
    assert.deepEqual(resolveMarketExplorationState('timeline', watermarks), {
      availability: 'stale',
      watermarkAt: '2026-07-21T03:00:00.000Z',
      rowCount: 1,
    });
  });

  it('lets the sealed Geo snapshot own only the map state', () => {
    const geoSnapshot = {
      availability: 'partial',
      sourceAsOf: '2026-07-21T04:00:00.000Z',
      geojson: { features: [{}, {}] },
    } as unknown as GeoSnapshot;

    assert.deepEqual(resolveMarketExplorationState('map_globe', watermarks, geoSnapshot), {
      availability: 'partial',
      watermarkAt: '2026-07-21T04:00:00.000Z',
      rowCount: 2,
    });
    assert.equal(
      resolveMarketExplorationState('factor_map', watermarks, geoSnapshot).watermarkAt,
      '2026-07-21T00:00:00.000Z',
    );
  });

  it('preserves empty component clocks without borrowing another clock', () => {
    const emptyFactor = {
      ...watermarks,
      factor_map: { availability: 'empty', watermarkAt: null, rowCount: 0 },
    } satisfies MarketComponentWatermarks;
    assert.deepEqual(resolveMarketExplorationState('factor_map', emptyFactor), {
      availability: 'empty',
      watermarkAt: null,
      rowCount: 0,
    });
    assert.deepEqual(resolveMarketExplorationState('map_globe', watermarks), {
      availability: 'missing',
      watermarkAt: null,
      rowCount: 0,
    });
  });
});
