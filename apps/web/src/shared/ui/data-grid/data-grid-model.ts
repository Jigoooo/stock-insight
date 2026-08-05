export type DataGridSortDirection = 'asc' | 'desc' | 'none';

export type DataGridSortState<ColumnKey extends string = string> = {
  direction: DataGridSortDirection;
  key: ColumnKey;
};

export function nextDataGridSort<ColumnKey extends string>(
  sort: DataGridSortState<ColumnKey>,
  key: ColumnKey,
): DataGridSortState<ColumnKey> {
  if (sort.key !== key || sort.direction === 'none') return { direction: 'asc', key };
  if (sort.direction === 'asc') return { direction: 'desc', key };
  return { direction: 'none', key };
}

export function getDataGridVirtualRange({
  overscan = 6,
  rowCount,
  rowHeight = 44,
  scrollTop,
  viewportHeight,
}: {
  overscan?: number;
  rowCount: number;
  rowHeight?: number;
  scrollTop: number;
  viewportHeight: number;
}) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);

  return {
    end,
    offsetTop: start * rowHeight,
    start,
    totalHeight: rowCount * rowHeight,
  };
}
