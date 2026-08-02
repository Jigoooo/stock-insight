import {
  CaptionLabel,
  type CaptionLabelProps,
  DayButton,
  type DayButtonProps,
  DayPicker,
  type DateRange,
  MonthGrid,
  type MonthGridProps,
  NextMonthButton,
  type NextMonthButtonProps,
  type PropsBase,
  PreviousMonthButton,
  type PreviousMonthButtonProps,
  type Matcher,
} from '@daypicker/react';
import { ko } from '@daypicker/react/locale';
import { useState } from 'react';

import styles from './calendar.module.css';

import { cn } from '@/shared/lib/utils';

export type CalendarVariant = 'compact' | 'soft-inset' | 'ledger';
export type CalendarSurface = 'standalone' | 'embedded';

type CalendarBaseProps = Omit<
  PropsBase,
  'className' | 'classNames' | 'components' | 'locale' | 'mode' | 'required' | 'selected'
> & {
  className?: string;
  disabled?: Matcher | Matcher[];
  pending?: boolean;
  surface?: CalendarSurface;
  variant?: CalendarVariant;
};

export type CalendarProps = CalendarBaseProps & {
  defaultValue?: Date;
  onValueChange?: (value: Date | undefined) => void;
  value?: Date;
};

export type RangeCalendarProps = CalendarBaseProps & {
  onValueChange?: (value: DateRange | undefined) => void;
  resetOnSelect?: boolean;
  value?: DateRange;
};

function CalendarCaption(props: CaptionLabelProps) {
  return <CaptionLabel {...props} data-slot="calendar-caption" />;
}

function CalendarGrid(props: MonthGridProps) {
  return <MonthGrid {...props} data-slot="calendar-grid" />;
}

function CalendarDay(props: DayButtonProps) {
  const { modifiers, ...buttonProps } = props;

  return (
    <DayButton
      {...buttonProps}
      modifiers={modifiers}
      data-slot="calendar-day"
      data-selected={modifiers.selected || undefined}
      data-today={modifiers.today || undefined}
      data-outside={modifiers.outside || undefined}
    />
  );
}

function CalendarNext(props: NextMonthButtonProps) {
  return <NextMonthButton {...props} data-slot="calendar-nav-next" />;
}

function CalendarPrevious(props: PreviousMonthButtonProps) {
  return <PreviousMonthButton {...props} data-slot="calendar-nav-previous" />;
}

const calendarComponents = {
  CaptionLabel: CalendarCaption,
  DayButton: CalendarDay,
  MonthGrid: CalendarGrid,
  NextMonthButton: CalendarNext,
  PreviousMonthButton: CalendarPrevious,
};

const calendarClassNames = {
  root: styles.dayPicker,
  months: styles.months,
  month: styles.month,
  month_caption: styles.monthCaption,
  caption_label: styles.captionLabel,
  nav: styles.nav,
  button_previous: styles.navButton,
  button_next: styles.navButton,
  chevron: styles.chevron,
  month_grid: styles.monthGrid,
  weekdays: styles.weekdays,
  weekday: styles.weekday,
  weeks: styles.weeks,
  week: styles.week,
  day: styles.day,
  day_button: styles.dayButton,
  selected: styles.selected,
  today: styles.today,
  outside: styles.outside,
  disabled: styles.disabled,
  range_start: styles.rangeStart,
  range_middle: styles.rangeMiddle,
  range_end: styles.rangeEnd,
};

export function Calendar({
  className,
  defaultValue,
  disableNavigation,
  disabled,
  onValueChange,
  pending = false,
  surface = 'standalone',
  value,
  variant = 'compact',
  ...props
}: CalendarProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const controlled = value !== undefined;
  const currentValue = controlled ? value : uncontrolledValue;

  const handleSelect = (nextValue: Date | undefined) => {
    if (!controlled) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <div
      className={cn(styles.root, className)}
      data-slot="calendar"
      data-surface={surface}
      data-variant={variant}
      aria-busy={pending || undefined}
    >
      <DayPicker
        {...props}
        classNames={calendarClassNames}
        components={calendarComponents}
        disableNavigation={pending || disableNavigation}
        disabled={pending ? true : disabled}
        locale={ko}
        mode="single"
        navLayout="around"
        onSelect={handleSelect}
        selected={currentValue}
        showOutsideDays
      />
    </div>
  );
}

export function RangeCalendar({
  className,
  disableNavigation,
  disabled,
  onValueChange,
  pending = false,
  resetOnSelect = true,
  surface = 'standalone',
  value,
  variant = 'compact',
  ...props
}: RangeCalendarProps) {
  return (
    <div
      className={cn(styles.root, className)}
      data-slot="calendar"
      data-surface={surface}
      data-variant={variant}
      aria-busy={pending || undefined}
    >
      <DayPicker
        {...props}
        classNames={calendarClassNames}
        components={calendarComponents}
        disableNavigation={pending || disableNavigation}
        disabled={pending ? true : disabled}
        locale={ko}
        mode="range"
        navLayout="around"
        onSelect={onValueChange}
        resetOnSelect={resetOnSelect}
        selected={value}
        showOutsideDays
      />
    </div>
  );
}
