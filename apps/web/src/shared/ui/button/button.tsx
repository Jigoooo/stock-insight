'use client';

import { LoaderCircle } from 'lucide-react';
import type { HTMLMotionProps } from 'motion/react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import styles from './button.module.css';
import { Button as ButtonPrimitive } from '@/shared/ui/animate-ui/primitives/buttons/button';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
export type ButtonMotion = 'pressable' | 'quiet' | 'none';

type ButtonMotionProps = Pick<HTMLMotionProps<'button'>, 'transition' | 'whileHover' | 'whileTap'>;

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> &
  ButtonMotionProps & {
  asChild?: boolean;
  children?: ReactNode;
  hoverScale?: number;
  motion?: ButtonMotion;
  pending?: boolean;
  pendingLabel?: ReactNode;
  size?: ButtonSize;
  tapScale?: number;
  variant?: ButtonVariant;
  };

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    asChild = false,
    children,
    className,
    disabled,
    hoverScale = 1,
    motion = 'pressable',
    pending = false,
    pendingLabel,
    size = 'md',
    tapScale = 1,
    type = 'button',
    variant = 'secondary',
    ...props
  },
  ref,
) {
  const unavailable = Boolean(disabled || pending);
  const pendingAccessibleLabel =
    pending && props['aria-label'] === undefined && typeof children === 'string'
      ? children
      : props['aria-label'];

  if (asChild) {
    return (
      <ButtonPrimitive
        {...props}
        asChild
        className={classNames(styles.button, className)}
        data-motion={motion}
        data-size={size}
        data-variant={variant}
        hoverScale={hoverScale}
        ref={ref}
        tapScale={tapScale}
      >
        {children as ReactElement}
      </ButtonPrimitive>
    );
  }

  return (
    <ButtonPrimitive
      {...props}
      aria-label={pendingAccessibleLabel}
      aria-busy={pending || props['aria-busy']}
      aria-disabled={unavailable || props['aria-disabled']}
      className={classNames(styles.button, className)}
      data-motion={motion}
      data-pending={pending || undefined}
      data-size={size}
      data-slot="button-control"
      data-variant={variant}
      disabled={unavailable}
      hoverScale={hoverScale}
      ref={ref}
      tapScale={tapScale}
      type={type}
    >
      <span className={styles.content} data-pending={pending || undefined} data-slot="button-content">
        <span className={styles.label} data-slot="button-label" aria-hidden={pending}>
          {children}
        </span>
        <span className={styles.pending} data-slot="button-pending" aria-hidden={!pending}>
          <LoaderCircle className={styles.spinner} data-slot="button-spinner" aria-hidden="true" />
          <span>{pendingLabel ?? '처리 중'}</span>
        </span>
      </span>
    </ButtonPrimitive>
  );
});

export type IconButtonProps = Omit<ButtonProps, 'pendingLabel' | 'size'> & {
  'aria-label': string;
};

export function IconButton(props: IconButtonProps) {
  return <Button {...props} size="icon" />;
}
