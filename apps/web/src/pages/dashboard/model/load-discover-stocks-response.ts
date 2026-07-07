import { createDashboardApiClient } from './dashboard-api-client.ts';
import type { DiscoverStocksResponse } from '@stock-insight/contracts';

export async function loadDiscoverStocksResponse(fetcher: typeof fetch = globalThis.fetch) {
  try {
    return await createDashboardApiClient(fetcher).discoverStocks({ reason: 'all' });
  } catch {
    return undefined satisfies DiscoverStocksResponse | undefined;
  }
}
