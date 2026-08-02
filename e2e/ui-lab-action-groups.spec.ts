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

  test('renders ButtonGroup as one continuous surface without a nested preview backdrop', async ({
    page,
  }) => {
    await openCategory(page, 'ButtonGroup');

    for (const variant of ['hairline', 'inset'] as const) {
      const card = page.locator(`article[data-direction="${variant}"]`);
      const preview = card.locator('[data-direction]').last();
      const group = card.getByRole('group', { name: '리포트 작업' });
      const firstAction = group.getByRole('button').first();
      const secondAction = group.getByRole('button').nth(1);

      const styles = await Promise.all([
        preview.evaluate((element) => getComputedStyle(element).backgroundColor),
        group.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            borderTopWidth: style.borderTopWidth,
            columnGap: style.columnGap,
            paddingInlineStart: style.paddingInlineStart,
          };
        }),
        firstAction.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderTopWidth: style.borderTopWidth,
          };
        }),
        secondAction.evaluate((element) => getComputedStyle(element).borderLeftWidth),
      ]);

      expect(styles[0]).toBe('rgba(0, 0, 0, 0)');
      expect(styles[1]).toEqual({
        borderTopWidth: '1px',
        columnGap: 'normal',
        paddingInlineStart: '0px',
      });
      expect(styles[2]).toEqual({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderTopWidth: '0px',
      });
      expect(styles[3]).toBe('1px');
      await expect(group).toHaveAttribute('data-full-width', 'true');
      const [previewBox, groupBox, firstBox, secondBox] = await Promise.all([
        preview.boundingBox(),
        group.boundingBox(),
        firstAction.boundingBox(),
        secondAction.boundingBox(),
      ]);
      expect(previewBox).not.toBeNull();
      expect(groupBox).not.toBeNull();
      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      expect(Math.abs(groupBox!.width - previewBox!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(firstBox!.width - secondBox!.width)).toBeLessThanOrEqual(1.1);
    }
  });

  test('gives every ButtonGroup variant a pressed surface without moving its segment', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'pointer-down visual state is desktop-only');
    await openCategory(page, 'ButtonGroup');
    for (const variant of ['hairline', 'inset'] as const) {
      const action = page
        .locator(`article[data-direction="${variant}"]`)
        .getByRole('button', { name: '저장' });
      const restingBackground = await action.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      const box = await action.boundingBox();

      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await expect(action).toHaveCSS('transform', 'none');
      await expect(action).toHaveCSS('box-shadow', /inset/);
      const pressedBackground = await action.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(pressedBackground).not.toBe(restingBackground);
      await page.mouse.up();
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

  test('keeps joined SplitButton segments continuous and motionless while pressed', async ({
    page,
  }) => {
    await openCategory(page, 'SplitButton');

    for (const direction of ['hairline', 'inset'] as const) {
      const card = page.locator(`article[data-direction="${direction}"]`);
      const root = card.locator('[data-slot="split-button"]');
      const primary = card.getByRole('button', { name: '리포트 저장', exact: true });
      const trigger = card.getByRole('button', { name: '리포트 저장 옵션' });

      const joinedStyles = await Promise.all([
        root.evaluate((element) => getComputedStyle(element).borderTopWidth),
        primary.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderTopWidth: style.borderTopWidth,
          };
        }),
        trigger.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderLeftWidth: style.borderLeftWidth,
          };
        }),
      ]);

      expect(joinedStyles[0]).toBe('1px');
      expect(joinedStyles[1]).toEqual({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderTopWidth: '0px',
      });
      expect(joinedStyles[2]).toEqual({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderLeftWidth: '1px',
      });

      const box = await trigger.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await expect(trigger).toHaveCSS('transform', 'none');
      await page.mouse.up();
    }
  });

  test('starts the SplitButton chevron from an explicit closed state on first open', async ({
    page,
  }) => {
    await openCategory(page, 'SplitButton');
    const card = page.locator('article[data-direction="hairline"]');
    const trigger = card.getByRole('button', { name: '리포트 저장 옵션' });
    const chevron = trigger.locator('[data-slot="split-button-trigger"]');
    const closedTransform = await chevron.evaluate(
      (element) => getComputedStyle(element).transform,
    );

    expect(closedTransform).not.toBe('none');
    await trigger.click();
    await page.waitForTimeout(40);
    const openingTransform = await chevron.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    expect(openingTransform).not.toBe(closedTransform);
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
