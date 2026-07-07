import { createDashboardApiClient } from './dashboard-api-client.ts';
import type { DashboardResponse } from '@stock-insight/contracts';

export async function loadDashboardResponse(fetcher: typeof fetch = globalThis.fetch) {
  try {
    return await createDashboardApiClient(fetcher).dashboard();
  } catch {
    return undefined satisfies DashboardResponse | undefined;
  }
}
