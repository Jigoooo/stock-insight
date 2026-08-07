import type { StocksBriefingModel } from '../model/stock-briefing';

import type { StockListItem } from '@stock-insight/contracts';

export type VisibleStockBriefingItem = {
  briefing: StocksBriefingModel['priorityHoldings'][number];
  stock: StockListItem;
};

export type VisibleWatchlistItem = {
  briefing?: StocksBriefingModel['watchlistChanges'][number];
  stock: StockListItem;
};

export type VisibleStockBriefing = {
  holdings: StockListItem[];
  priorityHoldings: VisibleStockBriefingItem[];
  watchedNonHoldings: StockListItem[];
  watchlist: VisibleWatchlistItem[];
};

export function selectVisibleStockBriefing(
  briefing: StocksBriefingModel,
  stocks: StockListItem[],
  showAllWatchlist: boolean,
): VisibleStockBriefing {
  const stocksByKey = new Map(stocks.map((stock) => [stock.entityKey, stock]));
  const priorityHoldings = briefing.priorityHoldings
    .flatMap((item) => {
      const stock = stocksByKey.get(item.entityKey);
      return stock?.isHolding ? [{ briefing: item, stock }] : [];
    })
    .slice(0, 3);
  const holdings = stocks.filter(({ isHolding }) => isHolding);
  const watchlistBriefingByKey = new Map(
    briefing.watchlistChanges.map((item) => [item.entityKey, item]),
  );
  const watchedNonHoldings = stocks.filter(({ isHolding, isWatched }) => !isHolding && isWatched);
  const watchlist = watchedNonHoldings.flatMap((stock) => {
    const item = { briefing: watchlistBriefingByKey.get(stock.entityKey), stock };
    return showAllWatchlist || item.briefing ? [item] : [];
  });

  return { holdings, priorityHoldings, watchedNonHoldings, watchlist };
}
