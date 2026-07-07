import { createDashboardApiClient } from './dashboard-api-client.ts';
import type { StockDetailResponse } from '@stock-insight/contracts';

export async function loadStockDetailResponse(
  entityKey: string,
  fetcher: typeof fetch = globalThis.fetch,
) {
  try {
    return await createDashboardApiClient(fetcher).stockDetail(entityKey);
  } catch {
    return undefined satisfies StockDetailResponse | undefined;
  }
}
