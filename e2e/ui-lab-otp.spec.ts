import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function openOtp(page: Page) {
  await page.goto('/__ui-lab');
  const categoryButton = page.getByRole('button', { name: 'OTP', exact: true });

  await expect(async () => {
    await categoryButton.click({ timeout: 1_000 });
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
}

async function otpCard(page: Page, direction: 'hairline' | 'inset' | 'rail') {
  await openOtp(page);
  return page.locator(`article[data-direction="${direction}"]`);
}

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'OTP cell should have a bounding box').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.describe('UI Lab OTP', () => {
  test('shows all three approved variants through the shared OTP control', async ({ page }) => {
    await openOtp(page);
    const comparison = page.locator('section[aria-labelledby="input-action-title"]');

    for (const direction of ['hairline', 'inset', 'rail'] as const) {
      const card = comparison.locator(`article[data-direction="${direction}"]`);
      await expect(card).toHaveCount(1);
      await expect(card.locator('[data-slot="otp"]')).toHaveAttribute('data-variant', direction);
      await expect(card.locator('[data-slot="otp-input"]')).toHaveCount(6);
    }
  });

  test('distributes pasted digits, advances focus, and supports backspace navigation', async ({
    page,
  }) => {
    const card = await otpCard(page, 'hairline');
    const inputs = card.locator('[data-slot="otp-input"]');

    await inputs.first().focus();
    await inputs.first().evaluate((element) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', '92 34-56');
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
      );
    });

    await expect(inputs.nth(0)).toHaveValue('9');
    await expect(inputs.nth(1)).toHaveValue('2');
    await expect(inputs.nth(2)).toHaveValue('3');
    await expect(inputs.nth(3)).toHaveValue('4');
    await expect(inputs.nth(4)).toHaveValue('5');
    await expect(inputs.nth(5)).toHaveValue('6');
    await expect(inputs.nth(5)).toBeFocused();
    await expect(card.getByText('코드 입력 완료')).toBeVisible();

    await inputs.nth(5).press('Backspace');
    await expect(inputs.nth(5)).toHaveValue('');
    await expect(inputs.nth(5)).toBeFocused();

    await inputs.nth(5).press('Backspace');
    await expect(inputs.nth(4)).toHaveValue('');
    await expect(inputs.nth(4)).toBeFocused();

    await inputs.nth(4).press('7');
    await expect(inputs.nth(4)).toHaveValue('7');
    await expect(inputs.nth(5)).toBeFocused();
  });

  test('keeps the rail focus treatment on the underline without a ring', async ({ page }) => {
    const card = await otpCard(page, 'rail');
    const input = card.locator('[data-slot="otp-input"]').nth(2);

    await input.focus();
    const focusStyle = await input.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderBottomColor: style.borderBottomColor,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
      };
    });

    expect(focusStyle.borderTopWidth).toBe('0px');
    expect(focusStyle.borderBottomColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(focusStyle.boxShadow).toBe('none');
    expect(focusStyle.outlineStyle).toBe('none');
  });

  test('keeps mobile OTP cells tappable without horizontal overflow', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only touch contract');
    await page.setViewportSize({ width: 390, height: 844 });
    await openOtp(page);

    for (const direction of ['hairline', 'inset', 'rail'] as const) {
      const card = page.locator(`article[data-direction="${direction}"]`);
      await expectMinimumHitArea(card.locator('[data-slot="otp-input"]').first());
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('removes transform motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const card = await otpCard(page, 'inset');
    const input = card.locator('[data-slot="otp-input"]').nth(2);

    await input.focus();
    await input.press('8');

    await expect
      .poll(() => input.evaluate((element) => getComputedStyle(element).transform))
      .toBe('none');
    await expect
      .poll(() =>
        input.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).transitionDuration),
        ),
      )
      .toBeLessThanOrEqual(0.001);
  });

  test('has no automatic accessibility violations', async ({ page }) => {
    await openOtp(page);
    await page.waitForTimeout(250);

    const results = await new AxeBuilder({ page })
      .include('section[aria-labelledby="input-action-title"]')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
