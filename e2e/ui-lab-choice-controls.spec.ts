import { expect, test, type Locator, type Page } from '@playwright/test';

const variants = ['hairline', 'inset', 'rail'] as const;

async function openCategory(page: Page, category: 'RadioGroup' | 'Slider') {
  await page.goto('/__ui-lab');
  const categoryButton = page.getByRole('button', { name: category, exact: true });

  await expect(async () => {
    await categoryButton.click({ timeout: 1_000 });
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
}

function choiceControlCard(page: Page, variant: (typeof variants)[number]): Locator {
  return page
    .locator('section[aria-labelledby="input-action-title"]')
    .locator(`article[data-direction="${variant}"]`);
}

function radioParts(card: Locator) {
  const group = card.locator('[data-slot="radio-group"]');
  return {
    group,
    items: group.locator('[data-slot="radio-group-item"]'),
  };
}

async function activateRadioGroup(items: Locator) {
  await expect(async () => {
    await items.nth(0).click({ timeout: 1_000 });
    await expect(items.nth(0)).toHaveAttribute('data-state', 'checked', { timeout: 1_000 });
  }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });

  await items.nth(1).click();
  await expect(items.nth(1)).toHaveAttribute('data-state', 'checked');
}

function sliderParts(card: Locator) {
  const control = card.locator('[data-slot="slider-control"]');
  return {
    control,
    output: control.locator('[data-slot="slider-value"]'),
    root: control.locator('[data-slot="slider-root"]'),
    thumb: control.getByRole('slider', { name: '신뢰도 기준' }),
    track: control.locator('[data-slot="slider-track"]'),
  };
}

test.describe('UI Lab Slider', () => {
  test('heading and scale clicks do not change the value', async ({ page }) => {
    await openCategory(page, 'Slider');
    const card = choiceControlCard(page, 'inset');
    const { control, output, thumb } = sliderParts(card);

    await expect(output).toHaveText('64%');
    await control.getByText('신뢰도 기준', { exact: true }).click();
    await control.getByText('넓게', { exact: true }).click();
    await control.getByText('엄격하게', { exact: true }).click();

    await expect(thumb).toHaveAttribute('aria-valuenow', '64');
    await expect(output).toHaveText('64%');
  });

  test('visible track ends map to the exact minimum and maximum', async ({ page }) => {
    await openCategory(page, 'Slider');
    const { output, thumb, track } = sliderParts(choiceControlCard(page, 'hairline'));
    const trackBox = await track.boundingBox();
    expect(trackBox, 'slider track should have a bounding box').not.toBeNull();

    await track.click({ position: { x: 1, y: trackBox!.height / 2 } });
    await expect(thumb).toHaveAttribute('aria-valuenow', '0');
    await expect(output).toHaveText('0%');

    await track.click({ position: { x: trackBox!.width - 1, y: trackBox!.height / 2 } });
    await expect(thumb).toHaveAttribute('aria-valuenow', '100');
    await expect(output).toHaveText('100%');
  });

  test('updates every approved slider variant from the keyboard', async ({ page }) => {
    await openCategory(page, 'Slider');

    for (const variant of variants) {
      const { output, thumb } = sliderParts(choiceControlCard(page, variant));

      await expect(output).toHaveText('64%');
      await thumb.focus();
      await thumb.press('ArrowRight');

      await expect(thumb).toHaveAttribute('aria-valuenow', '65');
      await expect(output).toHaveText('65%');
    }
  });

  test('forced colors keeps a visible system focus outline', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openCategory(page, 'Slider');
    const { thumb } = sliderParts(choiceControlCard(page, 'inset'));

    await page.keyboard.press('Tab');
    await thumb.focus();

    await expect(thumb).toHaveCSS('outline-style', 'solid');
    await expect
      .poll(() =>
        thumb.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
      )
      .toBeGreaterThanOrEqual(2);
  });

  test('reduced motion does not run a transform transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCategory(page, 'Slider');
    const { thumb, track } = sliderParts(choiceControlCard(page, 'rail'));

    await track.click({ position: { x: 2, y: 1 } });

    await expect
      .poll(() => thumb.evaluate((element) => getComputedStyle(element).transitionProperty))
      .not.toContain('transform');
    expect(
      await thumb.evaluate((element) =>
        element
          .getAnimations()
          .some((animation) =>
            animation.effect
              ?.getKeyframes()
              .some((keyframe) => typeof keyframe.transform === 'string'),
          ),
      ),
    ).toBe(false);
  });
});

test.describe('UI Lab choice controls', () => {
  test('selects every approved radio variant with keyboard semantics', async ({ page }) => {
    await openCategory(page, 'RadioGroup');

    for (const variant of variants) {
      const { group, items } = radioParts(choiceControlCard(page, variant));

      await expect(group).toHaveAttribute('data-variant', variant);
      await expect(items).toHaveCount(3);
      await expect(items.nth(1)).toHaveAttribute('data-state', 'checked');

      await activateRadioGroup(items);
      await page.keyboard.down('ArrowRight');

      await expect(items.nth(2)).toBeFocused();
      await expect(items.nth(2)).toHaveAttribute('data-state', 'checked');
      await page.keyboard.up('ArrowRight');
    }
  });

  test('keeps choice controls compact on desktop and tappable on mobile', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'RadioGroup');

    for (const variant of variants) {
      const { group, items } = radioParts(choiceControlCard(page, variant));
      await expect(group).toHaveAttribute('data-variant', variant);

      for (const item of await items.all()) {
        const box = await item.boundingBox();
        expect(box, `${variant} radio option should have a bounding box`).not.toBeNull();
        if (testInfo.project.name === 'mobile') {
          expect(box!.height).toBeGreaterThanOrEqual(44);
        } else {
          expect(box!.height).toBeLessThanOrEqual(64);
        }
      }
    }

    await openCategory(page, 'Slider');
    for (const variant of variants) {
      const { control, root } = sliderParts(choiceControlCard(page, variant));
      await expect(control).toHaveAttribute('data-variant', variant);
      const rootBox = await root.boundingBox();
      expect(rootBox, `${variant} slider should have a bounding box`).not.toBeNull();
      expect(rootBox!.height).toBeLessThanOrEqual(44);
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('removes transform motion in reduced-motion mode', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCategory(page, 'RadioGroup');

    for (const variant of variants) {
      const card = choiceControlCard(page, variant);
      const { items } = radioParts(card);
      await activateRadioGroup(items);
      await page.keyboard.down('ArrowRight');
      await expect(items.nth(2)).toHaveAttribute('data-state', 'checked');
      await page.keyboard.up('ArrowRight');
      await expect(card.locator('[class*="previewSurface"]')).toHaveCSS('transform', 'none');
    }

    await openCategory(page, 'Slider');
    for (const variant of variants) {
      const card = choiceControlCard(page, variant);
      const { output, thumb } = sliderParts(card);
      await thumb.focus();
      await thumb.press('ArrowRight');
      await expect(output).toHaveText('65%');
      await expect(card.locator('[class*="previewSurface"]')).toHaveCSS('transform', 'none');
    }
  });
});
