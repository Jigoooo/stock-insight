import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';

export const Timeline = forwardRef<
  HTMLOListElement,
  HTMLAttributes<HTMLOListElement> & { children: ReactNode }
>(function Timeline({ children, className, ...props }, ref) {
  return (
    <ol ref={ref} className={cn(styles.timeline, className)} {...props}>
      {children}
    </ol>
  );
});
