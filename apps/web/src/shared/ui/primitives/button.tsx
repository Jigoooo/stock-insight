import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  children,
  className,
  size = 'md',
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(styles.button, className)}
      data-size={size}
      data-variant={variant}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button className={classNames(styles.iconButton, className)} type={type} {...props}>
      {children}
    </button>
  );
}
