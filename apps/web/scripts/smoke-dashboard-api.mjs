import { createApiClient } from '@stock-insight/api-client';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:6123';
const expectDatabaseStocks = Boolean(process.env.DATABASE_URL);
const client = createApiClient({ baseUrl });

const [
  health,
  dashboard,
  meBootstrap,
  marketNews,
  discoverStocks,
  stocks,
  stockDetail,
  missingStock,
] = await Promise.all([
  client.health(),
  client.dashboard(),
  client.meBootstrap(),
  client.marketNews({ market: 'KR', type: 'all' }),
  client.discoverStocks({ market: 'KR', reason: 'all' }),
  client.stocks({ market: 'KR', scope: 'all', q: '삼성' }),
  client.stockDetail('KR:005930'),
  client.stockDetail('KR:000000'),
]);

if (!health.ok) {
  throw new Error(`Expected health ok=true for ${health.service}`);
}

if (
  !expectDatabaseStocks &&
  (dashboard.availability !== 'collecting' || dashboard.meta.source !== 'fallback')
) {
  throw new Error(
    `Expected collecting fallback dashboard, received ${dashboard.availability}/${dashboard.meta.source}`,
  );
}

if (
  expectDatabaseStocks &&
  (dashboard.availability !== 'available' || dashboard.meta.source !== 'database')
) {
  throw new Error(
    `Expected database dashboard, received ${dashboard.availability}/${dashboard.meta.source}`,
  );
}

if (expectDatabaseStocks && dashboard.data.stocks.length === 0) {
  throw new Error('Expected non-empty database dashboard stocks');
}

if (
  !expectDatabaseStocks &&
  (meBootstrap.availability !== 'collecting' || meBootstrap.meta.source !== 'fallback')
) {
  throw new Error(
    `Expected collecting fallback me bootstrap, received ${meBootstrap.availability}/${meBootstrap.meta.source}`,
  );
}

if (
  expectDatabaseStocks &&
  (meBootstrap.availability !== 'available' || meBootstrap.meta.source !== 'database')
) {
  throw new Error(
    `Expected database me bootstrap, received ${meBootstrap.availability}/${meBootstrap.meta.source}`,
  );
}

if (expectDatabaseStocks && meBootstrap.data.watchlist.length === 0) {
  throw new Error('Expected non-empty database me bootstrap watchlist');
}

if (
  !expectDatabaseStocks &&
  (marketNews.availability !== 'collecting' || marketNews.meta.source !== 'fallback')
) {
  throw new Error(
    `Expected collecting fallback market news, received ${marketNews.availability}/${marketNews.meta.source}`,
  );
}

if (
  expectDatabaseStocks &&
  (marketNews.availability !== 'available' || marketNews.meta.source !== 'database')
) {
  throw new Error(
    `Expected database market news, received ${marketNews.availability}/${marketNews.meta.source}`,
  );
}

if (expectDatabaseStocks && marketNews.data.length === 0) {
  throw new Error('Expected non-empty database market news');
}

if (expectDatabaseStocks && marketNews.data.some((item) => item.market !== 'KR')) {
  throw new Error('Expected market-news?market=KR to return only KR rows');
}

if (
  !expectDatabaseStocks &&
  (discoverStocks.availability !== 'collecting' || discoverStocks.meta.source !== 'fallback')
) {
  throw new Error(
    `Expected collecting fallback discover stocks, received ${discoverStocks.availability}/${discoverStocks.meta.source}`,
  );
}

if (
  expectDatabaseStocks &&
  (discoverStocks.availability !== 'available' || discoverStocks.meta.source !== 'database')
) {
  throw new Error(
    `Expected database discover stocks, received ${discoverStocks.availability}/${discoverStocks.meta.source}`,
  );
}

if (expectDatabaseStocks && discoverStocks.data.length === 0) {
  throw new Error('Expected non-empty database discover stocks');
}

