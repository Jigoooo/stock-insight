import { CalendarDays } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { type ReactNode, useState } from 'react';

import { formatDateValue } from './date-format';
import styles from './date-picker.module.css';

import { Calendar, type CalendarVariant } from '@/shared/ui/calendar';

export type DatePickerVariant = 'hairline' | 'inset' | 'rail';

export type DatePickerProps = {
  calendarVariant?: CalendarVariant;
  defaultValue?: Date;
  disabled?: boolean;
  invalid?: boolean;
  label?: ReactNode;
  onValueChange?: (value: Date | undefined) => void;
  pending?: boolean;
  placeholder?: string;
  value?: Date;
  variant?: DatePickerVariant;
};

export function DatePicker({
  calendarVariant = 'compact',
  defaultValue,
  disabled = false,
  invalid = false,
  label = '기준일',
  onValueChange,
  pending = false,
  placeholder = '날짜 선택',
  value,
  variant = 'hairline',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const controlled = value !== undefined;
  const currentValue = controlled ? value : uncontrolledValue;
  const blocked = disabled || pending;

  const handleValueChange = (nextValue: Date | undefined) => {
    if (!controlled) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
    if (nextValue) setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={styles.trigger}
          data-slot="date-picker-trigger"
          data-invalid={invalid || undefined}
          data-variant={variant}
          aria-busy={pending || undefined}
          disabled={blocked}
        >
          <span className={styles.copy}>
            <small>{label}</small>
            <strong>{formatDateValue(currentValue, placeholder)}</strong>
          </span>
          <CalendarDays aria-hidden="true" className={styles.icon} size={15} strokeWidth={1.8} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className={styles.content}
          data-slot="date-picker-content"
          role="dialog"
          aria-label="날짜 선택"
          align="start"
          collisionPadding={12}
          sideOffset={8}
        >
          <Calendar
            defaultMonth={currentValue}
            onValueChange={handleValueChange}
            pending={pending}
            surface="embedded"
            value={currentValue}
            variant={calendarVariant}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
