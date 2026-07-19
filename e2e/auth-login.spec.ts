import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const username = process.env.PLAYWRIGHT_AUTH_USERNAME;
const password = process.env.PLAYWRIGHT_AUTH_PASSWORD;
const expressiveProfileUrl = new URL(
  '../apps/web/test/fixtures/expressive-design-profile.css',
  import.meta.url,
);

type Rgb = Readonly<{ red: number; green: number; blue: number; alpha: number }>;

function parseComputedRgb(value: string): Rgb {
  const match = value.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/,
  );
  if (!match) throw new Error(`Expected a computed rgb color, received: ${value}`);
  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function relativeLuminance({ red, green, blue }: Rgb) {
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(foreground: Rgb, background: Rgb) {
  const composited = {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  };
  const lighter = Math.max(relativeLuminance(composited), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(composited), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function focusedShellAppearance(field: Locator) {
  await field.focus();
  await field.page().waitForTimeout(220);
  return field.evaluate((input: HTMLInputElement) => {
    const shell = input.closest<HTMLElement>('[data-motion="field-shell"]');
    const adjacent = shell?.closest<HTMLElement>('main');
    if (!shell || !adjacent) throw new Error('auth focus surfaces are missing');
    const style = getComputedStyle(shell);
    const shadowColor = style.boxShadow.match(/rgba?\([^)]*\)/)?.[0];
    if (!shadowColor) throw new Error(`focus shadow color is missing: ${style.boxShadow}`);
    return {
      shadowColor,
      adjacentBackground: getComputedStyle(adjacent).backgroundColor,
      inlineBoxShadow: shell.style.boxShadow,
    };
  });
}

async function authStateAppearance(page: Page) {
  return page.evaluate(() => {
    const error = document.querySelector<HTMLElement>('#login-username-error');
    const password = document.querySelector<HTMLInputElement>('#login-password');
    const shell = password?.closest<HTMLElement>('[data-motion="field-shell"]');
    const adjacent = shell?.closest<HTMLElement>('main');
    if (!error || !password || !shell || !adjacent)
      throw new Error('auth state surfaces are missing');
    return {
      errorColor: getComputedStyle(error).color,
      errorBackground: getComputedStyle(adjacent).backgroundColor,
      placeholderColor: getComputedStyle(password, '::placeholder').color,
      placeholderBackground: getComputedStyle(shell).backgroundColor,
    };
  });
}

test.describe('private workspace authentication', () => {
  test('loads the active profile behind responsive and motion safety invariants', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/login');

    const profileId = await page.locator('html').getAttribute('data-design-profile');
    expect(profileId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    await expect(page.locator('link[rel="stylesheet"][href^="/styles/profiles/"]')).toHaveAttribute(
      'href',
      `/styles/profiles/${profileId}.css`,
    );
    const motionProbe = page.getByRole('button', { name: '로그인', exact: true });
    await expect(motionProbe).toHaveAttribute('data-motion', 'pressable');
    await motionProbe.hover();
    await expect
      .poll(() => motionProbe.evaluate((element) => getComputedStyle(element).transform))
      .toBe('none');
    const motionBox = await motionProbe.boundingBox();
    if (!motionBox) throw new Error('login motion probe does not have a bounding box');
    await page.mouse.move(motionBox.x + motionBox.width / 2, motionBox.y + motionBox.height / 2);
    await page.mouse.down();
    try {
      await expect
        .poll(() => motionProbe.evaluate((element) => getComputedStyle(element).transform))
        .toBe('none');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect
        .poll(() => motionProbe.evaluate((element) => getComputedStyle(element).transform))
        .toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    } finally {
      await page.mouse.up();
    }

    const safety = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const requiredTokens = [
        '--color-canvas',
        '--color-surface',
        '--color-text-primary',
        '--color-focus',
        '--radius-control',
      ];
      const smallControls = Array.from(
        document.querySelectorAll<HTMLElement>('button, input, select, textarea, [role="button"]'),
      )
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && !element.hidden;
        })
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0 && (box.width < 24 || box.height < 24))
        .map(({ element, box }) => ({
          tag: element.tagName,
          label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
          width: box.width,
          height: box.height,
        }));
      const longRunningAnimations = document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return (
          animation.playState === 'running' &&
          typeof timing?.duration === 'number' &&
          timing.duration > 160 &&
          (timing.iterations ?? 1) > 1
        );
      }).length;

      return {
        missingTokens: requiredTokens.filter((token) => !rootStyle.getPropertyValue(token).trim()),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        smallControls,
        longRunningAnimations,
      };
    });

    expect(safety.missingTokens).toEqual([]);
    expect(safety.overflow).toBeLessThanOrEqual(1);
    expect(safety.smallControls).toEqual([]);
    expect(safety.longRunningAnimations).toBe(0);
  });

  test('redirects an anonymous root request to an accessible login form', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fworkspace$/);
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
    await expect(page.getByLabel('사용자 이름')).toBeVisible();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('preserves a native focus indicator while forced colors hide the decorative halo', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.goto('/login');

    const usernameField = page.getByLabel('사용자 이름');
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
    await usernameField.focus();
    const forcedColorState = await usernameField.evaluate((input) => {
      const shell = input.closest<HTMLElement>('[data-motion="field-shell"]');
      const halo = shell?.querySelector<HTMLElement>('[data-field-motion-halo]');
      const inputStyle = getComputedStyle(input);
      if (!shell || !halo) throw new Error('forced-colors field-shell surfaces are missing');
      return {
        active: document.activeElement === input,
        haloDisplay: getComputedStyle(halo).display,
        outlineStyle: inputStyle.outlineStyle,
        outlineWidth: Number.parseFloat(inputStyle.outlineWidth),
      };
    });

    expect(forcedColorState.active).toBe(true);
    expect(forcedColorState.haloDisplay).toBe('none');
    expect(forcedColorState.outlineStyle).not.toBe('none');
    expect(forcedColorState.outlineWidth).toBeGreaterThanOrEqual(2);
  });

  test('keeps hard invariants under an alternative visual profile', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto('/login');
    const expressiveProfile = await readFile(expressiveProfileUrl, 'utf8');
    await page
      .locator('link[rel="stylesheet"][href^="/styles/profiles/"]')
      .evaluate((link: HTMLLinkElement) => {
        link.disabled = true;
      });
    await page.addStyleTag({ content: expressiveProfile });

    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.locator('#login-username-error')).not.toBeEmpty();

    const state = await page.evaluate(() => ({
      canvas: getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim(),
      radius: getComputedStyle(document.documentElement).getPropertyValue('--radius-panel').trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(state.canvas).toBe('#fff4fb');
    expect(state.radius).toBe('32px');
    expect(state.overflow).toBeLessThanOrEqual(1);
    const lightFocus = await focusedShellAppearance(page.getByLabel('사용자 이름'));
    expect(lightFocus.inlineBoxShadow).toBe('');
    expect(
      contrastRatio(
        parseComputedRgb(lightFocus.shadowColor),
        parseComputedRgb(lightFocus.adjacentBackground),
      ),
    ).toBeGreaterThanOrEqual(3);
    const lightStates = await authStateAppearance(page);
    expect(
      contrastRatio(
        parseComputedRgb(lightStates.errorColor),
        parseComputedRgb(lightStates.errorBackground),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(
        parseComputedRgb(lightStates.placeholderColor),
        parseComputedRgb(lightStates.placeholderBackground),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    const lightResults = await new AxeBuilder({ page }).analyze();
    expect(lightResults.violations).toEqual([]);

    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim(),
        ),
      )
      .toBe('#170b20');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const darkFocus = await focusedShellAppearance(page.getByLabel('사용자 이름'));
    expect(darkFocus.inlineBoxShadow).toBe('');
    expect(
      contrastRatio(
        parseComputedRgb(darkFocus.shadowColor),
        parseComputedRgb(darkFocus.adjacentBackground),
      ),
    ).toBeGreaterThanOrEqual(3);
    const darkStates = await authStateAppearance(page);
    expect(
      contrastRatio(
        parseComputedRgb(darkStates.errorColor),
        parseComputedRgb(darkStates.errorBackground),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(
        parseComputedRgb(darkStates.placeholderColor),
        parseComputedRgb(darkStates.placeholderBackground),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    const darkResults = await new AxeBuilder({ page }).analyze();
    expect(darkResults.violations).toEqual([]);
  });

  test('keeps input focus visible with sufficient contrast', async ({ page }) => {
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    await expect(usernameField).toBeEnabled();

    const focusAppearance = await focusedShellAppearance(usernameField);
    expect(focusAppearance.inlineBoxShadow).toBe('');
    expect(
      contrastRatio(
        parseComputedRgb(focusAppearance.shadowColor),
        parseComputedRgb(focusAppearance.adjacentBackground),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  test('shows feedback for rejected credentials', async ({ page }) => {
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    await usernameField.fill('invalid-user');
    await page.getByRole('textbox', { name: '비밀번호', exact: true }).fill('not-a-real-password');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
    const toast = page.locator('[data-toast-id]').filter({ hasText: '로그인하지 못했습니다.' });
    await expect(toast).toBeVisible();
    await expect(toast.getByRole('button', { name: '알림 닫기' })).toBeVisible();
  });

  test('keeps dark-mode authentication accessible with visible focus', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    await usernameField.fill('contrast-user');
    const focusAppearance = await focusedShellAppearance(usernameField);
    expect(focusAppearance.inlineBoxShadow).toBe('');
    expect(
      contrastRatio(
        parseComputedRgb(focusAppearance.shadowColor),
        parseComputedRgb(focusAppearance.adjacentBackground),
      ),
    ).toBeGreaterThanOrEqual(3);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('creates a private session with candidate credentials', async ({ context, page }) => {
    test.skip(
      !username || !password,
      'candidate credentials are required for successful login E2E',
    );
    await page.goto('/login?redirect=%2Fworkspace');
    await page.getByLabel('사용자 이름').fill(username!);
    await page.locator('#login-password').fill(password!);
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
    await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
    const session = (await context.cookies()).find(
      (cookie) => cookie.name === '__Host-stock-insight-session',
    );
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Strict', secure: true });
  });
});
