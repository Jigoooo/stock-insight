import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactElement } from 'react';

import styles from './data-feedback-catalog.module.css';
import {
  sortDataRows,
  type DataColumnKey,
  type DataRow,
  type SortState,
} from './data-feedback-model';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectionHead,
} from '@/shared/ui/table';

export type TablePreviewProps = {
  expandedId?: string;
  onExpandedIdChange: (id?: string) => void;
  onSelectedIdsChange: (ids: readonly string[]) => void;
  onSortChange: (sort: SortState) => void;
  rows: readonly DataRow[];
  selectedIds: readonly string[];
  sort: SortState;
  variantId: string;
};

function nextSort(sort: SortState, key: DataColumnKey): SortState {
  if (sort.key !== key || sort.direction === 'none') return { key, direction: 'asc' };
  if (sort.direction === 'asc') return { key, direction: 'desc' };
  return { key, direction: 'none' };
}

function ariaSort(sort: SortState, key: DataColumnKey) {
  if (sort.key !== key || sort.direction === 'none') return 'none' as const;
  return sort.direction === 'asc' ? ('ascending' as const) : ('descending' as const);
}

export function DataFeedbackTablePreview({
  expandedId,
  onExpandedIdChange,
  onSelectedIdsChange,
  onSortChange,
  rows,
  selectedIds,
  sort,
  variantId,
}: TablePreviewProps): ReactElement {
  const sortedRows = sortDataRows(rows, sort);
  const isCompact = variantId === 'compact-ledger';

  return (
    <div className={styles.tablePreview} data-slot="data-feedback-table-preview">
      <Table
        aria-label={`${variantId} 리서치 근거 표`}
        className={styles.previewTable}
        containerProps={{ className: styles.tableViewport }}
        selectedKeys={selectedIds}
        selectionMode="multiple"
        surface={variantId === 'sticky-surface' ? 'framed' : 'plain'}
        onSelectionChange={onSelectedIdsChange}
      >
        <TableHeader className={styles.previewTableHeader}>
          <TableRow>
            <TableSelectionHead />
            <TableHead aria-sort={ariaSort(sort, 'ticker')}>
              <button
                className={styles.sortButton}
                type="button"
                onClick={() => onSortChange(nextSort(sort, 'ticker'))}
              >
                종목 정렬
              </button>
            </TableHead>
            <TableHead>기업</TableHead>
            <TableHead aria-sort={ariaSort(sort, 'score')} className={styles.numericCell}>
              <button
                className={styles.sortButton}
                type="button"
                onClick={() => onSortChange(nextSort(sort, 'score'))}
              >
                점수 정렬
              </button>
            </TableHead>
            <TableHead>상태</TableHead>
            <TableHead aria-label="연결 근거" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => {
            const expanded = expandedId === row.id;

            return (
              <TableRows
                expanded={expanded}
                isCompact={isCompact}
                key={row.id}
                row={row}
                onToggleExpanded={() => onExpandedIdChange(expanded ? undefined : row.id)}
              />
            );
          })}
        </TableBody>
        {isCompact ? (
          <TableFooter>
            <TableRow>
              <TableCell className={styles.tableSummary} colSpan={6}>
                선택 {selectedIds.length}건 · 평균 영향점수{' '}
                {Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)}
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}

function TableRows({
  expanded,
  isCompact,
  onToggleExpanded,
  row,
}: {
  expanded: boolean;
  isCompact: boolean;
  onToggleExpanded: () => void;
  row: DataRow;
}): ReactElement {
  return (
    <>
      <TableRow rowKey={row.id} selectionLabel={`${row.company} 선택`}>
        <TableCell className={styles.tickerCell}>{row.ticker}</TableCell>
        <TableCell>{isCompact ? row.company.replace('삼성바이오로직스', '삼성바이오') : row.company}</TableCell>
        <TableCell className={styles.numericCell}>{row.score}</TableCell>
        <TableCell>
          <span className={styles.tableStatus} data-status={row.status}>
            {row.status}
          </span>
        </TableCell>
        <TableCell className={styles.expandCell}>
          <button
            aria-expanded={expanded}
            aria-label={`${row.company} 근거 ${expanded ? '접기' : '펼치기'}`}
            className={styles.expandButton}
            data-row-selection-ignore
            type="button"
            onClick={onToggleExpanded}
          >
            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className={styles.evidenceRow}>
          <TableCell colSpan={6}>
            <div className={styles.evidenceDetail}>
              <strong>연결 근거</strong>
              <span>{row.source}</span>
              <p>{row.note}</p>
              <time dateTime="2026-08-04T21:30:00+09:00">21:30 업데이트</time>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
