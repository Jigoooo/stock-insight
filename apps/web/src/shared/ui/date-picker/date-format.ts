import type { DateRange } from '@daypicker/react';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateValue(value: Date | undefined, placeholder = '날짜 선택') {
  return value ? dateFormatter.format(value) : placeholder;
}

export function formatDateRangeValue(value: DateRange | undefined, placeholder = '기간 선택') {
  if (!value?.from) return placeholder;
  if (!value.to) return `${formatDateValue(value.from)} — 종료일 선택`;
  return `${formatDateValue(value.from)} — ${formatDateValue(value.to)}`;
}
