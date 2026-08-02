'use client';

import { LoaderCircle } from 'lucide-react';
import type { HTMLMotionProps } from 'motion/react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { guardButtonInteraction } from './button-availability';
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
    transition,
    type = 'button',
    variant = 'secondary',
    whileHover,
    whileTap,
    ...props
  },
  ref,
) {
  const ariaDisabled = props['aria-disabled'];
  const nativeDisabled = Boolean(disabled || pending);
  const unavailable = Boolean(nativeDisabled || ariaDisabled === true || ariaDisabled === 'true');
  const pendingAccessibleLabel =
    pending && props['aria-label'] === undefined && typeof children === 'string'
      ? children
      : props['aria-label'];
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (guardButtonInteraction(event)) return;
    props.onClick?.(event);
  };
  const hasComponentMotion =
    !unavailable &&
    (hoverScale !== 1 || tapScale !== 1 || whileHover !== undefined || whileTap !== undefined);
  const componentMotionProps: ButtonMotionProps = hasComponentMotion
    ? {
        ...(transition === undefined ? {} : { transition }),
        ...(whileHover === undefined ? {} : { whileHover }),
        ...(whileTap === undefined ? {} : { whileTap }),
      }
    : {};

  if (asChild) {
    return (
      <ButtonPrimitive
        {...props}
        {...componentMotionProps}
        asChild
        aria-disabled={unavailable || ariaDisabled}
        className={classNames(styles.button, className)}
        data-motion={motion}
        data-pending={pending || undefined}
        data-size={size}
        data-variant={variant}
        hoverScale={unavailable ? 1 : hoverScale}
        onClick={handleClick}
        ref={ref}
        tapScale={unavailable ? 1 : tapScale}
      >
        {children as ReactElement}
      </ButtonPrimitive>
    );
  }

  return (
    <ButtonPrimitive
      {...props}
      {...componentMotionProps}
      aria-label={pendingAccessibleLabel}
      aria-busy={pending || props['aria-busy']}
      aria-disabled={unavailable || props['aria-disabled']}
      className={classNames(styles.button, className)}
      data-motion={motion}
      data-pending={pending || undefined}
      data-size={size}
      data-slot="button-control"
      data-variant={variant}
      disabled={nativeDisabled}
      hoverScale={unavailable ? 1 : hoverScale}
      onClick={handleClick}
      ref={ref}
      tapScale={unavailable ? 1 : tapScale}
      type={type}
    >
      <span
        className={styles.content}
        data-pending={pending || undefined}
        data-slot="button-content"
      >
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
