import type { ReactElement } from 'react';

import styles from './data-feedback-catalog.module.css';
import {
  sortDataRows,
  updateDataCell,
  type DataColumnKey,
  type DataRow,
  type SortState,
} from './data-feedback-model';

import { DataGrid, type DataGridColumn, type DataGridVariant } from '@/shared/ui/data-grid';

const statusOptions = [
  { value: '확인 전', label: '확인 전' },
  { value: '확인 중', label: '확인 중' },
  { value: '확인 완료', label: '확인 완료' },
] as const;

export const initialDataGridWidths: Record<DataColumnKey, number> = {
  ticker: 104,
  company: 160,
  score: 88,
  status: 124,
  note: 220,
  source: 112,
};

const columns: readonly DataGridColumn<DataRow>[] = [
  {
    editor: { type: 'text' },
    key: 'ticker',
    label: '종목',
    value: (row) => row.ticker,
    width: initialDataGridWidths.ticker,
  },
  {
    editor: { type: 'text' },
    key: 'company',
    label: '기업',
    value: (row) => row.company,
    width: initialDataGridWidths.company,
  },
  {
    editor: { max: 100, min: 0, step: 1, type: 'number' },
    key: 'score',
    label: '점수',
    numeric: true,
    value: (row) => row.score,
    width: initialDataGridWidths.score,
  },
  {
    editor: { options: statusOptions, type: 'select' },
    key: 'status',
    label: '상태',
    render: (row) => (
      <span className={styles.gridStatus} data-status={row.status}>
        {row.status}
      </span>
    ),
    value: (row) => row.status,
    width: initialDataGridWidths.status,
  },
  {
    editor: { type: 'text' },
    key: 'note',
    label: '메모',
    value: (row) => row.note,
    width: initialDataGridWidths.note,
  },
  {
    editor: { type: 'text' },
    key: 'source',
    label: '출처',
    value: (row) => row.source,
    width: initialDataGridWidths.source,
  },
];

type DataGridPreviewProps = {
  columnWidths: Record<DataColumnKey, number>;
  onColumnWidthsChange: (widths: Record<DataColumnKey, number>) => void;
  onRowsChange: (rows: DataRow[]) => void;
  onSelectedIdsChange: (ids: readonly string[]) => void;
  onShowColumnBordersChange: (show: boolean) => void;
  onSortChange: (sort: SortState) => void;
  rows: readonly DataRow[];
  selectedIds: readonly string[];
  showColumnBorders: boolean;
  sort: SortState;
  variantId: string;
};

export function DataFeedbackGridPreview({
  columnWidths,
  onColumnWidthsChange,
  onRowsChange,
  onSelectedIdsChange,
  onShowColumnBordersChange,
  onSortChange,
  rows,
  selectedIds,
  showColumnBorders,
  sort,
  variantId,
}: DataGridPreviewProps): ReactElement {
  return (
    <DataGrid
      ariaLabel={`${variantId} 리서치 데이터 그리드`}
      columnBorders={showColumnBorders}
      columnWidths={columnWidths}
      columns={columns}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.company}
      rows={sortDataRows(rows, sort)}
      selectedKeys={selectedIds}
      sort={sort}
      variant={variantId as DataGridVariant}
      onCellChange={(rowId, columnKey, value) =>
        onRowsChange(updateDataCell(rows, rowId, columnKey as DataColumnKey, value))
      }
      onColumnBordersChange={onShowColumnBordersChange}
      onColumnWidthsChange={(widths) =>
        onColumnWidthsChange(widths as Record<DataColumnKey, number>)
      }
      onSelectedKeysChange={onSelectedIdsChange}
      onSortChange={(nextSort) => onSortChange(nextSort as SortState)}
    />
  );
}
