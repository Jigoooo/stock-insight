export const STOCK_TABLE_PAGE_SIZE = 50;

export function paginateStockRows<Row>(rows: readonly Row[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / STOCK_TABLE_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), pageCount);
  const startIndex = (currentPage - 1) * STOCK_TABLE_PAGE_SIZE;
  const endIndex = Math.min(startIndex + STOCK_TABLE_PAGE_SIZE, rows.length);
  return {
    currentPage,
    endIndex,
    items: rows.slice(startIndex, endIndex),
    pageCount,
    startIndex,
  };
}
