'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Virtualized ARIA grid is intentionally div-based. */
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import {
  getDataGridVirtualRange,
  nextDataGridSort,
  type DataGridSortState,
} from './data-grid-model';
import styles from './data-grid.module.css';

import { cn } from '@/shared/lib/utils';
import { Select } from '@/shared/ui/select';

export type DataGridVariant = 'precision-grid' | 'soft-sheet' | 'dense-matrix';

export type DataGridColumn<Row> = {
  editor?:
    | { type: 'number'; max?: number; min?: number; step?: number }
    | { type: 'select'; options: readonly { label: string; value: string }[] }
    | { type: 'text' };
  key: string;
  label: string;
  maxWidth?: number;
  minWidth?: number;
  numeric?: boolean;
  render?: (row: Row) => ReactNode;
  value: (row: Row) => string | number;
  width: number;
};

export type DataGridProps<Row> = {
  ariaLabel: string;
  className?: string;
  columnBorders?: boolean;
  columnWidths: Readonly<Record<string, number>>;
  columns: readonly DataGridColumn<Row>[];
  editHint?: ReactNode;
  getRowId: (row: Row) => string;
  getRowLabel: (row: Row) => string;
  onCellChange?: (rowId: string, columnKey: string, value: string) => void;
  onColumnBordersChange?: (visible: boolean) => void;
  onColumnWidthsChange: (widths: Record<string, number>) => void;
  onSelectedKeysChange: (keys: readonly string[]) => void;
  onSortChange: (sort: DataGridSortState) => void;
  overscan?: number;
  rowHeight?: number;
  rows: readonly Row[];
  selectedKeys: readonly string[];
  sort: DataGridSortState;
  variant?: DataGridVariant;
  viewportHeight?: number;
};

type ActiveCell = { columnKey: string; rowId: string };
type EditingCell = { columnKey: string; originalValue: string; rowId: string };

function ariaSort(sort: DataGridSortState, key: string) {
  if (sort.key !== key || sort.direction === 'none') return 'none' as const;
  return sort.direction === 'asc' ? ('ascending' as const) : ('descending' as const);
}

function sortDirection(sort: DataGridSortState, key: string) {
  return sort.key === key ? sort.direction : 'none';
}

function toggleKey(keys: readonly string[], key: string) {
  return keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key];
}

