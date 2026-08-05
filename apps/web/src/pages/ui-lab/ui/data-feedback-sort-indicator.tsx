import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactElement } from 'react';

import type { SortState } from './data-feedback-model';

export function DataFeedbackSortIndicator({
  className,
  direction,
}: {
  className?: string;
  direction: SortState['direction'];
}): ReactElement {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;

  return (
    <Icon aria-hidden="true" className={className} data-sort-icon data-sort-state={direction} />
  );
}
