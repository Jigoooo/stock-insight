import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

import styles from './primitives.module.css';

type FieldProps = {
  children: ReactNode;
  label?: string;
  hint?: string;
};

type InputVariant = 'chrome' | 'bare';

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: InputVariant;
};

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: InputVariant;
};

type SearchFieldProps = {
  icon: ReactNode;
  inputProps: InputHTMLAttributes<HTMLInputElement> & {
    'aria-label': string;
    'data-testid'?: string;
  };
  className?: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function Field({ children, hint, label }: FieldProps) {
  return (
    <label className={styles.field}>
      {label ? <span className={styles.fieldLabel}>{label}</span> : null}
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className, variant = 'chrome', ...props }: TextInputProps) {
  return (
    <input
      className={classNames(styles.textInput, className)}
      data-variant={variant === 'bare' ? 'bare' : 'chrome'}
      {...props}
    />
  );
}

export function Textarea({ className, variant = 'chrome', ...props }: TextareaProps) {
  return (
    <textarea
      className={classNames(styles.textarea, className)}
      data-variant={variant === 'bare' ? 'bare' : 'chrome'}
      {...props}
    />
  );
}

export function SearchField({ className, icon, inputProps }: SearchFieldProps) {
  return (
    <label className={classNames(styles.searchField, className)}>
      {icon}
      <TextInput variant="bare" {...inputProps} />
    </label>
  );
}
