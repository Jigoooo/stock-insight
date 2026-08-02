'use client';

import { forwardRef, type HTMLAttributes } from 'react';

import styles from './button-group.module.css';

import { cn } from '@/shared/lib/utils';

export type ButtonGroupVariant = 'hairline' | 'inset';
export type ButtonGroupOrientation = 'horizontal' | 'vertical';

export type ButtonGroupProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: ButtonGroupOrientation;
  variant?: ButtonGroupVariant;
};

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { children, className, orientation = 'horizontal', role, variant = 'hairline', ...props },
  ref,
) {
  return (
    <div
      {...props}
      className={cn(styles.root, className)}
      data-orientation={orientation}
      data-slot="button-group"
      data-variant={variant}
      ref={ref}
      role={role ?? 'group'}
    >
      {children}
    </div>
  );
});
