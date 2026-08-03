'use client';

import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { Slot } from 'radix-ui';
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import {
  composePaginationActionClick,
  isPaginationActionDisabled,
  paginationActionSemantics,
  prepareSlottedPaginationAction,
} from './pagination-availability';
import styles from './pagination.module.css';

import { cn } from '@/shared/lib/utils';

export type PaginationVariant = 'hairline' | 'soft-inset' | 'ledger';

type PaginationContextValue = {
  reducedMotion: boolean;
  variant: PaginationVariant;
};

const PaginationContext = createContext<PaginationContextValue>({
  reducedMotion: false,
  variant: 'hairline',
});

export type PaginationProps = HTMLAttributes<HTMLElement> & {
  variant?: PaginationVariant;
};

export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  { className, variant = 'hairline', ...props },
  ref,
) {
  const layoutScopeId = useId();
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <PaginationContext.Provider value={{ reducedMotion, variant }}>
      <LayoutGroup id={layoutScopeId}>
        <nav
          {...props}
          className={cn(styles.root, className)}
          data-slot="pagination"
          data-variant={variant}
          ref={ref}
        />
      </LayoutGroup>
    </PaginationContext.Provider>
  );
});

export const PaginationList = forwardRef<HTMLOListElement, HTMLAttributes<HTMLOListElement>>(
  function PaginationList({ className, ...props }, ref) {
    return (
      <ol {...props} className={cn(styles.list, className)} data-slot="pagination-list" ref={ref} />
    );
  },
);

export const PaginationItem = forwardRef<HTMLLIElement, HTMLAttributes<HTMLLIElement>>(
  function PaginationItem({ className, ...props }, ref) {
    return (
      <li {...props} className={cn(styles.item, className)} data-slot="pagination-item" ref={ref} />
    );
  },
);

export type PaginationLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean;
  current?: boolean;
};

export const PaginationLink = forwardRef<HTMLAnchorElement, PaginationLinkProps>(
  function PaginationLink(
    {
      'aria-current': ariaCurrent,
      asChild = false,
      children,
      className,
      current = false,
      ...props
    },
    ref,
  ) {
    const { reducedMotion, variant } = useContext(PaginationContext);
    const Comp = asChild ? Slot.Root : 'a';
    const isCurrent = current || ariaCurrent === 'page';

    return (
      <Comp
        {...props}
        aria-current={isCurrent ? 'page' : ariaCurrent}
        className={cn(styles.link, className)}
        data-slot="pagination-link"
        ref={ref}
      >
        {variant === 'soft-inset' && isCurrent ? (
          <motion.span
            aria-hidden="true"
            className={styles.indicator}
            data-slot="pagination-indicator"
            layoutId="pagination-soft-inset-indicator"
            transition={
              reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 32 }
            }
          />
        ) : null}
        <Slot.Slottable>{children}</Slot.Slottable>
      </Comp>
    );
  },
);

type PaginationDirectionProps = PaginationLinkProps & {
  disabled?: boolean;
  label?: string;
};

export const PaginationPrevious = forwardRef<HTMLAnchorElement, PaginationDirectionProps>(
  function PaginationPrevious(
    {
      'aria-disabled': ariaDisabled,
      asChild = false,
      children,
      className,
      disabled = false,
      label = 'Previous page',
      onClick,
      tabIndex,
      ...props
    },
    ref,
  ) {
    const state = { ariaDisabled, disabled };
    if (asChild) {
      const slotted = prepareSlottedPaginationAction(children, state, onClick);
      return (
        <Slot.Root
          {...props}
          aria-disabled={slotted.semantics.ariaDisabled ?? ariaDisabled}
          className={cn(styles.link, className)}
          data-direction="previous"
          data-slot="pagination-previous"
          onClick={slotted.handleClick}
          ref={ref}
          tabIndex={slotted.semantics.tabIndex ?? tabIndex}
        >
          {slotted.slottedChild}
        </Slot.Root>
      );
    }

    const isDisabled = isPaginationActionDisabled(state);
    const semantics = paginationActionSemantics(isDisabled, false);
    return (
      <PaginationLink
        {...props}
        aria-disabled={semantics.ariaDisabled ?? ariaDisabled}
        className={className}
        data-direction="previous"
        onClick={composePaginationActionClick({ disabled: isDisabled, onClick })}
        ref={ref}
        tabIndex={semantics.tabIndex ?? tabIndex}
      >
        {children ?? (
          <>
            <span aria-hidden="true">←</span>
            <span className="sr-only">{label}</span>
          </>
        )}
      </PaginationLink>
    );
  },
);

