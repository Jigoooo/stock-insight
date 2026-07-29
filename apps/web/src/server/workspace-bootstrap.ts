import '@tanstack/react-start/server-only';

import { brainRequest } from './brain-client.ts';
import type {
  DashboardResponse,
  MarketNewsResponse,
  MeBootstrapResponse,
  PortfolioDigestResponse,
  StockListResponse,
} from '@stock-insight/contracts';

export type WorkspaceBootstrap = {
  dashboardResponse: DashboardResponse;
  marketNewsResponse: MarketNewsResponse;
  meBootstrapResponse: MeBootstrapResponse;
  portfolioDigestResponse: PortfolioDigestResponse;
  stockListResponse: StockListResponse;
};

// SSR bootstrap: five brain reads in parallel. The brain owns the
// database-disabled fallback (each endpoint answers its own empty-state payload),
// so the BFF no longer branches on connectivity.
export async function loadWorkspaceBootstrapDirect(userId: string): Promise<WorkspaceBootstrap> {
  const scope = { kind: 'user' as const, userId };

  const [
    dashboardResponse,
    marketNewsResponse,
    meBootstrapResponse,
    portfolioDigestResponse,
    stockListResponse,
  ] = await Promise.all([
    brainRequest<DashboardResponse>('/v1/dashboard/today', { scope }),
    brainRequest<MarketNewsResponse>('/v1/market-news', { scope }),
    brainRequest<MeBootstrapResponse>('/v1/me/bootstrap', { scope }),
    brainRequest<PortfolioDigestResponse>('/v1/portfolio/digest', { scope }),
    brainRequest<StockListResponse>('/v1/stocks', { scope }),
  ]);

  return {
    dashboardResponse,
    marketNewsResponse,
    meBootstrapResponse,
    portfolioDigestResponse,
    stockListResponse,
  };
}
