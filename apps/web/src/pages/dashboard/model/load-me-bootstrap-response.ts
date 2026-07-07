import { createDashboardApiClient } from './dashboard-api-client.ts';
import type { MeBootstrapResponse } from '@stock-insight/contracts';

export async function loadMeBootstrapResponse(fetcher: typeof fetch = globalThis.fetch) {
  try {
    return await createDashboardApiClient(fetcher).meBootstrap();
  } catch {
    return undefined satisfies MeBootstrapResponse | undefined;
  }
}
