import { useEffect, useRef, useState } from 'react';

import { dashboardBootstrap } from '@/pages/dashboard/model/dashboard-bootstrap';
import { loadDashboardResponse } from '@/pages/dashboard/model/load-dashboard-response';
import { loadDiscoverStocksResponse } from '@/pages/dashboard/model/load-discover-stocks-response';
import { loadMarketNewsResponse } from '@/pages/dashboard/model/load-market-news-response';
import { loadMeBootstrapResponse } from '@/pages/dashboard/model/load-me-bootstrap-response';
import { loadPortfolioDigestResponse } from '@/pages/dashboard/model/load-portfolio-digest-response';
import { loadStockListResponse } from '@/pages/dashboard/model/load-stock-list-response';
import { resolveDashboardBootstrap } from '@/pages/dashboard/model/resolve-dashboard-bootstrap';
import { resolveDiscoverStocksForDashboard } from '@/pages/dashboard/model/resolve-discover-stocks';
import { resolveMarketNewsInsights } from '@/pages/dashboard/model/resolve-market-news-insights';
import { resolvePortfolioForDashboard } from '@/pages/dashboard/model/resolve-portfolio';
import { resolvePortfolioDigest } from '@/pages/dashboard/model/resolve-portfolio-digest';
import { resolveStockListForDashboard } from '@/pages/dashboard/model/resolve-stocks';
import {
  DashboardShell,
  type ManualPortfolioAction,
  type ManualPortfolioMutationStatus,
} from '@/widgets/dashboard-shell';
import { createApiClient } from '@stock-insight/api-client';
import type {
  DashboardResponse,
  DiscoverStocksResponse,
  MarketNewsResponse,
  MeBootstrapResponse,
  PortfolioDigestResponse,
  StockListResponse,
} from '@stock-insight/contracts';

type DashboardPageProps = {
  initialDashboardResponse?: DashboardResponse;
  initialDiscoverStocksResponse?: DiscoverStocksResponse;
  initialMarketNewsResponse?: MarketNewsResponse;
  initialMeBootstrapResponse?: MeBootstrapResponse;
  initialPortfolioDigestResponse?: PortfolioDigestResponse;
  initialStockListResponse?: StockListResponse;
};

