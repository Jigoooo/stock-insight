import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('shared date controls', () => {
  it('publishes one Calendar behavior contract across the three approved variants', async () => {
    const [source, styles, publicIndex] = await Promise.all([
      read('shared/ui/calendar/calendar.tsx'),
      read('shared/ui/calendar/calendar.module.css'),
      read('shared/ui/index.ts'),
    ]);

    assert.match(source, /type CalendarVariant = 'compact' \| 'soft-inset' \| 'ledger'/);
    assert.match(source, /<DayPicker/);
    assert.match(source, /mode="single"/);
    assert.match(source, /locale=\{ko\}/);
    assert.match(source, /data-slot="calendar"/);
    assert.match(source, /data-slot="calendar-caption"/);
    assert.match(source, /data-slot="calendar-grid"/);
    assert.match(source, /data-slot="calendar-day"/);
    assert.match(source, /aria-busy=\{pending \|\| undefined\}/);
    assert.match(source, /disableNavigation=\{pending \|\| disableNavigation\}/);
    assert.match(source, /value !== undefined/);
    assert.match(source, /setUncontrolledValue\(nextValue\)/);
    assert.match(styles, /@media \(max-width: 480px\)/);
    assert.match(styles, /min-width: 44px/);
    assert.match(styles, /min-height: 44px/);
    assert.match(publicIndex, /export \* from '\.\/calendar'/);
    assert.match(source, /export function RangeCalendar/);
  });

  it('publishes readable single and range pickers with a shared popover contract', async () => {
    const [datePicker, rangePicker, styles, publicIndex] = await Promise.all([
      read('shared/ui/date-picker/date-picker.tsx'),
      read('shared/ui/date-picker/range-picker.tsx'),
      read('shared/ui/date-picker/date-picker.module.css'),
      read('shared/ui/index.ts'),
    ]);

    assert.match(datePicker, /type DatePickerVariant = 'hairline' \| 'inset' \| 'rail'/);
    assert.match(datePicker, /PopoverPrimitive\.Root/);
    assert.match(datePicker, /data-slot="date-picker-trigger"/);
    assert.match(datePicker, /data-invalid=\{invalid \|\| undefined\}/);
    assert.doesNotMatch(datePicker, /aria-invalid=/);
    assert.match(datePicker, /data-slot="date-picker-content"/);
    assert.match(datePicker, /formatDateValue\(currentValue, placeholder\)/);
    assert.match(datePicker, /setOpen\(false\)/);
    assert.match(rangePicker, /type DateRangeValue/);
    assert.match(rangePicker, /<RangeCalendar/);
    assert.match(rangePicker, /data-slot="range-picker-trigger"/);
    assert.match(rangePicker, /data-invalid=\{invalid \|\| undefined\}/);
    assert.doesNotMatch(rangePicker, /aria-invalid=/);
    assert.match(rangePicker, /data-slot="range-picker-content"/);
    assert.match(rangePicker, /formatDateRangeValue\(currentValue, placeholder\)/);
    assert.match(rangePicker, /nextValue\?\.from && nextValue\.to/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(publicIndex, /export \* from '\.\/date-picker'/);
  });
});
