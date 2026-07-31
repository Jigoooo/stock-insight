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
  const oklabMatch = value.match(
    /oklab\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/,
  );
  if (oklabMatch) {
    const lightness = Number(oklabMatch[1]);
    const a = Number(oklabMatch[2]);
    const b = Number(oklabMatch[3]);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const encode = (channel: number) => {
      const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
      return Math.min(1, Math.max(0, encoded)) * 255;
    };
    return {
      red: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      green: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      blue: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      alpha: oklabMatch[4] === undefined ? 1 : Number(oklabMatch[4]),
    };
  }
  const srgbMatch = value.match(
    /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/,
  );
  if (srgbMatch) {
    return {
      red: Number(srgbMatch[1]) * 255,
      green: Number(srgbMatch[2]) * 255,
      blue: Number(srgbMatch[3]) * 255,
      alpha: srgbMatch[4] === undefined ? 1 : Number(srgbMatch[4]),
    };
  }
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

function compositeColor(foreground: Rgb, background: Rgb): Rgb {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  };
}

function strongestFocusContrast(focusColors: string[], background: string) {
  return Math.max(
    ...focusColors.map((color) =>
      contrastRatio(parseComputedRgb(color), parseComputedRgb(background)),
    ),
  );
}

async function focusedControlAppearance(field: Locator) {
  await field.focus();
  await field.page().waitForTimeout(220);
  return field.evaluate((input: HTMLInputElement) => {
    const control =
      input.closest<HTMLElement>('[data-slot="input-group"]') ??
      input.closest<HTMLElement>('[data-slot="input"]');
    const adjacent = control?.closest<HTMLElement>('[data-auth-card]');
    if (!control || !adjacent) throw new Error('auth focus surfaces are missing');
    const style = getComputedStyle(control);
    const shadowColors = style.boxShadow.match(/(?:rgba?\([^)]*\)|color\(srgb[^)]*\))/g) ?? [];
    if (shadowColors.length === 0)
      throw new Error(`focus shadow color is missing: ${style.boxShadow}`);
    return {
      focusColors: [style.borderColor, ...shadowColors],
      adjacentBackground: getComputedStyle(adjacent).backgroundColor,
      inlineBoxShadow: control.style.boxShadow,
      outlineStyle: getComputedStyle(input).outlineStyle,
    };
  });
}

async function authStateAppearance(page: Page) {
  return page.evaluate(() => {
    const error = document.querySelector<HTMLElement>('#login-username-error');
    const password = document.querySelector<HTMLInputElement>('#login-password');
    const control = password?.closest<HTMLElement>('[data-slot="input-group"]');
    const adjacent = control?.closest<HTMLElement>('[data-auth-card]');
    if (!error || !password || !control || !adjacent)
      throw new Error('auth state surfaces are missing');
    return {
      errorColor: getComputedStyle(error).color,
      errorBackground: getComputedStyle(adjacent).backgroundColor,
      placeholderColor: getComputedStyle(password, '::placeholder').color,
      placeholderControlBackground: getComputedStyle(control).backgroundColor,
      placeholderAdjacentBackground: getComputedStyle(adjacent).backgroundColor,
    };
  });
}

