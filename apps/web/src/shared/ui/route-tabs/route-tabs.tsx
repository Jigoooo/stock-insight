import { forwardRef, type AnchorHTMLAttributes, type HTMLAttributes } from 'react';

import styles from './route-tabs.module.css';

import { cn } from '@/shared/lib/utils';

export type RouteTabsVariant = 'hairline' | 'quiet-surface';

export type RouteTabsProps = HTMLAttributes<HTMLElement> & {
  fullWidth?: boolean;
  variant?: RouteTabsVariant;
};

export const RouteTabs = forwardRef<HTMLElement, RouteTabsProps>(function RouteTabs(
  { className, fullWidth = false, variant = 'hairline', ...props },
  ref,
) {
  return (
    <nav
      {...props}
      className={cn(styles.root, className)}
      data-full-width={fullWidth || undefined}
      data-slot="route-tabs"
      data-variant={variant}
      ref={ref}
    />
  );
});

export type RouteTabProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  active?: boolean;
};

export const RouteTab = forwardRef<HTMLAnchorElement, RouteTabProps>(function RouteTab(
  { active = false, children, className, ...props },
  ref,
) {
  return (
    <a
      {...props}
      aria-current={active ? 'page' : props['aria-current']}
      className={cn(styles.tab, className)}
      data-active={active || undefined}
      data-slot="route-tab"
      ref={ref}
    >
      {children}
    </a>
  );
});
