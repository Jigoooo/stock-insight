import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function openCategory(page: Page, category: 'ButtonGroup' | 'SplitButton') {
  await page.goto('/__ui-lab');
  const categoryButton = page.getByRole('button', { name: category, exact: true });

  await expect(async () => {
    await categoryButton.click({ timeout: 1_000 });
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
}

async function expectMinimumHitArea(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'control should have a bounding box').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.describe('UI Lab action groups', () => {
  test('keeps ButtonGroup to the two approved action-container variants', async ({ page }) => {
    await openCategory(page, 'ButtonGroup');
    const comparison = page.locator('section[aria-labelledby="input-action-title"]');

    await expect(comparison.locator('article[data-direction="hairline"]')).toHaveCount(1);
    await expect(comparison.locator('article[data-direction="inset"]')).toHaveCount(1);
    await expect(comparison.locator('article[data-direction="rail"]')).toHaveCount(0);

    for (const variant of ['hairline', 'inset'] as const) {
      const group = comparison
        .locator(`article[data-direction="${variant}"]`)
        .getByRole('group', { name: '리포트 작업' });
      const actions = group.getByRole('button');

      await expect(group).toHaveAttribute('data-variant', variant);
      await expect(actions).toHaveCount(3);
      await actions.first().click();
      await expect(actions.first()).not.toHaveAttribute('aria-pressed');
    }
  });

  test('runs the primary action and exposes all three approved SplitButton variants', async ({
    page,
  }) => {
    await openCategory(page, 'SplitButton');

    for (const [direction, variant] of [
      ['hairline', 'solid'],
      ['inset', 'tonal'],
      ['rail', 'twin'],
    ] as const) {
      const card = page.locator(`article[data-direction="${direction}"]`);
      const splitButton = card.locator('[data-slot="split-button"]');

      await expect(splitButton).toHaveAttribute('data-variant', variant);
      await card.getByRole('button', { name: '리포트 저장', exact: true }).click();
      await expect(card.locator('[data-slot="split-button-result"]')).toHaveText(
        '기본 저장을 실행했습니다.',
      );
    }
  });

  test('opens the alternative menu, selects an item, and restores focus after Escape', async ({
    page,
  }) => {
    await openCategory(page, 'SplitButton');
    const card = page.locator('article[data-direction="hairline"]');
    const trigger = card.getByRole('button', { name: '리포트 저장 옵션' });

    await trigger.click();
    const menu = page.getByRole('menu', { name: '대체 액션' });
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole('menuitem', { name: '링크 복사' }).click();
    await expect(menu).toBeHidden();
    await expect(card.locator('[data-slot="split-button-result"]')).toHaveText(
      '링크 복사를 선택했습니다.',
    );
  });

  test('keeps action targets tappable without horizontal overflow on mobile', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only touch contract');
    await page.setViewportSize({ width: 390, height: 844 });

    await openCategory(page, 'ButtonGroup');
    await expectMinimumHitArea(
      page.locator('article[data-direction="hairline"]').getByRole('button').first(),
    );

    await openCategory(page, 'SplitButton');
    await expectMinimumHitArea(
      page.locator('article[data-direction="hairline"]').getByRole('button', {
        name: '리포트 저장 옵션',
      }),
    );

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('removes menu transform motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCategory(page, 'SplitButton');
    await page
      .locator('article[data-direction="hairline"]')
      .getByRole('button', { name: '리포트 저장 옵션' })
      .click();
    const menu = page.getByRole('menu', { name: '대체 액션' });

    await expect(menu).toBeVisible();
    const motionStyle = await menu.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: Number.parseFloat(style.animationDuration),
        transform: style.transform,
      };
    });

    expect(motionStyle.animationDuration).toBeLessThanOrEqual(0.001);
    expect(motionStyle.transform).toBe('none');
  });

  test('has no automatic accessibility violations', async ({ page }) => {
    await openCategory(page, 'SplitButton');
    await page
      .locator('article[data-direction="hairline"]')
      .getByRole('button', { name: '리포트 저장 옵션' })
      .click();
    await page.waitForTimeout(150);

    const controlResults = await new AxeBuilder({ page })
      .include('[data-slot="split-button"]')
      .analyze();
    const menuResults = await new AxeBuilder({ page })
      .include('[data-slot="split-button-menu"]')
      .analyze();
    expect([...controlResults.violations, ...menuResults.violations]).toEqual([]);
  });
});
