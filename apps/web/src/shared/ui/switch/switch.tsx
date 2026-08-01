import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import styles from './switch.module.css';

import { cn } from '@/shared/lib/utils';

export type SwitchVariant = 'quiet' | 'inset';

export type SwitchProps = Omit<ComponentProps<typeof SwitchPrimitive.Root>, 'children'> & {
  label?: ReactNode;
  pending?: boolean;
  variant?: SwitchVariant;
};

export function Switch({
  className,
  disabled,
  label,
  pending = false,
  variant = 'quiet',
  ...props
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      {...props}
      aria-busy={pending || props['aria-busy']}
      className={cn(styles.root, className)}
      data-slot="switch-control"
      data-variant={variant}
      disabled={disabled || pending}
    >
      <span className={styles.track} data-slot="switch-track" aria-hidden="true">
        <SwitchPrimitive.Thumb className={styles.thumb} data-slot="switch-thumb" />
      </span>
      {label ? (
        <span className={styles.label} data-slot="control-label">
          {label}
        </span>
      ) : null}
    </SwitchPrimitive.Root>
  );
}
