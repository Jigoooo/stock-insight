import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPostgresDashboardReadModel } from '../src/dashboard/read-model.ts';
import { createPostgresDiscoverStocksReadModel } from '../src/discover/read-model.ts';
import { createPostgresPortfolioDigestReadModel } from '../src/portfolio/read-model.ts';
import { createPostgresStockReadModel } from '../src/stocks/read-model.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const userScope = { userId } as const;
const stop = new Error('capture complete');

type CapturedCall = { sql: string; params: readonly unknown[] };

function capturingExecutor(calls: CapturedCall[]) {
  return async (sql: string, params: readonly unknown[]): Promise<never> => {
    calls.push({ sql, params });
    throw stop;
  };
}

async function expectCaptured(run: () => Promise<unknown>) {
  await assert.rejects(run, (error: unknown) => error === stop);
}

function assertScoped(call: CapturedCall | undefined, parameter: number) {
  assert.ok(call);
  assert.match(call.sql, new RegExp(`user_id\\s*=\\s*\\$${parameter}::uuid`, 'i'));
  assert.equal(call.params.at(-1), userId);
}

describe('server-owned user scope in personalized PostgreSQL read models', () => {
  it('scopes dashboard watchlist and position projections', async () => {
    const calls: CapturedCall[] = [];
    const model = createPostgresDashboardReadModel(capturingExecutor(calls), userScope);

    await expectCaptured(() => model.loadDashboardBootstrap());

    assert.deepEqual(calls[0]?.params, [userId]);
    assertScoped(calls[0], 1);
  });

  it('scopes portfolio digest inputs', async () => {
    const calls: CapturedCall[] = [];
    const model = createPostgresPortfolioDigestReadModel(capturingExecutor(calls), userScope);

    await expectCaptured(() => model.loadPortfolioDigest());

    assert.deepEqual(calls[0]?.params, [userId]);
    assertScoped(calls[0], 1);
  });

  it('scopes discover exclusions', async () => {
    const calls: CapturedCall[] = [];
    const model = createPostgresDiscoverStocksReadModel(capturingExecutor(calls), userScope);

    await expectCaptured(() => model.listDiscoverStocks({ market: 'US', reason: 'all' }));

    assert.deepEqual(calls[0]?.params, ['US', 'all', userId]);
    assertScoped(calls[0], 3);
  });

  it('scopes stock list and detail personalization independently', async () => {
    const calls: CapturedCall[] = [];
    const model = createPostgresStockReadModel(capturingExecutor(calls), userScope);

    await expectCaptured(() => model.listStocks({ market: 'KR', scope: 'watchlist', q: '삼성' }));
    await expectCaptured(() => model.getStockDetail('KR:005930'));

    assert.deepEqual(calls[0]?.params, ['KR', 'watchlist', '%삼성%', userId]);
    assertScoped(calls[0], 4);
    assert.deepEqual(calls[1]?.params, ['KR:005930', userId]);
    assertScoped(calls[1], 2);
  });
});
