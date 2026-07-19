import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import styles from './button.module.css';
import type { MotionRecipe } from '../motion/motion-contract';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';
type ButtonMotionRecipe = Extract<MotionRecipe, 'pressable' | 'quiet' | 'none'>;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  motion?: ButtonMotionRecipe;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
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
    motion = 'pressable',
    size = 'md',
    type = 'button',
    variant = 'secondary',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={classNames(styles.button, className)}
      data-size={size}
      data-variant={variant}
      type={type}
      {...props}
      data-motion={motion}
    >
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, motion = 'pressable', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={classNames(styles.iconButton, className)}
      type={type}
      {...props}
      data-motion={motion}
    >
      {children}
    </button>
  );
});
