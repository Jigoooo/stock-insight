import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import styles from './checkbox.module.css';

import { cn } from '@/shared/lib/utils';

export type CheckboxVariant = 'plain' | 'inset' | 'ledger';

export type CheckboxProps = Omit<ComponentProps<typeof CheckboxPrimitive.Root>, 'children'> & {
  label?: ReactNode;
  pending?: boolean;
  variant?: CheckboxVariant;
};

export function Checkbox({
  className,
  disabled,
  label,
  pending = false,
  variant = 'plain',
  ...props
}: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      aria-busy={pending || props['aria-busy']}
      className={cn(styles.root, className)}
      data-slot="checkbox-control"
      data-variant={variant}
      disabled={disabled || pending}
    >
      <span className={styles.box} data-slot="checkbox-box" aria-hidden="true">
        <CheckboxPrimitive.Indicator className={styles.indicator} forceMount>
          <Check className={styles.check} />
          <Minus className={styles.minus} />
        </CheckboxPrimitive.Indicator>
      </span>
      {label ? (
        <span className={styles.label} data-slot="control-label">
          {label}
        </span>
      ) : null}
    </CheckboxPrimitive.Root>
  );
}
