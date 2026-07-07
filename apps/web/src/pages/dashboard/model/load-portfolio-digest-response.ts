import { createDashboardApiClient } from './dashboard-api-client.ts';
import type { PortfolioDigestResponse } from '@stock-insight/contracts';

export async function loadPortfolioDigestResponse(fetcher: typeof fetch = globalThis.fetch) {
  try {
    return await createDashboardApiClient(fetcher).portfolioDigest();
  } catch {
    return undefined satisfies PortfolioDigestResponse | undefined;
  }
}
