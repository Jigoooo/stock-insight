'use client';

import { useReducedMotion } from 'motion/react';
import { Slot } from 'radix-ui';
import {
  createContext,
  useContext,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type Ref,
} from 'react';

import styles from './side-list.module.css';

import { cn } from '@/shared/lib/utils';
import { Highlight, HighlightItem } from '@/shared/ui/animate-ui/primitives/effects/highlight';

export type SideListVariant = 'quiet-rows' | 'soft-surface' | 'compact-rail';

type SideListContextValue = {
  value: string;
};

const SideListContext = createContext<SideListContextValue | null>(null);

export type SideListProps = Omit<React.ComponentProps<'nav'>, 'children'> & {
  children: React.ReactNode;
  value: string;
  variant?: SideListVariant;
};

export function SideList({
  children,
  className,
  value,
  variant = 'quiet-rows',
  ...props
}: SideListProps) {
  const reducedMotion = useReducedMotion();

  return (
    <SideListContext value={{ value }}>
      <nav {...props} className={cn(styles.root, className)} data-variant={variant}>
        <Highlight
          click={false}
          containerClassName={styles.items}
          controlledItems
          mode="parent"
          transition={
            reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }
          }
          value={value}
        >
          {children}
        </Highlight>
      </nav>
    </SideListContext>
  );
}

export type SideListItemProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  children: ReactElement;
  disabled?: boolean;
  pending?: boolean;
  ref?: Ref<HTMLElement>;
  static?: boolean;
  value: string;
};

export function SideListItem({
  children,
  className,
  disabled = false,
  onClick,
  pending = false,
  ref,
  static: isStatic = false,
  value,
  ...props
}: SideListItemProps) {
  const context = useContext(SideListContext);
  if (!context) throw new Error('SideListItem must be used within SideList');

  const unavailable = disabled || isStatic;
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (unavailable) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <HighlightItem asChild ref={ref as Ref<HTMLDivElement>} value={value}>
      <Slot.Root
        {...props}
        aria-busy={pending || props['aria-busy']}
        aria-current={context.value === value ? 'page' : undefined}
        aria-disabled={unavailable || props['aria-disabled']}
        className={cn(styles.item, className)}
        data-pending={pending || undefined}
        data-static={isStatic || undefined}
        onClick={handleClick}
      >
        {children}
      </Slot.Root>
    </HighlightItem>
  );
}
