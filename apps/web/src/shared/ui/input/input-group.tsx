'use client';

import { forwardRef, type HTMLAttributes, type InputHTMLAttributes } from 'react';

import styles from './input.module.css';
import type { InputDensity } from './input';

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export type InputGroupProps = HTMLAttributes<HTMLDivElement> & {
  density?: InputDensity;
};

export function InputGroup({ className, density = 'general', ...props }: InputGroupProps) {
  return (
    <div
      data-density={density}
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
  onClick,
  ...props
}: InputGroupAddonProps) {
  return (
    <div
      role="group"
      data-align={align}
      data-slot="input-group-addon"
      className={classNames(styles.addon, className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || (event.target as HTMLElement).closest('button')) return;
        event.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
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
