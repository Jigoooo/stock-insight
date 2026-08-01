import { forwardRef, type InputHTMLAttributes } from 'react';

import styles from './input.module.css';

export type InputDensity = 'auth' | 'general' | 'search';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  density?: InputDensity;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, density = 'general', type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      data-density={density}
      data-slot="input-shell"
      className={classNames(styles.inputShell, styles.input, className)}
      {...props}
    />
  );
});
