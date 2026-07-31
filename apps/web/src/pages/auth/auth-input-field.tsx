import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import styles from './auth-page.module.css';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shared/ui/input-group';

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

const authInputFocus = 'focus-visible:border-foreground focus-visible:ring-0 transition-none';
const authInputGroupFocus =
  'has-[[data-slot=input-group-control]:focus-visible]:border-foreground has-[[data-slot=input-group-control]:focus-visible]:ring-0 transition-none';

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
    const controlProps = {
      ref,
      className,
      id,
      'aria-describedby': descriptionIds || undefined,
      ...inputProps,
      style: {
        ...inputProps.style,
        transitionDuration: '0s',
      },
    };

    return (
      <Field
        className={styles.field}
        data-invalid={inputProps['aria-invalid'] ? 'true' : 'false'}
        data-disabled={inputProps.disabled ? 'true' : 'false'}
      >
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {endAction ? (
          <InputGroup className={classNames(styles.authControl, authInputGroupFocus)}>
            <InputGroupInput
              {...controlProps}
              className={classNames('transition-none', className)}
            />
            <InputGroupAddon align="inline-end">{endAction}</InputGroupAddon>
          </InputGroup>
        ) : (
          <Input
            {...controlProps}
            className={classNames(styles.authControl, authInputFocus, className)}
          />
        )}
        <div className={styles.fieldFeedback}>
          {hint ? (
            <FieldDescription id={hintId} className={styles.fieldHint}>
              {hint}
            </FieldDescription>
          ) : null}
          {error ? (
            <FieldError id={errorId} className={styles.fieldError} aria-live="polite">
              {error}
            </FieldError>
          ) : null}
        </div>
      </Field>
    );
  },
);
