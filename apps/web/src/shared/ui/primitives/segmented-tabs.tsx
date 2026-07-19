import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from './button';
import styles from './primitives.module.css';
import { getNextEnabledTabIndex, isRovingTabKey } from './segmented-tabs-controller';

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
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        const pending = item.value === pendingValue;
        return (
          <Button
            key={item.value}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={item.id}
            aria-busy={pending || undefined}
            aria-controls={item.controls}
            aria-selected={selected}
            className={styles.segmentedTab}
            data-pending={pending || undefined}
            disabled={disabledItems[index]}
            motion="quiet"
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
