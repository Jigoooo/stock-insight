import {
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type FieldsetHTMLAttributes,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import styles from './otp.module.css';

import { cn } from '@/shared/lib/utils';

export type OTPVariant = 'hairline' | 'inset' | 'rail';

export type OTPProps = Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  'defaultValue' | 'onChange'
> & {
  completeText?: ReactNode;
  defaultValue?: string;
  description?: ReactNode;
  disabled?: boolean;
  inputLabel?: (position: number) => string;
  invalid?: boolean;
  label?: ReactNode;
  length?: number;
  meta?: ReactNode;
  name?: string;
  onComplete?: (value: string) => void;
  onValueChange?: (value: string) => void;
  pending?: boolean;
  required?: boolean;
  value?: string;
  variant?: OTPVariant;
};

const DEFAULT_LENGTH = 6;
const MAX_LENGTH = 12;

function clampLength(length: number) {
  if (!Number.isFinite(length)) return DEFAULT_LENGTH;
  return Math.min(MAX_LENGTH, Math.max(1, Math.floor(length)));
}

function digitsFromValue(value: string, length: number) {
  return value.replace(/\D/g, '').slice(0, length).split('');
}

function cellsFromValue(value: string, length: number) {
  const digits = digitsFromValue(value, length);
  return Array.from({ length }, (_, index) => digits[index] ?? '');
}

export function OTP({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  completeText,
  defaultValue = '',
  description,
  disabled = false,
  inputLabel = (position) => `OTP ${position}번째 자리`,
  invalid = false,
  label,
  length: requestedLength = DEFAULT_LENGTH,
  meta,
  name,
  onComplete,
  onValueChange,
  pending = false,
  required = false,
  style,
  value,
  variant = 'hairline',
  ...props
}: OTPProps): ReactElement {
  const length = clampLength(requestedLength);
  const componentId = useId();
  const labelId = `${componentId}-label`;
  const statusId = `${componentId}-status`;
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [uncontrolledCells, setUncontrolledCells] = useState(() =>
    cellsFromValue(defaultValue, length),
  );
  const controlled = value !== undefined;
  const currentCells = controlled
    ? cellsFromValue(value, length)
    : Array.from({ length }, (_, index) => uncontrolledCells[index] ?? '');
  const complete = currentCells.every(Boolean);
  const blocked = disabled || pending;
  const status = complete ? completeText : description;
  const positionKeys = Array.from({ length }, (_, index) => `${componentId}-position-${index + 1}`);

  const focusCell = (index: number) => {
    inputRefs.current[Math.min(length - 1, Math.max(0, index))]?.focus();
  };

  const commitCells = (nextCells: readonly string[]) => {
    const normalized = Array.from({ length }, (_, index) => nextCells[index] ?? '');
    if (!controlled) setUncontrolledCells(normalized);
    const nextValue = normalized.join('');
    onValueChange?.(nextValue);
    if (normalized.every(Boolean)) onComplete?.(nextValue);
  };

  const insertDigits = (index: number, rawValue: string) => {
    const incoming = digitsFromValue(rawValue, length - index);
    if (incoming.length === 0) return;

    const nextCells = [...currentCells];
    incoming.forEach((digit, offset) => {
      nextCells[index + offset] = digit;
    });
    commitCells(nextCells);
    focusCell(Math.min(index + incoming.length, length - 1));
  };

  const handleInput = (index: number, event: FormEvent<HTMLInputElement>) => {
    const digit = digitsFromValue(event.currentTarget.value, 1).at(-1) ?? '';
    if (!digit) {
      const nextCells = [...currentCells];
      nextCells[index] = '';
      commitCells(nextCells);
      return;
    }

    const nextCells = [...currentCells];
    nextCells[index] = digit;
    commitCells(nextCells);
    if (index < length - 1) focusCell(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const nextCells = [...currentCells];
      if (nextCells[index]) {
        nextCells[index] = '';
        commitCells(nextCells);
        return;
      }
      if (index > 0) {
        nextCells[index - 1] = '';
        commitCells(nextCells);
        focusCell(index - 1);
      }
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      const nextCells = [...currentCells];
      nextCells[index] = '';
      commitCells(nextCells);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusCell(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusCell(index + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusCell(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusCell(length - 1);
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    insertDigits(index, event.clipboardData.getData('text'));
  };

  return (
    <fieldset
      {...props}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (label ? labelId : undefined)}
      className={cn(styles.root, className)}
      data-complete={complete || undefined}
      data-disabled={blocked || undefined}
      data-invalid={invalid || undefined}
      data-slot="otp"
      data-variant={variant}
      style={{ ...style, '--otp-length': length } as CSSProperties}
    >
      {label || meta ? (
        <div className={styles.header} data-slot="otp-header">
          {label ? (
            <span className={styles.label} id={labelId} data-slot="control-label">
              {label}
            </span>
          ) : null}
          {meta ? <span className={styles.meta}>{meta}</span> : null}
        </div>
      ) : null}

      <div className={styles.cells} data-slot="otp-cells">
        {currentCells.map((digit, index) => (
          <input
            key={positionKeys[index]}
            ref={(node) => {
              inputRefs.current[index] = node;
            }}
            aria-describedby={status ? statusId : undefined}
            aria-invalid={invalid || undefined}
            aria-label={inputLabel(index + 1)}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            className={styles.input}
            data-filled={Boolean(digit) || undefined}
            data-slot="otp-input"
            disabled={blocked}
            inputMode="numeric"
            maxLength={1}
            pattern="[0-9]*"
            required={required}
            type="text"
            value={digit}
            onChange={(event) => handleInput(index, event)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
          />
        ))}
      </div>

      {name ? <input name={name} type="hidden" value={currentCells.join('')} /> : null}
      {status ? (
        <p className={styles.status} id={statusId} aria-live="polite">
          {status}
        </p>
      ) : null}
    </fieldset>
  );
}
