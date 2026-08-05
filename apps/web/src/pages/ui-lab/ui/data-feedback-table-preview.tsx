import { ChevronDown, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { MouseEvent, ReactElement } from 'react';

import styles from './data-feedback-catalog.module.css';
import {
  sortDataRows,
  type DataColumnKey,
  type DataRow,
  type SortState,
} from './data-feedback-model';
import { DataFeedbackSortIndicator } from './data-feedback-sort-indicator';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectionHead,
  TableSelectionSummary,
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

function sortDirection(sort: SortState, key: DataColumnKey): SortState['direction'] {
  return sort.key === key ? sort.direction : 'none';
}

function toggleId(ids: readonly string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
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
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className={styles.tablePreview} data-slot="data-feedback-table-preview">
      <Table
        aria-label={`${variantId} 리서치 근거 표`}
        className={styles.previewTable}
        containerProps={{ className: styles.tableViewport }}
        selectedKeys={selectedIds}
        selectionMode="multiple"
        selectionSummary={
          <TableSelectionSummary
            selectedCount={selectedIds.length}
            onClear={() => onSelectedIdsChange([])}
          />
        }
        surface={variantId === 'sticky-surface' ? 'framed' : 'plain'}
        variant={variantId as 'expandable-rows' | 'sticky-surface' | 'compact-ledger'}
        onSelectionChange={onSelectedIdsChange}
      >
        <TableHeader className={styles.previewTableHeader}>
          <TableRow>
            <TableSelectionHead />
            <SortableTableHead
              column="ticker"
              label="종목"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTableHead
              column="company"
              label="기업"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTableHead
              numeric
              column="score"
              label="점수"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableTableHead
              column="status"
              label="상태"
              sort={sort}
              onSortChange={onSortChange}
            />
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
                reducedMotion={reducedMotion}
                row={row}
                selected={selectedIds.includes(row.id)}
                onSelectedChange={() => onSelectedIdsChange(toggleId(selectedIds, row.id))}
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

function SortableTableHead({
  column,
  label,
  numeric = false,
  onSortChange,
  sort,
}: {
  column: DataColumnKey;
  label: string;
  numeric?: boolean;
  onSortChange: (sort: SortState) => void;
  sort: SortState;
}): ReactElement {
  const direction = sortDirection(sort, column);

  return (
    <TableHead
      aria-sort={ariaSort(sort, column)}
      className={numeric ? styles.numericCell : undefined}
    >
      <button
        aria-label={`${label} 정렬`}
        className={styles.sortButton}
        data-numeric={numeric || undefined}
        type="button"
        onClick={() => onSortChange(nextSort(sort, column))}
      >
        <span>{label}</span>
        <DataFeedbackSortIndicator className={styles.sortIcon} direction={direction} />
      </button>
    </TableHead>
  );
}

function TableRows({
  expanded,
  isCompact,
  onToggleExpanded,
  onSelectedChange,
  reducedMotion,
  row,
  selected,
}: {
  expanded: boolean;
  isCompact: boolean;
  onSelectedChange: () => void;
  onToggleExpanded: () => void;
  reducedMotion: boolean;
  row: DataRow;
  selected: boolean;
}): ReactElement {
  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest('a, button, input, select, textarea, [data-row-selection-ignore]')
    ) {
      return;
    }
    onSelectedChange();
  };

  return (
    <>
      <motion.tr
        className={styles.animatedTableRow}
        data-selectable="true"
        data-slot="table-row"
        data-state={selected ? 'selected' : undefined}
        data-table-motion-row
        layout={reducedMotion ? false : 'position'}
        transition={
          reducedMotion ? undefined : { layout: { type: 'spring', duration: 0.28, bounce: 0 } }
        }
        onClick={handleRowClick}
      >
        <td className={styles.tableSelectionCell} data-slot="table-selection-cell">
          <input
            aria-label={`${row.company} 선택`}
            checked={selected}
            className={styles.tableSelectionControl}
            type="checkbox"
            onChange={onSelectedChange}
          />
        </td>
        <TableCell className={styles.tickerCell}>{row.ticker}</TableCell>
        <TableCell>
          {isCompact ? row.company.replace('삼성바이오로직스', '삼성바이오') : row.company}
        </TableCell>
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
      </motion.tr>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.tr
            className={styles.evidenceRow}
            data-table-detail-motion
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.16 }}
          >
            <TableCell colSpan={6}>
              <motion.div
                className={styles.evidenceDetailClip}
                initial={reducedMotion ? false : { height: 0 }}
                animate={{ height: 'auto' }}
                exit={reducedMotion ? { opacity: 0 } : { height: 0 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.22, ease: 'easeOut' }}
              >
                <div className={styles.evidenceDetail}>
                  <strong>연결 근거</strong>
                  <span>{row.source}</span>
                  <p>{row.note}</p>
                  <time dateTime="2026-08-04T21:30:00+09:00">21:30 업데이트</time>
                </div>
              </motion.div>
            </TableCell>
          </motion.tr>
        ) : null}
      </AnimatePresence>
    </>
  );
}
