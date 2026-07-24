import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRadarSignals, type RadarSignalQueryExecutor } from '../src/radar/read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;

const rows = [
  {
    signal_key: 'signal-nvda',
    entity_key: 'US:NVDA',
    market: 'US',
    symbol: 'NVDA',
    name: 'NVIDIA',
    signal_type: 'price_mover',
    polarity: 'positive',
    strength: '0.9',
    summary_text: '거래량을 동반한 가격 변화',
    occurred_at: '2026-07-16T14:00:00.000Z',
    source_name: 'market_signals',
    watched: true,
    holding: true,
    priority: 2,
    scope_total: '3',
    signal_as_of: '2026-07-16T14:00:00.000Z',
  },
  {
    signal_key: 'signal-amd',
    entity_key: 'US:AMD',
    market: 'US',
    symbol: 'AMD',
    name: 'AMD',
    signal_type: 'analyst',
    polarity: 'neutral',
    strength: '0.6',
    summary_text: '분석가 변화 감지',
    occurred_at: '2026-07-16T13:00:00.000Z',
    source_name: null,
    watched: true,
    holding: false,
    priority: 1,
    scope_total: '3',
    signal_as_of: '2026-07-16T14:00:00.000Z',
  },
  {
    signal_key: 'signal-tsla',
    entity_key: 'US:TSLA',
    market: 'US',
    symbol: 'TSLA',
    name: 'Tesla',
    signal_type: 'fundamental',
    polarity: 'negative',
    strength: '0.4',
    summary_text: '기초 체력 변화 감지',
    occurred_at: '2026-07-16T12:00:00.000Z',
    source_name: 'market_signals',
    watched: false,
    holding: false,
    priority: 0,
    scope_total: '3',
    signal_as_of: '2026-07-16T14:00:00.000Z',
  },
] as const;

describe('radar signal read model', () => {
  it('prioritizes user context and paginates without leaking user id', async () => {
    const seen: unknown[][] = [];
    const executor: RadarSignalQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(_sql: string, parameters = []) => {
        seen.push([...parameters]);
        return (parameters[1] === null ? rows : rows.slice(2)) as unknown as TRow[];
      },
    };

    const first = await getRadarSignals(executor, {
      userScope,
      limit: 2,
      now: new Date('2026-07-17T01:00:00.000Z'),
    });
    const second = await getRadarSignals(executor, {
      userScope,
      limit: 2,
      cursor: first.nextCursor,
      now: new Date('2026-07-17T01:00:01.000Z'),
    });

    assert.equal(seen[0]?.[0], userScope.userId);
    assert.deepEqual(
      first.items.map(({ entityKey }) => entityKey),
      ['US:NVDA', 'US:AMD'],
    );
    assert.deepEqual(
      second.items.map(({ entityKey }) => entityKey),
      ['US:TSLA'],
    );
    assert.equal(first.items[0]?.strength, 0.9);
    assert.equal(first.scopeTotal, 3);
    assert.deepEqual(first.componentWatermarks, {
      event_radar: {
        availability: 'available',
        watermarkAt: '2026-07-16T14:00:00.000Z',
        rowCount: 3,
      },
      factor_map: {
        availability: 'partial',
        watermarkAt: '2026-07-16T14:00:00.000Z',
        rowCount: 3,
      },
      propagation_map: {
        availability: 'partial',
        watermarkAt: '2026-07-16T14:00:00.000Z',
        rowCount: 3,
      },
      theme_community: { availability: 'missing', watermarkAt: null, rowCount: 0 },
      heatmap_matrix: {
        availability: 'available',
        watermarkAt: '2026-07-16T14:00:00.000Z',
        rowCount: 3,
      },
      timeline: {
        availability: 'available',
        watermarkAt: '2026-07-16T14:00:00.000Z',
        rowCount: 3,
      },
      map_globe: { availability: 'missing', watermarkAt: null, rowCount: 0 },
      value_chain: { availability: 'missing', watermarkAt: null, rowCount: 0 },
    });
    assert.equal(first.nextCursor === null, false);
    assert.equal(second.nextCursor, null);
    assert.equal('userId' in (first.items[0] ?? {}), false);
  });

  it('marks old and empty component clocks without promoting unavailable sources', async () => {
    const rowsExecutor: RadarSignalQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>() => rows as unknown as TRow[],
    };
    const emptyExecutor: RadarSignalQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>() => [] as TRow[],
    };
    const stale = await getRadarSignals(rowsExecutor, {
      userScope,
      now: new Date('2026-07-18T15:00:00.000Z'),
    });
    assert.equal(stale.componentWatermarks.event_radar.availability, 'stale');
    assert.equal(stale.componentWatermarks.factor_map.availability, 'stale');

    const empty = await getRadarSignals(emptyExecutor, {
      userScope,
      now: new Date('2026-07-18T15:00:00.000Z'),
    });
    assert.equal(empty.componentWatermarks.event_radar.availability, 'empty');
    assert.equal(empty.componentWatermarks.theme_community.availability, 'missing');
    assert.equal(empty.componentWatermarks.map_globe.availability, 'missing');
  });
});
