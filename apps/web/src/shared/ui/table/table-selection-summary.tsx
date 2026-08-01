import type { ReactNode } from 'react';

import styles from './table.module.css';

import { Button } from '@/shared/ui/button';

export type TableSelectionSummaryProps = {
  actionLabel?: string;
  children?: ReactNode;
  onClear?: () => void;
  selectedCount: number;
};

export function TableSelectionSummary({
  actionLabel = '선택 해제',
  children,
  onClear,
  selectedCount,
}: TableSelectionSummaryProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={styles.summary} data-slot="table-selection-summary" aria-live="polite">
      <div className={styles.summaryCopy}>{children ?? `${selectedCount}개 항목 선택됨`}</div>
      {onClear ? (
        <Button size="sm" variant="secondary" onClick={onClear}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
