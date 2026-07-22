import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MARKET_MODE_IDS,
  buildMarketOverview,
  describeMarketModeState,
  marketConnectionLabel,
} from '../src/pages/research-workspace/model/market-overview.ts';

import type { RadarSignalItem } from '@stock-insight/contracts/research-workspace';

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

describe('P3-WC market overview model', () => {
  it('exposes the eight canonical market screens in the roadmap order', () => {
    assert.deepEqual(MARKET_MODE_IDS, [
      'event_radar',
      'factor_map',
      'propagation_map',
      'theme_community',
      'heatmap_matrix',
      'timeline',
      'map_globe',
      'value_chain',
    ]);
  });

  it('marks direct, observational and unavailable modes truthfully', () => {
    const overview = buildMarketOverview(signals);
    assert.deepEqual(
      overview.modes.map(({ id, availability, evidenceBasis }) => ({
        id,
        availability,
        evidenceBasis,
      })),
      [
        { id: 'event_radar', availability: 'available', evidenceBasis: 'direct' },
        { id: 'factor_map', availability: 'partial', evidenceBasis: 'derived_observation' },
        { id: 'propagation_map', availability: 'partial', evidenceBasis: 'derived_observation' },
        { id: 'theme_community', availability: 'missing', evidenceBasis: 'unavailable' },
        { id: 'heatmap_matrix', availability: 'available', evidenceBasis: 'direct' },
        { id: 'timeline', availability: 'available', evidenceBasis: 'direct' },
        { id: 'map_globe', availability: 'missing', evidenceBasis: 'unavailable' },
        { id: 'value_chain', availability: 'missing', evidenceBasis: 'unavailable' },
      ],
    );
    assert.equal(
      overview.modes[2]?.limitation,
      '동일 유형 관측 연결이며 전파 방향이나 인과관계를 뜻하지 않습니다.',
    );
  });

  it('groups observed signal types without claiming factor coefficients or causality', () => {
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
  });

  it('derives heatmap and timeline rows only from returned signal fields', () => {
    const overview = buildMarketOverview(signals);
    assert.deepEqual(
      overview.heatmapRows.map(({ signalKey, strengthPercent, watched, holding }) => ({
        signalKey,
        strengthPercent,
        watched,
        holding,
      })),
      [
        { signalKey: 'signal-1', strengthPercent: 90, watched: true, holding: false },
        { signalKey: 'signal-2', strengthPercent: 70, watched: false, holding: true },
        { signalKey: 'signal-3', strengthPercent: 50, watched: false, holding: false },
      ],
    );
    assert.deepEqual(
      overview.timelineItems.map(({ signalKey }) => signalKey),
      ['signal-2', 'signal-1', 'signal-3'],
    );
  });

  it('distinguishes supported empty results from unsupported sources', () => {
    const overview = buildMarketOverview([]);
    assert.deepEqual(
      overview.modes.map(({ id, availability }) => [id, availability]),
      [
        ['event_radar', 'empty'],
        ['factor_map', 'empty'],
        ['propagation_map', 'empty'],
        ['theme_community', 'missing'],
        ['heatmap_matrix', 'empty'],
        ['timeline', 'empty'],
        ['map_globe', 'missing'],
        ['value_chain', 'missing'],
      ],
    );
    assert.deepEqual(overview.signalTypeGroups, []);
    assert.deepEqual(overview.heatmapRows, []);
    assert.deepEqual(overview.timelineItems, []);
    assert.deepEqual(describeMarketModeState(overview.modes[0]!), {
      kind: 'empty',
      title: '이벤트 레이더에 표시할 신호 없음',
      description:
        '현재 범위에서 관측된 시장 신호가 없습니다. 원천은 연결되어 있으며 새 신호가 들어오면 이 화면에 표시합니다.',
    });
    assert.deepEqual(describeMarketModeState(overview.modes[3]!), {
      kind: 'missing',
      title: '테마 커뮤니티 데이터 준비 중',
      description: '현재 레이더 응답에 테마 구성원 원천이 연결되지 않았습니다.',
    });
  });

  it('preserves simultaneous holding and watchlist relationships', () => {
    assert.equal(marketConnectionLabel({ watched: true, holding: true }), '보유 · 관심');
    assert.equal(marketConnectionLabel({ watched: false, holding: true }), '보유');
    assert.equal(marketConnectionLabel({ watched: true, holding: false }), '관심');
    assert.equal(marketConnectionLabel({ watched: false, holding: false }), '일반');
  });
});
