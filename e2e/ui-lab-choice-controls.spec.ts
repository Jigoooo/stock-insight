import { expect, test, type Locator, type Page } from '@playwright/test';

async function openSlider(page: Page) {
  await page.goto('/__ui-lab');
  const categoryButton = page.getByRole('button', { name: 'Slider', exact: true });

  await expect(async () => {
    await categoryButton.click({ timeout: 1_000 });
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
}

function sliderCard(page: Page, variant: 'hairline' | 'inset' | 'rail'): Locator {
  return page
    .locator('section[aria-labelledby="input-action-title"]')
    .locator(`article[data-direction="${variant}"]`);
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
    await openSlider(page);
    const card = sliderCard(page, 'inset');
    const { control, output, thumb } = sliderParts(card);

    await expect(output).toHaveText('64%');
    await control.getByText('신뢰도 기준', { exact: true }).click();
    await control.getByText('넓게', { exact: true }).click();
    await control.getByText('엄격하게', { exact: true }).click();

    await expect(thumb).toHaveAttribute('aria-valuenow', '64');
    await expect(output).toHaveText('64%');
  });

  test('visible track ends map to the exact minimum and maximum', async ({ page }) => {
    await openSlider(page);
    const { output, thumb, track } = sliderParts(sliderCard(page, 'hairline'));
    const trackBox = await track.boundingBox();
    expect(trackBox, 'slider track should have a bounding box').not.toBeNull();

    await track.click({ position: { x: 1, y: trackBox!.height / 2 } });
    await expect(thumb).toHaveAttribute('aria-valuenow', '0');
    await expect(output).toHaveText('0%');

    await track.click({ position: { x: trackBox!.width - 1, y: trackBox!.height / 2 } });
    await expect(thumb).toHaveAttribute('aria-valuenow', '100');
    await expect(output).toHaveText('100%');
  });

  test('uncontrolled keyboard interaction updates the displayed output', async ({ page }) => {
    await openSlider(page);
    const { output, thumb } = sliderParts(sliderCard(page, 'rail'));

    await thumb.focus();
    await thumb.press('ArrowRight');

    await expect(thumb).toHaveAttribute('aria-valuenow', '65');
    await expect(output).toHaveText('65%');
  });

  test('forced colors keeps a visible system focus outline', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openSlider(page);
    const { thumb } = sliderParts(sliderCard(page, 'inset'));

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
    await openSlider(page);
    const { thumb, track } = sliderParts(sliderCard(page, 'rail'));

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
