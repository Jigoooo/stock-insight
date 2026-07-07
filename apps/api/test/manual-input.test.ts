import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPostgresManualPortfolioWriteModel,
  normalizeManualStockInput,
  type ManualPortfolioWriteExecutor,
} from '../src/me/manual-input.ts';

describe('manual stock input normalization', () => {
  it('accepts only explicit KR/US ticker input and derives entity keys safely', () => {
    assert.deepEqual(
      normalizeManualStockInput({ market: 'KR', ticker: '005930', displayName: '삼성전자' }),
      {
        entityKey: 'KR:005930',
        market: 'KR',
        ticker: '005930',
        displayName: '삼성전자',
      },
    );
    assert.deepEqual(normalizeManualStockInput({ market: 'US', ticker: 'nvda' }), {
      entityKey: 'US:NVDA',
      market: 'US',
      ticker: 'NVDA',
    });

    assert.throws(() => normalizeManualStockInput({ market: 'KR', ticker: 'NVDA' }), /KR ticker/);
    assert.throws(() => normalizeManualStockInput({ market: 'US', ticker: '005930' }), /US ticker/);
    assert.throws(() => normalizeManualStockInput({ market: 'US', ticker: 'BTC-USD' }), /US ticker/);
  });
});

describe('manual portfolio PostgreSQL write model', () => {
  it('upserts watchlist rows by user/entity instead of creating duplicates', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: ManualPortfolioWriteExecutor = async (sql, params) => {
      calls.push({ sql, params });
      return [
        {
          entity_key: 'US:NVDA',
          ticker: 'NVDA',
          market: 'US',
          display_name: 'NVIDIA',
          source: 'manual_web',
          added_at: '2026-07-07T00:00:00.000Z',
        },
      ];
    };

    const model = createPostgresManualPortfolioWriteModel(executor);
    const item = await model.upsertWatchlist({ market: 'US', ticker: 'nvda', displayName: 'NVIDIA' });

    assert.equal(item.entityKey, 'US:NVDA');
    assert.equal(item.source, 'manual_web');
    assert.match(calls[0]!.sql, /ON CONFLICT \(user_id, entity_key\) DO UPDATE/);
    assert.deepEqual(calls[0]!.params, ['US:NVDA', 'NVDA', 'US', 'NVIDIA']);
  });

  it('upserts an open position without broker/order fields and refreshes watchlist membership', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: ManualPortfolioWriteExecutor = async (sql, params) => {
      calls.push({ sql, params });
      return [
        {
          entity_key: 'KR:005930',
          ticker: '005930',
          market: 'KR',
          display_name: '삼성전자',
          avg_price: '81200',
          quantity: '3',
          status: 'open',
          source: 'manual_web',
          opened_at: '2026-07-07T00:00:00.000Z',
        },
      ];
    };

    const model = createPostgresManualPortfolioWriteModel(executor);
    const position = await model.upsertPosition({
      market: 'KR',
      ticker: '005930',
      displayName: '삼성전자',
      avgPrice: 81200,
      quantity: 3,
    });

    assert.equal(position.entityKey, 'KR:005930');
    assert.equal(position.avgPrice, 81200);
    assert.equal(position.quantity, 3);
    assert.equal(position.status, 'open');
    assert.match(calls[0]!.sql, /upsert_watchlist/);
    assert.doesNotMatch(calls[0]!.sql, /broker|brokerage|order_id|order_|secret|api_key/i);
    assert.deepEqual(calls[0]!.params, ['KR:005930', '005930', 'KR', '삼성전자', 81200, 3]);
  });

  it('soft-removes watchlist rows and closes positions without deleting research source data', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: ManualPortfolioWriteExecutor = async (sql, params) => {
      calls.push({ sql, params });
      return [{ entity_key: 'US:NVDA', status: 'closed' }];
    };

    const model = createPostgresManualPortfolioWriteModel(executor);
    await model.removeWatchlist('US:NVDA');
    await model.closePosition('US:NVDA');

    assert.match(calls[0]!.sql, /active = false/);
    assert.match(calls[0]!.sql, /removed_at = now\(\)/);
    assert.match(calls[1]!.sql, /status = 'closed'/);
    assert.match(calls[1]!.sql, /closed_at = now\(\)/);
    assert.doesNotMatch(`${calls[0]!.sql}\n${calls[1]!.sql}`, /DELETE FROM|TRUNCATE|DROP/i);
  });
});
