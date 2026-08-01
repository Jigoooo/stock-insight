'use client';

import { forwardRef, type HTMLAttributes, type InputHTMLAttributes } from 'react';

import type { InputDensity } from './input';
import styles from './input.module.css';

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export type InputGroupProps = HTMLAttributes<HTMLDivElement> & {
  density?: InputDensity;
  disabled?: boolean;
  invalid?: boolean;
};

export function InputGroup({
  className,
  density = 'general',
  disabled = false,
  invalid = false,
  ...props
}: InputGroupProps) {
  return (
    <div
      aria-disabled={disabled || undefined}
      data-density={density}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      data-slot="input-group"
      role="group"
      className={classNames(styles.inputShell, styles.inputGroup, className)}
      {...props}
    />
  );
}

export type InputGroupAddonProps = HTMLAttributes<HTMLDivElement> & {
  align?: 'inline-start' | 'inline-end' | 'block-start' | 'block-end';
};

export function InputGroupAddon({
  align = 'inline-start',
  className,
  ...props
}: InputGroupAddonProps) {
  return (
    <div
      role="group"
      data-align={align}
      data-slot="input-group-addon"
      className={classNames(styles.addon, className)}
      {...props}
    />
  );
}

export const InputGroupInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function InputGroupInput({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input-group-control"
        className={classNames(styles.groupControl, className)}
        {...props}
      />
    );
  },
);
