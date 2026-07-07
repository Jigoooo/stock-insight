import { createDashboardApiClient } from './dashboard-api-client.ts';
import type { MarketNewsResponse } from '@stock-insight/contracts';

export async function loadMarketNewsResponse(fetcher: typeof fetch = globalThis.fetch) {
  try {
    return await createDashboardApiClient(fetcher).marketNews({ type: 'all' });
  } catch {
    return undefined satisfies MarketNewsResponse | undefined;
  }
}
