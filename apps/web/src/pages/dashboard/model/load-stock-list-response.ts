import { createDashboardApiClient } from './dashboard-api-client.ts';
import type { StockListResponse } from '@stock-insight/contracts';

export async function loadStockListResponse(fetcher: typeof fetch = globalThis.fetch) {
  try {
    return await createDashboardApiClient(fetcher).stocks({ scope: 'all' });
  } catch {
    return undefined satisfies StockListResponse | undefined;
  }
}