test.describe('private workspace authentication', () => {
  test('uses one restrained centered auth card without decorative marketing chrome', async ({
    page,
  }) => {
    await page.goto('/login');

    const shell = page.locator('[data-auth-shell]');
    const card = page.locator('[data-auth-card]');
    await expect(shell).toBeVisible();
    await expect(card).toBeVisible();
    await expect(page.getByText('Stock Insight', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
    await expect(page.getByText('Research workspace', { exact: true })).toHaveCount(0);
    await expect(page.getByText('시장의 흐름을 읽고')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /테마/ })).toHaveCount(0);

    const geometry = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const input = element.querySelector<HTMLInputElement>('#login-username');
      const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]');
      const title = element.querySelector<HTMLHeadingElement>('#login-form-heading');
      const wordmark = element.querySelector<HTMLElement>('[class*="wordmark"]');
      if (!input || !submit || !title || !wordmark) throw new Error('auth surfaces are missing');
      return {
        inputHeight: input.getBoundingClientRect().height,
        inputFontSize: getComputedStyle(input).fontSize,
        placeholderFontSize: getComputedStyle(input, '::placeholder').fontSize,
        leftGap: rect.left,
        rightGap: innerWidth - rect.right,
        submitHeight: submit.getBoundingClientRect().height,
        titleFontSize: getComputedStyle(title).fontSize,
        width: rect.width,
        wordmarkFontSize: getComputedStyle(wordmark).fontSize,
        radius: style.borderRadius,
      };
    });
    expect(geometry.width).toBeLessThanOrEqual(400);
    expect(geometry.width).toBeGreaterThanOrEqual(340);
    expect(Math.abs(geometry.leftGap - geometry.rightGap)).toBeLessThanOrEqual(2);
    expect(geometry.radius).toBe('16px');
    expect(geometry.inputHeight).toBe(42);
    expect(geometry.submitHeight).toBe(geometry.inputHeight);
    expect(geometry.inputFontSize).toBe('14px');
    expect(geometry.placeholderFontSize).toBe(geometry.inputFontSize);
    expect(geometry.titleFontSize).toBe('20px');
    expect(geometry.wordmarkFontSize).toBe('20px');
  });

  test('keeps native label focusing without replaying a focus transition', async ({ page }) => {
    await page.goto('/login');

    const username = page.getByLabel('사용자 이름');
    const label = page.locator('label[for="login-username"]');
    await expect(username).toBeEnabled();
    await username.focus();
    await expect(username).toBeFocused();

    const transitionState = await username.evaluate((element) => {
      const group = element.closest<HTMLElement>('[data-slot="input-group"]');
      return {
        inputDuration: getComputedStyle(element).transitionDuration,
        groupDuration: group ? getComputedStyle(group).transitionDuration : null,
      };
    });
    expect(transitionState.inputDuration).toBe('0s');
    expect(transitionState.groupDuration).toBeNull();

    await username.evaluate((element) => {
      element.dataset.focusMotionEvents = '0';
      const countMotionEvent = () => {
        element.dataset.focusMotionEvents = String(
          Number(element.dataset.focusMotionEvents ?? '0') + 1,
        );
      };
      element.addEventListener('transitionrun', countMotionEvent);
      element.addEventListener('animationstart', countMotionEvent);
    });
    await label.click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    await expect(username).toBeFocused();
    await expect(username).toHaveAttribute('data-focus-motion-events', '0');
  });

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
    await expect(motionProbe).toBeEnabled();
    const buttonAppearance = await motionProbe.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    });
    expect(buttonAppearance.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(
      contrastRatio(
        parseComputedRgb(buttonAppearance.color),
        parseComputedRgb(buttonAppearance.backgroundColor),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    await motionProbe.hover();
    await expect
      .poll(() => motionProbe.evaluate((element) => getComputedStyle(element).transform))
      .toBe('matrix(1.01, 0, 0, 1.01, 0, 0)');
    const motionBox = await motionProbe.boundingBox();
    if (!motionBox) throw new Error('login motion probe does not have a bounding box');
    await page.mouse.move(motionBox.x + motionBox.width / 2, motionBox.y + motionBox.height / 2);
    await page.mouse.down();
    try {
      await expect
        .poll(() => motionProbe.evaluate((element) => getComputedStyle(element).transform))
        .toBe('matrix(0.985, 0, 0, 0.985, 0, 0)');
    } finally {
      await page.mouse.up();
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(motionProbe).toBeEnabled();
    await motionProbe.hover();
    await expect
      .poll(() => motionProbe.evaluate((element) => getComputedStyle(element).transform))
      .toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);

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

    const visibilityButton = page.getByRole('button', { name: '비밀번호 표시하기' });
    await visibilityButton.click();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
    const hidePasswordButton = page.getByRole('button', { name: '비밀번호 숨기기' });
    await expect(hidePasswordButton).toHaveAttribute('aria-pressed', 'true');
    await hidePasswordButton.click();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('preserves a native focus indicator in forced colors without a decorative halo', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.goto('/login');

    const usernameField = page.getByLabel('사용자 이름');
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
    await usernameField.focus();
    const forcedColorState = await usernameField.evaluate((input) => {
      const inputStyle = getComputedStyle(input);
      return {
        active: document.activeElement === input,
        haloCount: input
          .closest<HTMLElement>('[data-slot="field"]')
          ?.querySelectorAll('[data-field-motion-halo]').length,
        outlineStyle: inputStyle.outlineStyle,
        outlineWidth: Number.parseFloat(inputStyle.outlineWidth),
      };
    });

    expect(forcedColorState.active).toBe(true);
    expect(forcedColorState.haloCount).toBe(0);
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
    const lightFocus = await focusedControlAppearance(page.getByLabel('사용자 이름'));
    expect(lightFocus.inlineBoxShadow).toBe('');
    expect(
      strongestFocusContrast(lightFocus.focusColors, lightFocus.adjacentBackground),
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
        compositeColor(
          parseComputedRgb(lightStates.placeholderControlBackground),
          parseComputedRgb(lightStates.placeholderAdjacentBackground),
        ),
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
    const darkFocus = await focusedControlAppearance(page.getByLabel('사용자 이름'));
    expect(darkFocus.inlineBoxShadow).toBe('');
    expect(
      strongestFocusContrast(darkFocus.focusColors, darkFocus.adjacentBackground),
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
        compositeColor(
          parseComputedRgb(darkStates.placeholderControlBackground),
          parseComputedRgb(darkStates.placeholderAdjacentBackground),
        ),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    const darkResults = await new AxeBuilder({ page }).analyze();
    expect(darkResults.violations).toEqual([]);
  });

  test('keeps input focus visible with sufficient contrast', async ({ page }) => {
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    await expect(usernameField).toBeEnabled();

    const focusAppearance = await focusedControlAppearance(usernameField);
    expect(focusAppearance.inlineBoxShadow).toBe('');
    expect(focusAppearance.outlineStyle).toBe('none');
    expect(
      strongestFocusContrast(focusAppearance.focusColors, focusAppearance.adjacentBackground),
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
    const closeToast = toast.getByRole('button', { name: '알림 닫기' });
    await expect(closeToast).toBeVisible();
    await closeToast.click();
    await expect(toast).toBeHidden();
  });

  test('finishes a toast exit when reduced-motion changes during close', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    const passwordField = page.getByRole('textbox', { name: '비밀번호', exact: true });
    const submit = page.getByRole('button', { name: '로그인', exact: true });

    await usernameField.fill('invalid-user');
    await passwordField.fill('not-a-real-password');
    await submit.click();

    const firstToast = page
      .locator('[data-toast-id]')
      .filter({ hasText: '로그인하지 못했습니다.' });
    await expect(firstToast).toBeVisible();
    const firstToastId = await firstToast.getAttribute('data-toast-id');
    await firstToast.getByRole('button', { name: '알림 닫기' }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(firstToast).toBeHidden();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await submit.click();
    const secondToast = page
      .locator('[data-toast-id]')
      .filter({ hasText: '로그인하지 못했습니다.' });
    await expect(secondToast).toBeVisible();
    await expect(secondToast).not.toHaveAttribute('data-toast-id', firstToastId ?? '');
    await page.waitForTimeout(500);
    await expect(secondToast).toBeVisible();
    await expect(
      page.locator('[data-toast-id]').filter({ hasText: '로그인하지 못했습니다.' }),
    ).toHaveCount(1);
  });

  test('keeps dark-mode authentication accessible with visible focus', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    await usernameField.fill('contrast-user');
    const focusAppearance = await focusedControlAppearance(usernameField);
    expect(focusAppearance.inlineBoxShadow).toBe('');
    expect(focusAppearance.outlineStyle).toBe('none');
    expect(
      strongestFocusContrast(focusAppearance.focusColors, focusAppearance.adjacentBackground),
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
