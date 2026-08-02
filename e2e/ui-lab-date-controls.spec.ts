import { expect, test, type Locator, type Page } from '@playwright/test';

const catalogDirections = ['hairline', 'inset', 'rail'] as const;
const calendarVariants = ['compact', 'soft-inset', 'ledger'] as const;

async function openCategory(page: Page, name: 'Calendar' | 'DatePicker · RangePicker') {
  await page.goto('/__ui-lab');
  const categoryButton = page.getByRole('button', { name, exact: true });

  await expect(async () => {
    await categoryButton.click({ timeout: 1_000 });
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
}

function card(page: Page, direction: (typeof catalogDirections)[number]): Locator {
  return page
    .locator('section[aria-labelledby="input-action-title"]')
    .locator(`article[data-direction="${direction}"]`);
}

function dayButton(calendar: Locator, day: number) {
  return calendar
    .getByRole('button')
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first();
}

test.describe('UI Lab Calendar', () => {
  test('uses the approved public variants and changes month and selected day', async ({ page }) => {
    await openCategory(page, 'Calendar');

    for (let index = 0; index < catalogDirections.length; index += 1) {
      const calendar = card(page, catalogDirections[index]).locator('[data-slot="calendar"]');
      await expect(calendar).toHaveAttribute('data-variant', calendarVariants[index]);
      await expect(calendar.locator('[data-slot="calendar-caption"]')).toContainText('2026년 8월');

      const targetDay = dayButton(calendar, 14);
      await targetDay.click();
      await expect(targetDay).toHaveAttribute('data-selected', 'true');

      await calendar.locator('[data-slot="calendar-nav-next"]').click();
      await expect(calendar.locator('[data-slot="calendar-caption"]')).toContainText('2026년 9월');
    }
  });

  test('keeps keyboard selection available and mobile day targets tappable', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'Calendar');
    const calendar = card(page, 'hairline').locator('[data-slot="calendar"]');
    const selectedDay = dayButton(calendar, 12);

    await selectedDay.focus();
    await selectedDay.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(dayButton(calendar, 13)).toHaveAttribute('data-selected', 'true');

    if (testInfo.project.name === 'mobile') {
      const box = await dayButton(calendar, 13).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

test.describe('UI Lab DatePicker and RangePicker', () => {
  test('shows readable values and updates a single date through the popover', async ({ page }) => {
    await openCategory(page, 'DatePicker · RangePicker');

    for (const direction of catalogDirections) {
      const surface = card(page, direction);
      const trigger = surface.locator('[data-slot="date-picker-trigger"]');
      await expect(trigger).toContainText('2026');
      await expect(trigger).toContainText('8');

      await trigger.click();
      const content = page.locator('[data-slot="date-picker-content"]');
      await expect(content).toBeVisible();
      await dayButton(content, 12).click();
      await expect(content).toBeHidden();
      await expect(trigger).toContainText('12');
      await expect(trigger).toBeFocused();
    }
  });

  test('keeps a range open after the first date and closes after the second', async ({ page }) => {
    await openCategory(page, 'DatePicker · RangePicker');
    const surface = card(page, 'inset');
    const trigger = surface.locator('[data-slot="range-picker-trigger"]');

    await expect(trigger).toContainText('2026');
    await trigger.click();
    const content = page.locator('[data-slot="range-picker-content"]');
    await dayButton(content, 5).click();
    await expect(content).toBeVisible();
    await dayButton(content, 16).click();
    await expect(content).toBeHidden();
    await expect(trigger).toContainText('5');
    await expect(trigger).toContainText('16');
    await expect(trigger).toBeFocused();
  });

  test('exposes all surface variants with compact desktop and mobile hit targets', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'DatePicker · RangePicker');

    for (const direction of catalogDirections) {
      const surface = card(page, direction);
      for (const slot of ['date-picker-trigger', 'range-picker-trigger']) {
        const trigger = surface.locator(`[data-slot="${slot}"]`);
        await expect(trigger).toHaveAttribute('data-variant', direction);
        const box = await trigger.boundingBox();
        expect(box).not.toBeNull();
        if (testInfo.project.name === 'mobile') {
          expect(box!.height).toBeGreaterThanOrEqual(44);
        } else {
          expect(box!.height).toBeLessThanOrEqual(58);
        }
      }
    }
  });

  test('keeps one subtle focus treatment and removes popover motion when requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCategory(page, 'DatePicker · RangePicker');

    const trigger = card(page, 'hairline').locator('[data-slot="date-picker-trigger"]');
    await trigger.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();

    const focusStyle = await trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineOffset: style.outlineOffset,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focusStyle).toEqual({
      outlineOffset: '2px',
      outlineStyle: 'solid',
      outlineWidth: '1px',
    });

    await trigger.click();
    const content = page.locator('[data-slot="date-picker-content"]');
    await expect(content).toBeVisible();
    await expect(content).toHaveCSS('animation-name', 'none');
  });
});
