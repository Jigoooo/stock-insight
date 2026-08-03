import type { DateRange } from '@daypicker/react';
import { CalendarRange } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { type ReactNode, useState } from 'react';

import { formatDateRangeValue, formatDateValue } from './date-format';
import { type DatePickerVariant } from './date-picker';
import styles from './date-picker.module.css';

import { RangeCalendar, type CalendarVariant } from '@/shared/ui/calendar';

export type DateRangeValue = DateRange;

export type RangePickerProps = {
  calendarVariant?: CalendarVariant;
  defaultValue?: DateRangeValue;
  disabled?: boolean;
  endLabel?: ReactNode;
  invalid?: boolean;
  onValueChange?: (value: DateRangeValue | undefined) => void;
  pending?: boolean;
  placeholder?: string;
  startLabel?: ReactNode;
  value?: DateRangeValue;
  variant?: DatePickerVariant;
};

export function RangePicker({
  calendarVariant = 'compact',
  defaultValue,
  disabled = false,
  endLabel = '종료일',
  invalid = false,
  onValueChange,
  pending = false,
  placeholder = '기간 선택',
  startLabel = '시작일',
  value,
  variant = 'hairline',
}: RangePickerProps) {
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const controlled = value !== undefined;
  const currentValue = controlled ? value : uncontrolledValue;
  const blocked = disabled || pending;

  const handleValueChange = (nextValue: DateRangeValue | undefined) => {
    if (!controlled) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
    if (nextValue?.from && nextValue.to) setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={styles.trigger}
          data-slot="range-picker-trigger"
          data-invalid={invalid || undefined}
          data-variant={variant}
          aria-busy={pending || undefined}
          aria-label={formatDateRangeValue(currentValue, placeholder)}
          disabled={blocked}
        >
          <span className={styles.rangeCopy}>
            <span>
              <small>{startLabel}</small>
              <strong>{formatDateValue(currentValue?.from, placeholder)}</strong>
            </span>
            <span className={styles.separator} aria-hidden="true">
              —
            </span>
            <span>
              <small>{endLabel}</small>
              <strong>{formatDateValue(currentValue?.to, '종료일 선택')}</strong>
            </span>
          </span>
          <CalendarRange aria-hidden="true" className={styles.icon} size={15} strokeWidth={1.8} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className={styles.content}
          data-slot="range-picker-content"
          role="dialog"
          aria-label="기간 선택"
          align="start"
          collisionPadding={12}
          sideOffset={8}
        >
          <RangeCalendar
            defaultMonth={currentValue?.from}
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
