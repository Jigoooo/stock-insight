import type { Stock } from '@/entities/stock';

export function filterStocks(stocks: Stock[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return stocks;

  return stocks.filter((stock) =>
    [stock.name, stock.ticker, stock.theme, stock.summary]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  );
}
