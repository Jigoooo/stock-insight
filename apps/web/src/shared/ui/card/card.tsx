import type { HTMLAttributes, ReactNode } from 'react';

import styles from './card.module.css';

import { cn } from '@/shared/lib/utils';

export type CardVariant = 'panel' | 'quiet' | 'editorial' | 'selectable';

export type CardProps = Omit<HTMLAttributes<HTMLElement>, 'onChange'> & {
  onSelectedChange?: (selected: boolean) => void;
  selected?: boolean;
  variant?: CardVariant;
};

export function Card({
  children,
  className,
  onClick,
  onSelectedChange,
  selected = false,
  variant = 'panel',
  ...props
}: CardProps) {
  const selectable = variant === 'selectable';
  const Component = selectable ? 'button' : 'div';

  return (
    <Component
      {...props}
      aria-pressed={selectable ? selected : undefined}
      className={cn(styles.card, className)}
      data-selected={selectable ? selected : undefined}
      data-slot="card"
      data-variant={variant}
      type={selectable ? 'button' : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (selectable && !event.defaultPrevented) onSelectedChange?.(!selected);
      }}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" className={cn(styles.header, className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-title" className={cn(styles.title, className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="card-description" className={cn(styles.description, className)} {...props} />
  );
}

export function CardAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-action" className={cn(styles.action, className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn(styles.content, className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-footer" className={cn(styles.footer, className)} {...props} />;
}

export type CardContentSlot = ReactNode;
