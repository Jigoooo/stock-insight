import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import styles from './auth-page.module.css';

type AuthInputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  endAction?: ReactNode;
  error?: string;
  errorId: string;
  hint?: string;
  hintId?: string;
  label: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export const AuthInputField = forwardRef<HTMLInputElement, AuthInputFieldProps>(
  function AuthInputField(
    {
      'aria-describedby': describedBy,
      className,
      endAction,
      error,
      errorId,
      hint,
      hintId,
      id,
      label,
      ...inputProps
    },
    ref,
  ) {
    const descriptionIds = [describedBy, hint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={styles.field}>
        <label htmlFor={id}>{label}</label>
        <div
          className={classNames(
            styles.inputShell,
            Boolean(endAction) && styles.inputShellWithAction,
          )}
          data-invalid={inputProps['aria-invalid'] ? 'true' : 'false'}
          data-motion="field-shell"
        >
          <input
            ref={ref}
            className={classNames(styles.authInput, className)}
            id={id}
            aria-describedby={descriptionIds || undefined}
            {...inputProps}
            data-motion="field"
          />
          {endAction}
        </div>
        {hint ? (
          <p id={hintId} className={styles.fieldHint}>
            {hint}
          </p>
        ) : null}
        <p id={errorId} className={styles.fieldError} aria-live="polite">
          {error ?? ''}
        </p>
      </div>
    );
  },
);
