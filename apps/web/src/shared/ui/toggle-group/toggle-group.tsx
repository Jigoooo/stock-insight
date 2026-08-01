'use client';

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { LayoutGroup, motion } from 'motion/react';
import { useId, type ComponentProps, type ReactNode } from 'react';

import styles from './toggle-group.module.css';

import { cn } from '@/shared/lib/utils';

export type ToggleGroupItem = {
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

type ToggleGroupSingleRootProps = Extract<
  ComponentProps<typeof ToggleGroupPrimitive.Root>,
  { type: 'single' }
>;

export type ToggleGroupProps = Omit<
  ToggleGroupSingleRootProps,
  'children' | 'type' | 'value' | 'onValueChange'
> & {
  allowEmpty?: boolean;
  items: readonly ToggleGroupItem[];
  onValueChange: (value: string) => void;
  value: string;
};

export function ToggleGroup({
  allowEmpty = false,
  className,
  items,
  onValueChange,
  value,
  ...props
}: ToggleGroupProps) {
  const layoutGroupId = useId();

  return (
    <LayoutGroup id={layoutGroupId}>
      <ToggleGroupPrimitive.Root
        {...props}
        className={cn(styles.root, className)}
        data-slot="toggle-group"
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue || allowEmpty) onValueChange(nextValue);
        }}
      >
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <ToggleGroupPrimitive.Item
              key={item.value}
              className={styles.item}
              data-slot="toggle-group-item"
              disabled={item.disabled}
              value={item.value}
            >
              {selected ? (
                <motion.span
                  className={styles.indicator}
                  data-slot="toggle-group-indicator"
                  layoutId="toggle-group-indicator"
                  transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                />
              ) : null}
              <span className={styles.label}>{item.label}</span>
            </ToggleGroupPrimitive.Item>
          );
        })}
      </ToggleGroupPrimitive.Root>
    </LayoutGroup>
  );
}
