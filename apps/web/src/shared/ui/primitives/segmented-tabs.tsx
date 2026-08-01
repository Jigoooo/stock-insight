import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from '@/shared/ui/button';
import styles from './primitives.module.css';
import { getNextEnabledTabIndex, isRovingTabKey } from './segmented-tabs-controller';
import { PresenceRegion } from '../motion/presence-region';

export type SegmentedTabItem = {
  controls?: string;
  disabled?: boolean;
  id?: string;
  label: ReactNode;
  value: string;
};

type SegmentedTabsProps = {
  'aria-label': string;
  className?: string;
  disabled?: boolean;
  items: readonly SegmentedTabItem[];
  onValueChange: (value: string) => void;
  pendingValue?: string;
  value: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function SegmentedTabs({
  'aria-label': ariaLabel,
  className,
  disabled = false,
  items,
  onValueChange,
  pendingValue,
  value,
}: SegmentedTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const disabledItems = items.map((item) => disabled || Boolean(item.disabled));

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!isRovingTabKey(event.key)) return;
    const nextIndex = getNextEnabledTabIndex({
      currentIndex,
      disabled: disabledItems,
      key: event.key,
    });
    const item = items[nextIndex];
    if (!item || disabledItems[nextIndex]) return;

    event.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    onValueChange(item.value);
  };

  return (
    <div
      className={classNames(styles.segmentedTabs, className)}
      data-slot="segmented-tabs-root"
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        const pending = item.value === pendingValue;
        return (
          <Button
            key={item.value}
            ref={(element: HTMLButtonElement | null) => {
              tabRefs.current[index] = element;
            }}
            id={item.id}
            aria-busy={pending || undefined}
            aria-controls={item.controls}
            aria-selected={selected}
            className={styles.segmentedTab}
            data-slot="segmented-tab-control"
            data-pending={pending || undefined}
            disabled={disabledItems[index]}
            motion="quiet"
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, index)}
          >
            <PresenceRegion
              aria-hidden="true"
              className={styles.segmentedTabIndicator}
              data-slot="segmented-tab-indicator"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              presenceKey={`${item.value}-indicator`}
              present={selected}
            />
            <span className={styles.segmentedTabLabel} data-slot="segmented-tab-label">
              {item.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
