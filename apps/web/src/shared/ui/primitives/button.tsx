import { forwardRef, type ReactNode } from 'react';

import styles from './button.module.css';
import { MotionButton, type MotionButtonProps } from '../motion/motion-button';
import type { MotionRecipe } from '../motion/motion-contract';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';
type ButtonMotionRecipe = Extract<MotionRecipe, 'pressable' | 'quiet' | 'none'>;

type ButtonProps = Omit<MotionButtonProps, 'children'> & {
  children?: ReactNode;
  motion?: ButtonMotionRecipe;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

type IconButtonProps = Omit<MotionButtonProps, 'children'> & {
  children: ReactNode;
  motion?: ButtonMotionRecipe;
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
    size = 'md',
    type = 'button',
    variant = 'secondary',
    ...props
  },
  ref,
) {
  const allowsScaleMotion = !disabled && motion === 'pressable';

  return (
    <MotionButton
      ref={ref}
      className={classNames(styles.button, className)}
      data-motion-owner="motion"
      data-slot="button-control"
      data-size={size}
      data-variant={variant}
      disabled={disabled}
      hoverScale={allowsScaleMotion ? undefined : 1}
      tapScale={allowsScaleMotion ? undefined : 1}
      type={type}
      {...props}
      data-motion={motion}
      whileTap={motion === 'quiet' && !disabled ? { opacity: 0.76 } : undefined}
    >
      <span className={styles.buttonLabel} data-slot="button-label">
        {children}
      </span>
    </MotionButton>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, motion = 'pressable', type = 'button', ...props },
  ref,
) {
  const allowsScaleMotion = !props.disabled && motion === 'pressable';

  return (
    <MotionButton
      ref={ref}
      className={classNames(styles.iconButton, className)}
      data-motion-owner="motion"
      data-slot="icon-button-control"
      hoverScale={allowsScaleMotion ? undefined : 1}
      tapScale={allowsScaleMotion ? undefined : 1}
      type={type}
      {...props}
      data-motion={motion}
      whileTap={motion === 'quiet' ? { opacity: 0.76 } : undefined}
    >
      <span className={styles.iconButtonLabel} data-slot="button-label">
        {children}
      </span>
    </MotionButton>
  );
});
