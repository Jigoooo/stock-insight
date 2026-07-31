import type { HTMLAttributes, ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';

export function StructuredList({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLUListElement> & { children: ReactNode }) {
  return (
    <ul className={cn(styles.structuredList, className)} {...props}>
      {children}
    </ul>
  );
}
