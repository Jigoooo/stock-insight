import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import styles from './button.module.css';
import { bridgeNativeMotionEvents } from './native-motion-events';
import { MotionButton } from '../motion/motion-button';
import type { MotionRecipe } from '../motion/motion-contract';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';
type ButtonMotionRecipe = Extract<MotionRecipe, 'pressable' | 'quiet' | 'none'>;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  motion?: ButtonMotionRecipe;
  pending?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  motion?: ButtonMotionRecipe;
  pending?: boolean;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    motion = 'pressable',
    pending = false,
    size = 'md',
    type = 'button',
    variant = 'secondary',
    ...props
  },
  ref,
) {
  const unavailable = disabled || pending;
  const { motionSafeProps, nativeCaptureProps } = bridgeNativeMotionEvents(props);

  return (
    <MotionButton
      ref={ref}
      {...motionSafeProps}
      {...nativeCaptureProps}
      aria-busy={pending || props['aria-busy']}
      aria-disabled={pending || props['aria-disabled']}
      className={classNames(styles.button, className)}
      data-motion={motion}
      data-slot="button-control"
      data-size={size}
      data-variant={variant}
      disabled={unavailable}
      hoverScale={motion === 'pressable' ? undefined : 1}
      tapScale={motion === 'pressable' ? undefined : 1}
      type={type}
      whileTap={motion === 'quiet' ? { opacity: 0.76 } : undefined}
    >
      <span className={styles.buttonLabel} data-slot="button-label">
        {children}
      </span>
    </MotionButton>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    children,
    className,
    disabled,
    motion = 'pressable',
    pending = false,
    type = 'button',
    ...props
  },
  ref,
) {
  const unavailable = disabled || pending;
  const { motionSafeProps, nativeCaptureProps } = bridgeNativeMotionEvents(props);

  return (
    <MotionButton
      ref={ref}
      {...motionSafeProps}
      {...nativeCaptureProps}
      aria-busy={pending || props['aria-busy']}
      aria-disabled={pending || props['aria-disabled']}
      className={classNames(styles.iconButton, className)}
      data-motion={motion}
      data-slot="icon-button-control"
      disabled={unavailable}
      hoverScale={motion === 'pressable' ? undefined : 1}
      tapScale={motion === 'pressable' ? undefined : 1}
      type={type}
      whileTap={motion === 'quiet' ? { opacity: 0.76 } : undefined}
    >
      <span className={styles.iconButtonLabel} data-slot="button-label">
        {children}
      </span>
    </MotionButton>
  );
});