export function DashboardPage({
  initialDashboardResponse,
  initialDiscoverStocksResponse,
  initialMarketNewsResponse,
  initialMeBootstrapResponse,
  initialPortfolioDigestResponse,
  initialStockListResponse,
}: DashboardPageProps) {
  const [dashboardResponse, setDashboardResponse] = useState(initialDashboardResponse);
  const [discoverStocksResponse, setDiscoverStocksResponse] = useState(
    initialDiscoverStocksResponse,
  );
  const [marketNewsResponse, setMarketNewsResponse] = useState(initialMarketNewsResponse);
  const [meBootstrapResponse, setMeBootstrapResponse] = useState(initialMeBootstrapResponse);
  const [portfolioDigestResponse, setPortfolioDigestResponse] = useState(initialPortfolioDigestResponse);
  const [manualPortfolioStatus, setManualPortfolioStatus] =
    useState<ManualPortfolioMutationStatus>('idle');
  const [stockListResponse, setStockListResponse] = useState(initialStockListResponse);
  const hasRequestedClientDashboardRef = useRef(false);
  const hasRequestedClientDiscoverStocksRef = useRef(false);
  const hasRequestedClientMarketNewsRef = useRef(false);
  const hasRequestedClientMeBootstrapRef = useRef(false);
  const hasRequestedClientPortfolioDigestRef = useRef(false);
  const hasRequestedClientStockListRef = useRef(false);
  const resolved = resolveDashboardBootstrap(dashboardResponse, dashboardBootstrap);
  const { insights, portfolio, stocks, themes } = resolved.bootstrap;
  const discoverStocks = resolveDiscoverStocksForDashboard(discoverStocksResponse);
  const marketNews = resolveMarketNewsInsights(marketNewsResponse, insights);
  const resolvedPortfolio = resolvePortfolioForDashboard(meBootstrapResponse, portfolio);
  const portfolioDigest = resolvePortfolioDigest(portfolioDigestResponse);
  const stockList = resolveStockListForDashboard(stockListResponse, stocks);

  const handleManualPortfolioAction = async (action: ManualPortfolioAction) => {
    setManualPortfolioStatus('saving');
    try {
      const client = createApiClient();
      const nextMeBootstrap =
        action.type === 'upsert-watchlist'
          ? await client.upsertWatchlist(action.input)
          : action.type === 'remove-watchlist'
            ? await client.removeWatchlist(action.entityKey)
            : action.type === 'upsert-position'
              ? await client.upsertPosition(action.input)
              : await client.closePosition(action.entityKey);

      setMeBootstrapResponse(nextMeBootstrap);
      const nextStockList = await loadStockListResponse();
      if (nextStockList) setStockListResponse(nextStockList);
      const nextPortfolioDigest = await loadPortfolioDigestResponse();
      if (nextPortfolioDigest) setPortfolioDigestResponse(nextPortfolioDigest);
      const nextDiscoverStocks = await loadDiscoverStocksResponse();
      if (nextDiscoverStocks) setDiscoverStocksResponse(nextDiscoverStocks);
      setManualPortfolioStatus('success');
      return true;
    } catch {
      setManualPortfolioStatus('error');
      return false;
    }
  };

  useEffect(() => {
    if (resolved.isLiveData || hasRequestedClientDashboardRef.current) return;

    let isMounted = true;
    hasRequestedClientDashboardRef.current = true;

    void loadDashboardResponse().then((response) => {
      if (!isMounted || !response) return;
      setDashboardResponse(response);
    });

    return () => {
      isMounted = false;
    };
  }, [resolved.isLiveData]);

  useEffect(() => {
    if (discoverStocks.isLiveData || hasRequestedClientDiscoverStocksRef.current) return;

    let isMounted = true;
    hasRequestedClientDiscoverStocksRef.current = true;

    void loadDiscoverStocksResponse().then((response) => {
      if (!isMounted || !response) return;
      setDiscoverStocksResponse(response);
    });

    return () => {
      isMounted = false;
    };
  }, [discoverStocks.isLiveData]);

  useEffect(() => {
    if (marketNews.isLiveData || hasRequestedClientMarketNewsRef.current) return;

    let isMounted = true;
    hasRequestedClientMarketNewsRef.current = true;

    void loadMarketNewsResponse().then((response) => {
      if (!isMounted || !response) return;
      setMarketNewsResponse(response);
    });

    return () => {
      isMounted = false;
    };
  }, [marketNews.isLiveData]);

  useEffect(() => {
    if (resolvedPortfolio.isLiveData || hasRequestedClientMeBootstrapRef.current) return;

    let isMounted = true;
    hasRequestedClientMeBootstrapRef.current = true;

    void loadMeBootstrapResponse().then((response) => {
      if (!isMounted || !response) return;
      setMeBootstrapResponse(response);
    });

    return () => {
      isMounted = false;
    };
  }, [resolvedPortfolio.isLiveData]);

  useEffect(() => {
    if (portfolioDigest.isLiveData || hasRequestedClientPortfolioDigestRef.current) return;

    let isMounted = true;
    hasRequestedClientPortfolioDigestRef.current = true;

    void loadPortfolioDigestResponse().then((response) => {
      if (!isMounted || !response) return;
      setPortfolioDigestResponse(response);
    });

    return () => {
      isMounted = false;
    };
  }, [portfolioDigest.isLiveData]);

  useEffect(() => {
    if (stockList.isLiveData || hasRequestedClientStockListRef.current) return;

    let isMounted = true;
    hasRequestedClientStockListRef.current = true;

    void loadStockListResponse().then((response) => {
      if (!isMounted || !response) return;
      setStockListResponse(response);
    });

    return () => {
      isMounted = false;
    };
  }, [stockList.isLiveData]);

  return (
    <DashboardShell
      dataAvailability={resolved.availability}
      dataSource={resolved.source}
      discoverAvailability={discoverStocks.availability}
      discoverCandidates={discoverStocks.candidates}
      discoverSource={discoverStocks.source}
      insights={insights}
      marketInsights={marketNews.insights}
      marketNewsAvailability={marketNews.availability}
      marketNewsSource={marketNews.source}
      manualPortfolioData={meBootstrapResponse?.data}
      manualPortfolioStatus={manualPortfolioStatus}
      onManualPortfolioAction={handleManualPortfolioAction}
      portfolio={resolvedPortfolio.portfolio}
      portfolioAvailability={resolvedPortfolio.availability}
      portfolioDigest={portfolioDigest.digest}
      portfolioDigestAvailability={portfolioDigest.availability}
      portfolioDigestSource={portfolioDigest.source}
      portfolioSource={resolvedPortfolio.source}
      stocks={stockList.stocks}
      stockListAvailability={stockList.availability}
      stockListSource={stockList.source}
      themes={themes}
    />
  );
}
