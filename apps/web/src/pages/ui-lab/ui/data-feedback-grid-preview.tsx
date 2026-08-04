/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Virtualized ARIA grid is intentionally div-based. */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import styles from './data-feedback-catalog.module.css';
import {
  getVirtualRange,
  sortDataRows,
  updateDataCell,
  type DataColumnKey,
  type DataRow,
  type DataRowStatus,
  type EditableDataColumnKey,
  type SortState,
} from './data-feedback-model';

import { Select } from '@/shared/ui/select';

const rowHeight = 44;
const viewportHeight = 320;
const focusableColumns: readonly DataColumnKey[] = [
  'ticker',
  'company',
  'score',
  'status',
  'note',
  'source',
];
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

type ActiveCell = { column: DataColumnKey; rowId: string };
type EditingCell = {
  column: EditableDataColumnKey;
  originalValue: string;
  rowId: string;
};

type DataGridPreviewProps = {
  columnWidths: Record<DataColumnKey, number>;
  onColumnWidthsChange: (widths: Record<DataColumnKey, number>) => void;
  onRowsChange: (rows: DataRow[]) => void;
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

function toggleId(ids: readonly string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function gridTemplate(widths: Record<DataColumnKey, number>) {
  return `48px ${widths.ticker}px ${widths.company}px ${widths.score}px ${widths.status}px ${widths.note}px ${widths.source}px`;
}

export function DataFeedbackGridPreview({
  columnWidths,
  onColumnWidthsChange,
  onRowsChange,
  onSelectedIdsChange,
  onSortChange,
  rows,
  selectedIds,
  sort,
  variantId,
}: DataGridPreviewProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);
  const focusRequestedRef = useRef(false);
  const sortedRows = sortDataRows(rows, sort);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeCell, setActiveCell] = useState<ActiveCell>(() => ({
    rowId: rows[0]!.id,
    column: 'ticker',
  }));
  const [editingCell, setEditingCell] = useState<EditingCell>();
  const [draft, setDraft] = useState('');
  const range = getVirtualRange({
    scrollTop,
    viewportHeight,
    rowCount: sortedRows.length,
  });
  const visibleRows = sortedRows.slice(range.start, range.end);
  const templateStyle = { gridTemplateColumns: gridTemplate(columnWidths) } as CSSProperties;
  const totalWidth = 48 + Object.values(columnWidths).reduce((sum, width) => sum + width, 0);

  useEffect(() => {
    if (!focusRequestedRef.current) return;
    focusRequestedRef.current = false;
    const active = rootRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${activeCell.rowId}"][data-column="${activeCell.column}"]`,
    );
    active?.focus({ preventScroll: true });
  }, [activeCell, scrollTop]);

  useEffect(() => {
    if (editingCell?.column === 'note') editorRef.current?.focus();
  }, [editingCell]);

  const moveActiveCell = (rowIndex: number, column: DataColumnKey) => {
    const nextRow = sortedRows[Math.max(0, Math.min(sortedRows.length - 1, rowIndex))];
    if (!nextRow) return;

    const nextIndex = sortedRows.indexOf(nextRow);
    const viewport = viewportRef.current;
    const rowTop = nextIndex * rowHeight;
    const rowBottom = rowTop + rowHeight;

    if (viewport) {
      if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
      else if (rowBottom > viewport.scrollTop + viewportHeight) {
        viewport.scrollTop = rowBottom - viewportHeight;
      }
    }

    focusRequestedRef.current = true;
    setActiveCell({ rowId: nextRow.id, column });
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    row: DataRow,
    column: DataColumnKey,
  ) => {
    const rowIndex = sortedRows.findIndex(({ id }) => id === row.id);
    const columnIndex = focusableColumns.indexOf(column);
    let nextRowIndex = rowIndex;
    let nextColumn = column;

    switch (event.key) {
      case 'ArrowUp':
        nextRowIndex -= 1;
        break;
      case 'ArrowDown':
        nextRowIndex += 1;
        break;
      case 'ArrowLeft':
        nextColumn = focusableColumns[Math.max(0, columnIndex - 1)]!;
        break;
      case 'ArrowRight':
        nextColumn = focusableColumns[Math.min(focusableColumns.length - 1, columnIndex + 1)]!;
        break;
      case 'Home':
        nextColumn = focusableColumns[0]!;
        break;
      case 'End':
        nextColumn = focusableColumns.at(-1)!;
        break;
      case 'Enter':
      case 'F2':
        if (column === 'note' || column === 'status') {
          event.preventDefault();
          startEditing(row, column);
        }
        return;
      default:
        return;
    }

    event.preventDefault();
    moveActiveCell(nextRowIndex, nextColumn);
  };

  const startEditing = (row: DataRow, column: EditableDataColumnKey) => {
    const value = row[column];
    skipBlurCommitRef.current = false;
    setEditingCell({ rowId: row.id, column, originalValue: value });
    setDraft(value);
  };

  const commitEdit = (value: string) => {
    if (!editingCell) return;
    onRowsChange(updateDataCell(rows, editingCell.rowId, editingCell.column, value));
    setEditingCell(undefined);
  };

  return (
    <div
      ref={rootRef}
      aria-colcount={7}
      aria-label={`${variantId} 리서치 데이터 그리드`}
      aria-rowcount={sortedRows.length + 1}
      className={styles.dataGrid}
      data-grid-variant={variantId}
      role="grid"
    >
      <div
        ref={viewportRef}
        className={styles.dataGridViewport}
        data-slot="data-grid-viewport"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div
          aria-rowindex={1}
          className={styles.dataGridHeader}
          role="row"
          style={{ ...templateStyle, minWidth: totalWidth }}
        >
          <div aria-label="선택" className={styles.dataGridHeaderCell} role="columnheader" />
          {focusableColumns.map((column) => (
            <GridColumnHeader
              column={column}
              key={column}
              sort={sort}
              width={columnWidths[column]}
              onSortChange={(key) => onSortChange(nextSort(sort, key))}
              onWidthChange={(width) =>
                onColumnWidthsChange({ ...columnWidths, [column]: width })
              }
            />
          ))}
        </div>

        <div
          className={styles.dataGridSpacer}
          style={{ height: range.totalHeight, minWidth: totalWidth }}
        >
          <div
            className={styles.dataGridRows}
            style={{ transform: `translateY(${range.offsetTop}px)` }}
          >
            {visibleRows.map((row, visibleIndex) => {
              const rowIndex = range.start + visibleIndex;
              const selected = selectedIds.includes(row.id);

              return (
                <div
                  aria-rowindex={rowIndex + 2}
                  className={styles.dataGridRow}
                  data-selected={selected || undefined}
                  key={row.id}
                  role="row"
                  style={{ ...templateStyle, minWidth: totalWidth }}
                >
                  <div className={styles.dataGridSelectionCell} role="gridcell">
                    <input
                      aria-label={`${row.company} 선택`}
                      checked={selected}
                      type="checkbox"
                      onChange={() => onSelectedIdsChange(toggleId(selectedIds, row.id))}
                    />
                  </div>
                  {focusableColumns.map((column) => {
                    const editing =
                      editingCell?.rowId === row.id && editingCell.column === column;
                    const active = activeCell.rowId === row.id && activeCell.column === column;

                    return (
                      <div
                        aria-selected={active || undefined}
                        className={styles.dataGridCell}
                        data-column={column}
                        data-editing={editing || undefined}
                        data-row-id={row.id}
                        key={column}
                        role="gridcell"
                        tabIndex={active ? 0 : -1}
                        onDoubleClick={() => {
                          if (column === 'note' || column === 'status') startEditing(row, column);
                        }}
                        onFocus={() => setActiveCell({ rowId: row.id, column })}
                        onKeyDown={(event) => handleCellKeyDown(event, row, column)}
                      >
                        {editing && column === 'note' ? (
                          <input
                            ref={editorRef}
                            aria-label={`${row.company} 메모 편집`}
                            className={styles.dataGridInput}
                            value={draft}
                            onBlur={() => {
                              if (skipBlurCommitRef.current) {
                                skipBlurCommitRef.current = false;
                                return;
                              }
                              commitEdit(draft);
                            }}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commitEdit(draft);
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                skipBlurCommitRef.current = true;
                                setDraft(editingCell.originalValue);
                                setEditingCell(undefined);
                              }
                            }}
                          />
                        ) : editing && column === 'status' ? (
                          <Select
                            aria-label={`${row.company} 상태 편집`}
                            className={styles.dataGridSelect}
                            options={statusOptions}
                            value={draft}
                            onValueChange={(value) => commitEdit(value as DataRowStatus)}
                          />
                        ) : (
                          <CellValue column={column} row={row} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CellValue({ column, row }: { column: DataColumnKey; row: DataRow }) {
  if (column === 'status') {
    return (
      <span className={styles.gridStatus} data-status={row.status}>
        {row.status}
      </span>
    );
  }
  return row[column];
}

function GridColumnHeader({
  column,
  onSortChange,
  onWidthChange,
  sort,
  width,
}: {
  column: DataColumnKey;
  onSortChange: (column: DataColumnKey) => void;
  onWidthChange: (width: number) => void;
  sort: SortState;
  width: number;
}) {
  const dragRef = useRef<
    { pointerId: number; startWidth: number; startX: number } | undefined
  >(undefined);
  const labels: Record<DataColumnKey, string> = {
    ticker: '종목',
    company: '기업',
    score: '점수',
    status: '상태',
    note: '메모',
    source: '출처',
  };

  const resize = (nextWidth: number) => onWidthChange(Math.max(72, Math.min(320, nextWidth)));
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, startWidth: width, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    resize(drag.startWidth + event.clientX - drag.startX);
  };

  return (
    <div
      aria-sort={ariaSort(sort, column)}
      className={styles.dataGridHeaderCell}
      data-column={column}
      role="columnheader"
    >
      <button
        className={styles.gridSortButton}
        type="button"
        onClick={() => onSortChange(column)}
      >
        {labels[column]} 정렬
      </button>
      <div
        aria-label={`${labels[column]} 열 너비 조절`}
        aria-orientation="vertical"
        aria-valuemax={320}
        aria-valuemin={72}
        aria-valuenow={width}
        className={styles.columnResizer}
        role="separator"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            resize(width - 8);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            resize(width + 8);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          dragRef.current = undefined;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
    </div>
  );
}
