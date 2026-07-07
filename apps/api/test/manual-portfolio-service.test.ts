import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getManualPortfolioBootstrapAfterMutation,
  type ManualPortfolioWriteModel,
} from '../src/me/manual-service.ts';
import type { MeBootstrapReadModel } from '../src/me/read-model.ts';

const now = new Date('2026-07-07T00:00:00.000Z');

function createReadModel(): MeBootstrapReadModel {
  return {
    loadMeBootstrap() {
      return {
        user: { id: 'default', label: '기본 사용자' },
        watchlist: [
          {
            entityKey: 'US:NVDA',
            ticker: 'NVDA',
            market: 'US',
            displayName: 'NVIDIA',
            source: 'manual_web',
            addedAt: '2026-07-07T00:00:00.000Z',
          },
        ],
        positions: [],
        preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
      };
    },
  };
}

describe('manual portfolio mutation response', () => {
  it('runs the requested write and returns a refreshed me bootstrap envelope', async () => {
    const writes: string[] = [];
    const writeModel: ManualPortfolioWriteModel = {
      async upsertWatchlist(input) {
        writes.push(`watchlist:${input.market}:${input.ticker}`);
        return {
          entityKey: 'US:NVDA',
          ticker: 'NVDA',
          market: 'US',
          displayName: 'NVIDIA',
          source: 'manual_web',
        };
      },
      async removeWatchlist(entityKey) {
        writes.push(`remove:${entityKey}`);
        return { entityKey, active: false };
      },
      async upsertPosition(input) {
        writes.push(`position:${input.market}:${input.ticker}:${input.quantity ?? ''}`);
        return {
          entityKey: 'US:NVDA',
          ticker: 'NVDA',
          market: 'US',
          displayName: 'NVIDIA',
          status: 'open',
          source: 'manual_web',
        };
      },
      async closePosition(entityKey) {
        writes.push(`close:${entityKey}`);
        return { entityKey, status: 'closed' };
      },
    };

    const response = await getManualPortfolioBootstrapAfterMutation({
      mutation: () => writeModel.upsertWatchlist({ market: 'US', ticker: 'nvda', displayName: 'NVIDIA' }),
      now,
      readModel: createReadModel(),
    });

    assert.deepEqual(writes, ['watchlist:US:nvda']);
    assert.equal(response.availability, 'available');
    assert.equal(response.meta.source, 'database');
    assert.equal(response.meta.generatedAt, now.toISOString());
    assert.equal(response.data.watchlist[0]?.entityKey, 'US:NVDA');
  });

  it('returns a safe error envelope when the write fails', async () => {
    const response = await getManualPortfolioBootstrapAfterMutation({
      mutation() {
        throw new Error('write failed');
      },
      now,
      readModel: createReadModel(),
    });

    assert.equal(response.availability, 'error');
    assert.equal(response.meta.source, 'fallback');
    assert.equal(response.error?.code, 'MANUAL_PORTFOLIO_WRITE_FAILED');
    assert.deepEqual(response.data.watchlist, []);
    assert.deepEqual(response.data.positions, []);
  });
});
