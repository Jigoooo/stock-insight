import { forwardRef, type InputHTMLAttributes } from 'react';

import styles from './input.module.css';

export type InputDensity = 'auth' | 'general' | 'search';
export type InputVariant = 'chrome' | 'bare';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  density?: InputDensity;
  variant?: InputVariant;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, density = 'general', type, variant = 'chrome', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      data-density={density}
      data-slot="input-shell"
      data-variant={variant}
      className={classNames(styles.inputShell, styles.input, className)}
      {...props}
    />
  );
});
