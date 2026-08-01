import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { resolveTableSelection } from './table-selection-controller';
import styles from './table.module.css';

import { cn } from '@/shared/lib/utils';

export type TableSurface = 'framed' | 'plain';
export type TableSelectionMode = 'none' | 'single' | 'multiple';

type SelectionContextValue = {
  groupName: string;
  isSelected: (key: string) => boolean;
  selectionMode: TableSelectionMode;
  toggleSelectedKey: (key: string) => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export type TableProps = ComponentProps<'table'> & {
  containerProps?: ComponentProps<'div'>;
  defaultSelectedKeys?: readonly string[];
  onSelectionChange?: (keys: readonly string[]) => void;
  selectedKeys?: readonly string[];
  selectionMode?: TableSelectionMode;
  selectionSummary?: ReactNode;
  surface?: TableSurface;
};

export function Table({
  children,
  className,
  containerProps,
  defaultSelectedKeys = [],
  onSelectionChange,
  selectedKeys,
  selectionMode = 'none',
  selectionSummary,
  surface = 'framed',
  ...props
}: TableProps) {
  const groupName = useId();
  const [internalSelectedKeys, setInternalSelectedKeys] =
    useState<readonly string[]>(defaultSelectedKeys);
  const currentKeys = selectedKeys ?? internalSelectedKeys;
  const selectedSet = useMemo(() => new Set(currentKeys), [currentKeys]);
  const { className: containerClassName, ...restContainerProps } = containerProps ?? {};

  const toggleSelectedKey = useCallback(
    (key: string) => {
      if (selectionMode === 'none') return;
      const nextKeys = resolveTableSelection({ currentKeys, key, selectionMode });
      if (selectedKeys === undefined) setInternalSelectedKeys(nextKeys);
      onSelectionChange?.(nextKeys);
    },
    [currentKeys, onSelectionChange, selectedKeys, selectionMode],
  );

  const context = useMemo<SelectionContextValue>(
    () => ({
      groupName,
      isSelected: (key) => selectedSet.has(key),
      selectionMode,
      toggleSelectedKey,
    }),
    [groupName, selectedSet, selectionMode, toggleSelectedKey],
  );

  return (
    <SelectionContext.Provider value={context}>
      <div
        {...restContainerProps}
        className={cn(styles.container, containerClassName)}
        data-slot="table-container"
        data-surface={surface}
      >
        <table
          {...props}
          className={cn(styles.table, className)}
          data-selection-mode={selectionMode}
          data-slot="table"
        >
          {children}
        </table>
      </div>
      {selectionSummary}
    </SelectionContext.Provider>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn(styles.header, className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn(styles.body, className)} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn(styles.footer, className)} {...props} />;
}

export type TableRowProps = ComponentProps<'tr'> & {
  rowKey?: string;
  selectionLabel?: string;
};

export function TableRow({
  children,
  className,
  onClick,
  rowKey,
  selectionLabel,
  ...props
}: TableRowProps) {
  const selection = useContext(SelectionContext);
  const selectable = Boolean(selection && selection.selectionMode !== 'none' && rowKey);
  const selected = selectable && rowKey ? selection?.isSelected(rowKey) : false;

  const toggle = () => {
    if (selectable && rowKey) selection?.toggleSelectedKey(rowKey);
  };

  const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !selectable) return;
    if (
      event.target instanceof Element &&
      event.target.closest('a, button, input, select, textarea, [data-row-selection-ignore]')
    ) {
      return;
    }
    toggle();
  };

  return (
    <tr
      {...props}
      className={cn(styles.row, className)}
      data-selectable={selectable || undefined}
      data-slot="table-row"
      data-state={selected ? 'selected' : undefined}
      onClick={handleClick}
    >
      {selectable ? (
        <td className={styles.selectionCell} data-slot="table-selection-cell">
          <input
            aria-label={selectionLabel ?? '행 선택'}
            checked={Boolean(selected)}
            className={styles.selectionControl}
            name={selection?.selectionMode === 'single' ? selection.groupName : undefined}
            type={selection?.selectionMode === 'single' ? 'radio' : 'checkbox'}
            onChange={toggle}
          />
        </td>
      ) : null}
      {children}
    </tr>
  );
}

export function TableSelectionHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      {...props}
      aria-label={props['aria-label'] ?? '선택'}
      className={cn(styles.selectionHead, className)}
      data-slot="table-selection-head"
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return <th data-slot="table-head" className={cn(styles.head, className)} {...props} />;
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn(styles.cell, className)} {...props} />;
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn(styles.caption, className)} {...props} />;
}
