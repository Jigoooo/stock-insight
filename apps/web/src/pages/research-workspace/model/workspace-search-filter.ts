import type { StockListResponse } from '@stock-insight/contracts';

type WorkspaceStock = StockListResponse['data'][number];

function normalizeSearchValue(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
}

export function filterWorkspaceStocks(stocks: WorkspaceStock[], query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return stocks;
  return stocks.filter((stock) =>
    normalizeSearchValue(
      `${stock.displayName} ${stock.name} ${stock.ticker} ${stock.entityKey}`,
    ).includes(normalizedQuery),
  );
}