export const PaginationNext = forwardRef<HTMLAnchorElement, PaginationDirectionProps>(
  function PaginationNext(
    {
      'aria-disabled': ariaDisabled,
      asChild = false,
      children,
      className,
      disabled = false,
      label = 'Next page',
      onClick,
      tabIndex,
      ...props
    },
    ref,
  ) {
    const state = { ariaDisabled, disabled };
    if (asChild) {
      const slotted = prepareSlottedPaginationAction(children, state, onClick);
      return (
        <Slot.Root
          {...props}
          aria-disabled={slotted.semantics.ariaDisabled ?? ariaDisabled}
          className={cn(styles.link, className)}
          data-direction="next"
          data-slot="pagination-next"
          onClick={slotted.handleClick}
          ref={ref}
          tabIndex={slotted.semantics.tabIndex ?? tabIndex}
        >
          {slotted.slottedChild}
        </Slot.Root>
      );
    }

    const isDisabled = isPaginationActionDisabled(state);
    const semantics = paginationActionSemantics(isDisabled, false);
    return (
      <PaginationLink
        {...props}
        aria-disabled={semantics.ariaDisabled ?? ariaDisabled}
        className={className}
        data-direction="next"
        onClick={composePaginationActionClick({ disabled: isDisabled, onClick })}
        ref={ref}
        tabIndex={semantics.tabIndex ?? tabIndex}
      >
        {children ?? (
          <>
            <span className="sr-only">{label}</span>
            <span aria-hidden="true">→</span>
          </>
        )}
      </PaginationLink>
    );
  },
);

export type PaginationEllipsisProps = HTMLAttributes<HTMLSpanElement> & {
  label?: string;
};

export const PaginationEllipsis = forwardRef<HTMLSpanElement, PaginationEllipsisProps>(
  function PaginationEllipsis({ children, className, label = 'More pages', ...props }, ref) {
    return (
      <span
        {...props}
        className={cn(styles.ellipsis, className)}
        data-slot="pagination-ellipsis"
        ref={ref}
      >
        {children ?? (
          <>
            <span aria-hidden="true">…</span>
            <span className="sr-only">{label}</span>
          </>
        )}
      </span>
    );
  },
);

export const PaginationStatus = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function PaginationStatus({ className, ...props }, ref) {
    return (
      <span
        {...props}
        className={cn(styles.status, className)}
        data-slot="pagination-status"
        ref={ref}
      />
    );
  },
);

export const CursorPagination = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CursorPagination({ className, ...props }, ref) {
    return (
      <div
        {...props}
        className={cn(styles.cursor, className)}
        data-slot="cursor-pagination"
        ref={ref}
      />
    );
  },
);

export const CursorPaginationMessage = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function CursorPaginationMessage({ className, ...props }, ref) {
    return (
      <span
        {...props}
        className={cn(styles.cursorMessage, className)}
        data-slot="cursor-pagination-message"
        ref={ref}
      />
    );
  },
);

export type CursorPaginationActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  children?: ReactNode;
};

export const CursorPaginationAction = forwardRef<HTMLButtonElement, CursorPaginationActionProps>(
  function CursorPaginationAction(
    {
      'aria-disabled': ariaDisabled,
      asChild = false,
      children,
      className,
      disabled = false,
      onClick,
      tabIndex,
      type = 'button',
      ...props
    },
    ref,
  ) {
    const state = { ariaDisabled, disabled };
    if (asChild) {
      const slotted = prepareSlottedPaginationAction(children, state, onClick);
      return (
        <Slot.Root
          {...props}
          aria-disabled={slotted.semantics.ariaDisabled ?? ariaDisabled}
          className={cn(styles.cursorAction, className)}
          data-slot="cursor-pagination-action"
          onClick={slotted.handleClick}
          ref={ref}
          tabIndex={slotted.semantics.tabIndex ?? tabIndex}
        >
          {slotted.slottedChild}
        </Slot.Root>
      );
    }

    const isDisabled = isPaginationActionDisabled(state);
    const semantics = paginationActionSemantics(isDisabled, true);
    return (
      <button
        {...props}
        aria-disabled={semantics.ariaDisabled ?? ariaDisabled}
        className={cn(styles.cursorAction, className)}
        data-slot="cursor-pagination-action"
        disabled={semantics.nativeDisabled}
        onClick={composePaginationActionClick({ disabled: isDisabled, onClick })}
        ref={ref}
        tabIndex={semantics.tabIndex ?? tabIndex}
        type={type}
      >
        {children}
      </button>
    );
  },
);
