import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createApiClient } from '../src/index.ts';
import type { MeBootstrapResponse, PortfolioDigestResponse } from '@stock-insight/contracts';

const responseBody: MeBootstrapResponse = {
  data: {
    user: { id: 'default', label: '기본 사용자' },
    watchlist: [
      {
        entityKey: 'US:NVDA',
        ticker: 'NVDA',
        market: 'US',
        displayName: 'NVIDIA',
        source: 'manual_web',
      },
    ],
    positions: [],
    preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
  },
  availability: 'available',
  error: null,
  meta: { source: 'database', generatedAt: '2026-07-07T00:00:00.000Z' },
};

const digestBody: PortfolioDigestResponse = {
  data: {
    alerts: [],
    exposures: [
      {
        id: 'market-us',
        label: 'US',
        kind: 'market',
        value: 100,
        itemCount: 1,
        riskLevel: 'medium',
        summary: 'US 노출 1개',
      },
    ],
    freshness: [],
    stats: {
      watchlistCount: 1,
      positionCount: 0,
      alertCount: 0,
      changeEventCount: 0,
      freshnessRiskCount: 0,
      nonStockFilteredCount: 0,
    },
  },
  availability: 'available',
  error: null,
  meta: { source: 'database', generatedAt: '2026-07-07T00:00:00.000Z' },
};

describe('manual portfolio API client', () => {
  it('reuses manual input contract types instead of redefining client-only copies', async () => {
    const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(source, /type\s+ManualWatchlistInput/);
    assert.match(source, /type\s+ManualPositionInput/);
    assert.doesNotMatch(source, /^type\s+ManualWatchlistInput\s*=/m);
    assert.doesNotMatch(source, /^type\s+ManualPositionInput\s*=/m);
  });

  it('POSTs a watchlist item and parses the refreshed me bootstrap response', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(responseBody), { status: 200 });
    }) as typeof fetch;

    const client = createApiClient({ baseUrl: 'http://stock.local', fetcher });
    const response = await client.upsertWatchlist({
      market: 'US',
      ticker: 'nvda',
      displayName: 'NVIDIA',
    });

    assert.equal(response.data.watchlist[0]?.entityKey, 'US:NVDA');
    assert.equal(calls[0]!.input.toString(), 'http://stock.local/api/watchlist');
    assert.equal(calls[0]!.init?.method, 'POST');
    assert.equal(
      calls[0]!.init?.headers?.['content-type' as keyof HeadersInit],
      'application/json',
    );
    assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), {
      market: 'US',
      ticker: 'nvda',
      displayName: 'NVIDIA',
    });
  });

  it('uses destructive-looking UI actions only for local ledger close/remove endpoints', async () => {
    const paths: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      paths.push(`${init?.method ?? 'GET'} ${input.toString()}`);
      return new Response(JSON.stringify(responseBody), { status: 200 });
    }) as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://stock.local', fetcher });

    await client.removeWatchlist('US:NVDA');
    await client.upsertPosition({ market: 'KR', ticker: '005930', avgPrice: 81200, quantity: 3 });
    await client.closePosition('KR:005930');

    assert.deepEqual(paths, [
      'DELETE http://stock.local/api/watchlist/US%3ANVDA',
      'POST http://stock.local/api/positions',
      'DELETE http://stock.local/api/positions/KR%3A005930',
    ]);
  });

  it('loads the portfolio digest from the dedicated read-only endpoint', async () => {
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      calls.push(input.toString());
      return new Response(JSON.stringify(digestBody), { status: 200 });
    }) as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://stock.local', fetcher });

    const response = await client.portfolioDigest();

    assert.equal(calls[0], 'http://stock.local/api/portfolio/digest');
    assert.equal(response.data.exposures[0]?.kind, 'market');
  });
});
