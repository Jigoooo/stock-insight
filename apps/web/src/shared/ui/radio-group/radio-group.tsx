import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactElement, type ReactNode } from 'react';

import styles from './radio-group.module.css';

import { cn } from '@/shared/lib/utils';

export type RadioGroupVariant = 'hairline' | 'inset' | 'rail';

export type RadioGroupOption = {
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

export type RadioGroupProps = Omit<ComponentProps<typeof RadioGroupPrimitive.Root>, 'children'> & {
  label?: ReactNode;
  items: readonly RadioGroupOption[];
  pending?: boolean;
  variant?: RadioGroupVariant;
};

export function RadioGroup({
  'aria-labelledby': ariaLabelledBy,
  className,
  items,
  label,
  pending = false,
  variant = 'hairline',
  ...props
}: RadioGroupProps): ReactElement {
  const labelId = useId();

  return (
    <RadioGroupPrimitive.Root
      {...props}
      aria-busy={pending || props['aria-busy']}
      aria-labelledby={ariaLabelledBy ?? (label ? labelId : undefined)}
      className={cn(styles.root, className)}
      data-slot="radio-group"
      data-variant={variant}
    >
      {label ? (
        <span className={styles.groupLabel} data-slot="control-label" id={labelId}>
          {label}
        </span>
      ) : null}
      {items.map((item) => (
        <RadioGroupPrimitive.Item
          key={item.value}
          className={styles.item}
          data-slot="radio-group-item"
          disabled={item.disabled || pending}
          value={item.value}
        >
          <span className={styles.mark} aria-hidden="true">
            <RadioGroupPrimitive.Indicator
              className={styles.indicator}
              data-slot="radio-group-indicator"
            />
          </span>
          <span className={styles.copy}>
            <span className={styles.itemLabel}>{item.label}</span>
            {item.description ? (
              <span className={styles.description}>{item.description}</span>
            ) : null}
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
