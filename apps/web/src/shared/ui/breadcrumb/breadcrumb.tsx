import { Slot } from 'radix-ui';
import { forwardRef, type AnchorHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

import styles from './breadcrumb.module.css';

import { cn } from '@/shared/lib/utils';

export type BreadcrumbVariant = 'hairline' | 'soft-inset' | 'ledger';

export type BreadcrumbProps = HTMLAttributes<HTMLElement> & {
  variant?: BreadcrumbVariant;
};

export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(function Breadcrumb(
  { className, variant = 'hairline', ...props },
  ref,
) {
  return (
    <nav
      {...props}
      className={cn(styles.root, className)}
      data-slot="breadcrumb"
      data-variant={variant}
      ref={ref}
    />
  );
});

export const BreadcrumbList = forwardRef<HTMLOListElement, HTMLAttributes<HTMLOListElement>>(
  function BreadcrumbList({ className, ...props }, ref) {
    return (
      <ol {...props} className={cn(styles.list, className)} data-slot="breadcrumb-list" ref={ref} />
    );
  },
);

export const BreadcrumbItem = forwardRef<HTMLLIElement, HTMLAttributes<HTMLLIElement>>(
  function BreadcrumbItem({ className, ...props }, ref) {
    return (
      <li {...props} className={cn(styles.item, className)} data-slot="breadcrumb-item" ref={ref} />
    );
  },
);

export type BreadcrumbLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean;
};

export const BreadcrumbLink = forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  function BreadcrumbLink({ asChild = false, className, ...props }, ref) {
    const Comp = asChild ? Slot.Root : 'a';

    return (
      <Comp
        {...props}
        className={cn(styles.link, className)}
        data-slot="breadcrumb-link"
        ref={ref}
      />
    );
  },
);

export const BreadcrumbPage = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function BreadcrumbPage({ className, ...props }, ref) {
    return (
      <span
        {...props}
        aria-current="page"
        className={cn(styles.page, className)}
        data-slot="breadcrumb-page"
        ref={ref}
      />
    );
  },
);

export type BreadcrumbSeparatorProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
};

export const BreadcrumbSeparator = forwardRef<HTMLSpanElement, BreadcrumbSeparatorProps>(
  function BreadcrumbSeparator({ children, className, ...props }, ref) {
    return (
      <span
        {...props}
        aria-hidden="true"
        className={cn(styles.separator, className)}
        data-slot="breadcrumb-separator"
        ref={ref}
        role="presentation"
      >
        {children ?? (
          <>
            <span className={styles.chevron}>›</span>
            <span className={styles.slash}>/</span>
          </>
        )}
      </span>
    );
  },
);

export type BreadcrumbEllipsisProps = HTMLAttributes<HTMLSpanElement> & {
  label?: string;
};

export const BreadcrumbEllipsis = forwardRef<HTMLSpanElement, BreadcrumbEllipsisProps>(
  function BreadcrumbEllipsis({ className, label = 'More path items', ...props }, ref) {
    return (
      <span
        {...props}
        className={cn(styles.ellipsis, className)}
        data-slot="breadcrumb-ellipsis"
        ref={ref}
      >
        <span aria-hidden="true">…</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  },
);