if (expectDatabaseStocks && discoverStocks.data.some((item) => item.market !== 'KR')) {
  throw new Error('Expected discover/stocks?market=KR to return only KR rows');
}

if (
  !expectDatabaseStocks &&
  (stocks.availability !== 'collecting' || stocks.meta.source !== 'fallback')
) {
  throw new Error(
    `Expected collecting fallback stock list, received ${stocks.availability}/${stocks.meta.source}`,
  );
}

if (!expectDatabaseStocks && stocks.data.length !== 0) {
  throw new Error(`Expected empty fallback stock list, received ${stocks.data.length} rows`);
}

if (
  expectDatabaseStocks &&
  (stocks.availability !== 'available' || stocks.meta.source !== 'database')
) {
  throw new Error(
    `Expected database stock list, received ${stocks.availability}/${stocks.meta.source}`,
  );
}

if (expectDatabaseStocks && stocks.data.length === 0) {
  throw new Error('Expected non-empty database stock list');
}

if (
  !expectDatabaseStocks &&
  (stockDetail.availability !== 'missing' || stockDetail.error?.code !== 'STOCK_NOT_FOUND')
) {
  throw new Error(
    `Expected missing stock detail fallback, received ${stockDetail.availability}/${stockDetail.error?.code}`,
  );
}

if (
  expectDatabaseStocks &&
  (stockDetail.availability !== 'available' || stockDetail.meta.source !== 'database')
) {
  throw new Error(
    `Expected database stock detail, received ${stockDetail.availability}/${stockDetail.meta.source}`,
  );
}

if (expectDatabaseStocks && stockDetail.data?.stock.entityKey !== 'KR:005930') {
  throw new Error(`Expected KR:005930 detail, received ${stockDetail.data?.stock.entityKey}`);
}

if (missingStock.availability !== 'missing' || missingStock.error?.code !== 'STOCK_NOT_FOUND') {
  throw new Error(
    `Expected missing stock detail fallback, received ${missingStock.availability}/${missingStock.error?.code}`,
  );
}

console.log(
  JSON.stringify(
    {
      baseUrl,
      health: {
        ok: health.ok,
        service: health.service,
        checkedAt: health.checkedAt,
      },
      dashboard: {
        source: dashboard.meta.source,
        availability: dashboard.availability,
        generatedAt: dashboard.meta.generatedAt,
        stockCount: dashboard.data.stocks.length,
        insightCount: dashboard.data.insights.length,
        focusTheme: dashboard.data.portfolio.focusTheme,
      },
      meBootstrap: {
        source: meBootstrap.meta.source,
        availability: meBootstrap.availability,
        watchlistCount: meBootstrap.data.watchlist.length,
        positionCount: meBootstrap.data.positions.length,
        defaultMarket: meBootstrap.data.preferences.defaultMarket,
      },
      marketNews: {
        source: marketNews.meta.source,
        availability: marketNews.availability,
        count: marketNews.data.length,
        first: marketNews.data[0]?.id,
        firstMarket: marketNews.data[0]?.market,
      },
      discoverStocks: {
        source: discoverStocks.meta.source,
        availability: discoverStocks.availability,
        count: discoverStocks.data.length,
        first: discoverStocks.data[0]?.entityKey,
        firstReason: discoverStocks.data[0]?.reasonType,
      },
      stocks: {
        source: stocks.meta.source,
        availability: stocks.availability,
        count: stocks.data.length,
        first: stocks.data[0]?.entityKey,
      },
      stockDetail: {
        source: stockDetail.meta.source,
        availability: stockDetail.availability,
        entityKey: stockDetail.data?.stock.entityKey,
        deepReportStatus: stockDetail.data?.deepReport.status,
        relatedNewsCount: stockDetail.data?.relatedNews.length ?? 0,
      },
      missingStock: {
        source: missingStock.meta.source,
        availability: missingStock.availability,
        errorCode: missingStock.error?.code,
      },
    },
    null,
    2,
  ),
);