export function DataGrid<Row>({
  ariaLabel,
  className,
  columnBorders = false,
  columnWidths,
  columns,
  editHint = '더블클릭 또는 Enter로 편집',
  getRowId,
  getRowLabel,
  onCellChange,
  onColumnBordersChange,
  onColumnWidthsChange,
  onSelectedKeysChange,
  onSortChange,
  overscan = 6,
  rowHeight = 44,
  rows,
  selectedKeys,
  sort,
  variant = 'precision-grid',
  viewportHeight = 320,
}: DataGridProps<Row>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);
  const focusRequestedRef = useRef(false);
  const reducedMotion = useReducedMotion() ?? false;
  const firstRow = rows[0];
  const firstColumn = columns[0];
  const [scrollTop, setScrollTop] = useState(0);
  const [activeCell, setActiveCell] = useState<ActiveCell | undefined>(() =>
    firstRow && firstColumn ? { columnKey: firstColumn.key, rowId: getRowId(firstRow) } : undefined,
  );
  const [editingCell, setEditingCell] = useState<EditingCell>();
  const [draft, setDraft] = useState('');
  const range = getDataGridVirtualRange({
    overscan,
    rowCount: rows.length,
    rowHeight,
    scrollTop,
    viewportHeight,
  });
  const visibleRows = rows.slice(range.start, range.end);
  const template = `48px ${columns.map(({ key, width }) => `${columnWidths[key] ?? width}px`).join(' ')}`;
  const templateStyle = { gridTemplateColumns: template } as CSSProperties;
  const totalWidth =
    48 + columns.reduce((sum, column) => sum + (columnWidths[column.key] ?? column.width), 0);
  const rowIds = rows.map(getRowId);
  const allRowsSelected = rowIds.length > 0 && rowIds.every((id) => selectedKeys.includes(id));
  const someRowsSelected = !allRowsSelected && rowIds.some((id) => selectedKeys.includes(id));

  useEffect(() => {
    if (!focusRequestedRef.current || !activeCell) return;
    focusRequestedRef.current = false;
    const active = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>('[data-row-id][data-column]') ?? []),
    ].find(
      (cell) =>
        cell.dataset.rowId === activeCell.rowId && cell.dataset.column === activeCell.columnKey,
    );
    active?.focus({ preventScroll: true });
  }, [activeCell, scrollTop]);

  useEffect(() => {
    if (editingCell) editorRef.current?.focus();
  }, [editingCell]);

  const startEditing = (row: Row, column: DataGridColumn<Row>) => {
    if (!column.editor || !onCellChange) return;
    const value = String(column.value(row));
    skipBlurCommitRef.current = false;
    setEditingCell({ columnKey: column.key, originalValue: value, rowId: getRowId(row) });
    setDraft(value);
  };

  const commitEdit = (value: string) => {
    if (!editingCell) return;
    onCellChange?.(editingCell.rowId, editingCell.columnKey, value);
    setEditingCell(undefined);
  };

  const moveActiveCell = (rowIndex: number, columnKey: string) => {
    const nextRowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex));
    const nextRow = rows[nextRowIndex];
    if (!nextRow) return;
    const viewport = viewportRef.current;
    const rowTop = nextRowIndex * rowHeight;
    const rowBottom = rowTop + rowHeight;
    if (viewport) {
      if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
      else if (rowBottom > viewport.scrollTop + viewportHeight) {
        viewport.scrollTop = rowBottom - viewportHeight;
      }
    }
    focusRequestedRef.current = true;
    setActiveCell({ columnKey, rowId: getRowId(nextRow) });
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    row: Row,
    column: DataGridColumn<Row>,
  ) => {
    const rowIndex = rows.findIndex((item) => getRowId(item) === getRowId(row));
    const columnIndex = columns.findIndex(({ key }) => key === column.key);
    let nextRowIndex = rowIndex;
    let nextColumnKey = column.key;
    switch (event.key) {
      case 'ArrowUp':
        nextRowIndex -= 1;
        break;
      case 'ArrowDown':
        nextRowIndex += 1;
        break;
      case 'ArrowLeft':
        nextColumnKey = columns[Math.max(0, columnIndex - 1)]?.key ?? column.key;
        break;
      case 'ArrowRight':
        nextColumnKey = columns[Math.min(columns.length - 1, columnIndex + 1)]?.key ?? column.key;
        break;
      case 'Home':
        nextColumnKey = columns[0]?.key ?? column.key;
        break;
      case 'End':
        nextColumnKey = columns.at(-1)?.key ?? column.key;
        break;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        startEditing(row, column);
        return;
      default:
        return;
    }
    event.preventDefault();
    moveActiveCell(nextRowIndex, nextColumnKey);
  };

  return (
    <div ref={rootRef} className={cn(styles.preview, className)} data-slot="data-grid-root">
      <div className={styles.toolbar}>
        {onColumnBordersChange ? (
          <label className={styles.option}>
            <input
              aria-label="수직선 표시"
              checked={columnBorders}
              className={styles.selectionControl}
              type="checkbox"
              onChange={(event) => onColumnBordersChange(event.currentTarget.checked)}
            />
            <span>수직선</span>
          </label>
        ) : null}
        <span>{editHint}</span>
      </div>
      <div
        aria-colcount={columns.length + 1}
        aria-label={ariaLabel}
        aria-rowcount={rows.length + 1}
        className={styles.grid}
        data-column-borders={columnBorders || undefined}
        data-variant={variant}
        role="grid"
      >
        <div
          ref={viewportRef}
          className={styles.viewport}
          data-slot="data-grid-viewport"
          style={{ height: viewportHeight }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div
            aria-rowindex={1}
            className={styles.header}
            role="row"
            style={{ ...templateStyle, minWidth: totalWidth }}
          >
            <div aria-label="행 선택" className={styles.headerCell} role="columnheader">
              <input
                ref={(input) => {
                  if (input) input.indeterminate = someRowsSelected;
                }}
                aria-label="전체 행 선택"
                checked={allRowsSelected}
                className={styles.selectionControl}
                type="checkbox"
                onChange={(event) =>
                  onSelectedKeysChange(event.currentTarget.checked ? rowIds : [])
                }
              />
            </div>
            {columns.map((column, index) => (
              <ColumnHeader
                column={column}
                currentWidth={columnWidths[column.key] ?? column.width}
                key={column.key}
                pinned={index === 0 && variant === 'dense-matrix'}
                sort={sort}
                onSortChange={() => onSortChange(nextDataGridSort(sort, column.key))}
                onWidthChange={(width) =>
                  onColumnWidthsChange({ ...columnWidths, [column.key]: width })
                }
              />
            ))}
          </div>
          <div
            className={styles.spacer}
            style={{ height: range.totalHeight, minWidth: totalWidth }}
          >
            <div className={styles.rows} style={{ transform: `translateY(${range.offsetTop}px)` }}>
              <motion.div
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                className={styles.sortWindow}
                data-grid-sort-window
                initial={reducedMotion ? false : { opacity: 0.72, transform: 'translateY(6px)' }}
                key={`${sort.key}-${sort.direction}`}
                transition={
                  reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: 'easeOut' }
                }
              >
                {visibleRows.map((row, visibleIndex) => {
                  const rowId = getRowId(row);
                  const selected = selectedKeys.includes(rowId);
                  return (
                    <div
                      aria-rowindex={range.start + visibleIndex + 2}
                      className={styles.row}
                      data-grid-motion-row
                      data-selected={selected || undefined}
                      key={rowId}
                      role="row"
                      style={{ ...templateStyle, height: rowHeight, minWidth: totalWidth }}
                    >
                      <div className={styles.selectionCell} role="gridcell">
                        <input
                          aria-label={`${getRowLabel(row)} 선택`}
                          checked={selected}
                          className={styles.selectionControl}
                          type="checkbox"
                          onChange={() => onSelectedKeysChange(toggleKey(selectedKeys, rowId))}
                        />
                      </div>
                      {columns.map((column, index) => {
                        const editing =
                          editingCell?.rowId === rowId && editingCell.columnKey === column.key;
                        const active =
                          activeCell?.rowId === rowId && activeCell.columnKey === column.key;
                        return (
                          <div
                            aria-selected={active || undefined}
                            className={styles.cell}
                            data-column={column.key}
                            data-editing={editing || undefined}
                            data-numeric={column.numeric || undefined}
                            data-pinned={
                              index === 0 && variant === 'dense-matrix' ? true : undefined
                            }
                            data-row-id={rowId}
                            key={column.key}
                            role="gridcell"
                            tabIndex={active ? 0 : -1}
                            onDoubleClick={() => startEditing(row, column)}
                            onFocus={() => setActiveCell({ columnKey: column.key, rowId })}
                            onKeyDown={(event) => handleCellKeyDown(event, row, column)}
                          >
                            {editing ? (
                              <CellEditor
                                column={column}
                                draft={draft}
                                editorRef={editorRef}
                                label={`${getRowLabel(row)} ${column.label} 편집`}
                                onCancel={() => {
                                  skipBlurCommitRef.current = true;
                                  setDraft(editingCell.originalValue);
                                  setEditingCell(undefined);
                                }}
                                onChange={setDraft}
                                onCommit={commitEdit}
                                onSkipBlur={() => {
                                  if (!skipBlurCommitRef.current) return false;
                                  skipBlurCommitRef.current = false;
                                  return true;
                                }}
                              />
                            ) : column.render ? (
                              column.render(row)
                            ) : (
                              column.value(row)
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnHeader<Row>({
  column,
  currentWidth,
  onSortChange,
  onWidthChange,
  pinned,
  sort,
}: {
  column: DataGridColumn<Row>;
  currentWidth: number;
  onSortChange: () => void;
  onWidthChange: (width: number) => void;
  pinned: boolean;
  sort: DataGridSortState;
}) {
  const dragRef = useRef<{ pointerId: number; startWidth: number; startX: number } | undefined>(
    undefined,
  );
  const minWidth = column.minWidth ?? 72;
  const maxWidth = column.maxWidth ?? 320;
  const resize = (width: number) => onWidthChange(Math.max(minWidth, Math.min(maxWidth, width)));
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startWidth: currentWidth,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <div
      aria-sort={ariaSort(sort, column.key)}
      className={styles.headerCell}
      data-column={column.key}
      data-numeric={column.numeric || undefined}
      data-pinned={pinned || undefined}
      role="columnheader"
    >
      <button
        aria-label={`${column.label} 정렬`}
        className={styles.sortButton}
        data-grid-sort-button
        data-sort-state={sortDirection(sort, column.key)}
        type="button"
        onClick={onSortChange}
      >
        <span>{column.label}</span>
        <SortIndicator direction={sortDirection(sort, column.key)} />
      </button>
      <div
        aria-label={`${column.label} 열 너비 조절`}
        aria-orientation="vertical"
        aria-valuemax={maxWidth}
        aria-valuemin={minWidth}
        aria-valuenow={currentWidth}
        className={styles.resizer}
        role="separator"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            resize(currentWidth - 8);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            resize(currentWidth + 8);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          resize(drag.startWidth + event.clientX - drag.startX);
        }}
        onPointerUp={(event) => {
          dragRef.current = undefined;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
    </div>
  );
}

function SortIndicator({ direction }: { direction: 'asc' | 'desc' | 'none' }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <Icon
      aria-hidden="true"
      className={styles.sortIcon}
      data-sort-icon
      data-sort-state={direction}
    />
  );
}

function CellEditor<Row>({
  column,
  draft,
  editorRef,
  label,
  onCancel,
  onChange,
  onCommit,
  onSkipBlur,
}: {
  column: DataGridColumn<Row>;
  draft: string;
  editorRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onSkipBlur: () => boolean;
}) {
  if (column.editor?.type === 'select') {
    return (
      <Select
        aria-label={label}
        className={styles.select}
        options={column.editor.options}
        value={draft}
        onValueChange={onCommit}
      />
    );
  }
  const numericEditor = column.editor?.type === 'number' ? column.editor : undefined;
  return (
    <input
      ref={editorRef}
      aria-label={label}
      className={styles.input}
      inputMode={numericEditor ? 'numeric' : undefined}
      max={numericEditor?.max}
      min={numericEditor?.min}
      step={numericEditor?.step}
      type={numericEditor ? 'number' : 'text'}
      value={draft}
      onBlur={() => {
        if (!onSkipBlur()) onCommit(draft);
      }}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit(draft);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
