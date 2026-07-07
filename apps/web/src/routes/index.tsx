import { createFileRoute } from '@tanstack/react-router';

import { DashboardPage } from '@/pages/dashboard';
import { loadDashboardResponse } from '@/pages/dashboard/model/load-dashboard-response';
import { loadMarketNewsResponse } from '@/pages/dashboard/model/load-market-news-response';
import { loadMeBootstrapResponse } from '@/pages/dashboard/model/load-me-bootstrap-response';
import { loadPortfolioDigestResponse } from '@/pages/dashboard/model/load-portfolio-digest-response';
import { loadStockListResponse } from '@/pages/dashboard/model/load-stock-list-response';

export const Route = createFileRoute('/')({
  loader: async () => {
    const [
      dashboardResponse,
      marketNewsResponse,
      meBootstrapResponse,
      portfolioDigestResponse,
      stockListResponse,
    ] = await Promise.all([
      loadDashboardResponse(),
      loadMarketNewsResponse(),
      loadMeBootstrapResponse(),
      loadPortfolioDigestResponse(),
      loadStockListResponse(),
    ]);

    return {
      dashboardResponse,
      marketNewsResponse,
      meBootstrapResponse,
      portfolioDigestResponse,
      stockListResponse,
    };
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  const {
    dashboardResponse,
    marketNewsResponse,
    meBootstrapResponse,
    portfolioDigestResponse,
    stockListResponse,
  } = Route.useLoaderData();

  return (
    <DashboardPage
      initialDashboardResponse={dashboardResponse}
      initialMarketNewsResponse={marketNewsResponse}
      initialMeBootstrapResponse={meBootstrapResponse}
      initialPortfolioDigestResponse={portfolioDigestResponse}
      initialStockListResponse={stockListResponse}
    />
  );
}
