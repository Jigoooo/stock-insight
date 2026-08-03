import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// These names must match ~/.hermes/secrets/stock-insight-e2e.env. A mismatch
// makes the authenticated spec below test.skip() silently, so auth coverage
// disappears without a single failing test.
const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;
const expressiveProfileUrl = new URL(
  '../apps/web/test/fixtures/expressive-design-profile.css',
  import.meta.url,
);

type Rgb = Readonly<{ red: number; green: number; blue: number; alpha: number }>;
type ComputedBoxShadow = Readonly<{
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: Rgb;
}>;

function parseComputedRgb(value: string): Rgb {
  const hexMatch = value.trim().match(/^#([\da-f]{6})$/i);
  if (hexMatch?.[1]) {
    return {
      red: Number.parseInt(hexMatch[1].slice(0, 2), 16),
      green: Number.parseInt(hexMatch[1].slice(2, 4), 16),
      blue: Number.parseInt(hexMatch[1].slice(4, 6), 16),
      alpha: 1,
    };
  }

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

function splitCssLayers(value: string) {
  const layers: string[] = [];
  let layerStart = 0;
  let parenthesisDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') parenthesisDepth += 1;
    if (character === ')') parenthesisDepth -= 1;
    if (character === ',' && parenthesisDepth === 0) {
      layers.push(value.slice(layerStart, index).trim());
      layerStart = index + 1;
    }
  }

  layers.push(value.slice(layerStart).trim());
  return layers.filter(Boolean);
}

function parseComputedBoxShadows(value: string): ComputedBoxShadow[] {
  if (value.trim() === 'none') return [];

  return splitCssLayers(value).map((layer) => {
    const colorMatch = layer.match(
      /(?:rgba?\([^)]*\)|color\(srgb[^)]*\)|oklab\([^)]*\)|#[\da-f]{6})/i,
    );
    if (!colorMatch) throw new Error(`Expected a computed shadow color, received: ${layer}`);

    const lengths = (layer.replace(colorMatch[0], '').match(/-?[\d.]+px/g) ?? []).map(
      Number.parseFloat,
    );
    if (lengths.length < 2) {
      throw new Error(`Expected computed shadow offsets, received: ${layer}`);
    }

    return {
      inset: /\binset\b/.test(layer),
      offsetX: lengths[0] ?? 0,
      offsetY: lengths[1] ?? 0,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      color: parseComputedRgb(colorMatch[0]),
    };
  });
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
  const restingAppearance = await field.evaluate((input: HTMLInputElement) => {
    const control =
      input.closest<HTMLElement>('[data-slot="input-group"]') ??
      input.closest<HTMLElement>('[data-slot="input-shell"]');
    if (!control) throw new Error('auth focus control is missing');
    const style = getComputedStyle(control);
    return {
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
    };
  });
  await field.focus();
  await field.page().waitForTimeout(220);
  return field.evaluate((input: HTMLInputElement, restingAppearance) => {
    const control =
      input.closest<HTMLElement>('[data-slot="input-group"]') ??
      input.closest<HTMLElement>('[data-slot="input-shell"]');
    const adjacent = control?.closest<HTMLElement>('[data-auth-card]');
    if (!control || !adjacent) throw new Error('auth focus surfaces are missing');
    const style = getComputedStyle(control);
    const shadowColors = style.boxShadow.match(/(?:rgba?\([^)]*\)|color\(srgb[^)]*\))/g) ?? [];
    if (shadowColors.length === 0)
      throw new Error(`focus shadow color is missing: ${style.boxShadow}`);
    return {
      focusColors: [style.borderColor, ...shadowColors],
      adjacentBackground: getComputedStyle(adjacent).backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      inlineBoxShadow: control.style.boxShadow,
      outlineStyle: getComputedStyle(input).outlineStyle,
      restingAppearance,
      focusToken: getComputedStyle(document.documentElement).getPropertyValue('--color-focus'),
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  }, restingAppearance);
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

async function activeLiveRegionOwners(page: Page, message: string) {
  return page.locator('[aria-live]').evaluateAll(
    (elements, expectedMessage) =>
      elements
        .filter(
          (element) =>
            element.getAttribute('aria-live') !== 'off' &&
            !element.closest('[aria-hidden="true"]') &&
            (element.textContent ?? '').includes(expectedMessage),
        )
        .map((element) => ({
          id: element.id,
          live: element.getAttribute('aria-live'),
          role: element.getAttribute('role'),
          text: element.textContent?.trim() ?? '',
        })),
    message,
  );
}

type AuthGeometrySample = Readonly<{
  cardHeight: number;
  cardWidth: number;
  inputHeight: number;
  phase: string;
  submitHeight: number;
}>;

async function installAuthFirstPaintProbe(page: Page) {
  await page.addInitScript(() => {
    const geometrySamples: AuthGeometrySample[] = [];
    const layoutShifts: number[] = [];
    let captureQueued = false;

    const capture = (phase: string) => {
      const card = document.querySelector<HTMLElement>('[data-auth-card]');
      const input = document.querySelector<HTMLInputElement>('#login-username');
      const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!card || !input || !submit) return;
      const cardRect = card.getBoundingClientRect();
      geometrySamples.push({
        cardHeight: cardRect.height,
        cardWidth: cardRect.width,
        inputHeight: input.getBoundingClientRect().height,
        phase,
        submitHeight: submit.getBoundingClientRect().height,
      });
    };

    const scheduleCapture = (phase: string) => {
      if (captureQueued) return;
      captureQueued = true;
      requestAnimationFrame(() => {
        captureQueued = false;
        capture(phase);
      });
    };

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          sources?: Array<{ node?: Node | null }>;
          value?: number;
        };
        const authOwned = shift.sources?.some(({ node }) => {
          if (!(node instanceof Element)) return false;
          return Boolean(node.closest('[data-auth-shell], [data-auth-card]'));
        });
        if (!shift.hadRecentInput && authOwned && typeof shift.value === 'number') {
          layoutShifts.push(shift.value);
        }
      }
    }).observe({ buffered: true, type: 'layout-shift' });

    new MutationObserver(() => scheduleCapture('mutation-frame')).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    document.addEventListener('readystatechange', () => capture(document.readyState));
    window.addEventListener('DOMContentLoaded', () => capture('domcontentloaded'));
    window.addEventListener('load', () => {
      capture('load');
      requestAnimationFrame(() => {
        capture('raf-1');
        requestAnimationFrame(() => capture('raf-2'));
      });
    });

    Object.assign(window, {
      __authFirstPaintGeometrySamples: geometrySamples,
      __authFirstPaintLayoutShifts: layoutShifts,
    });
  });
}

test.describe('private workspace authentication', () => {
  test('keeps auth card and control geometry stable from first paint', async ({
    page,
  }, testInfo) => {
    await installAuthFirstPaintProbe(page);
    await page.goto('/login');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    const probe = await page.evaluate(() => ({
      geometrySamples:
        (
          window as typeof window & {
            __authFirstPaintGeometrySamples?: AuthGeometrySample[];
          }
        ).__authFirstPaintGeometrySamples ?? [],
      layoutShifts:
        (
          window as typeof window & {
            __authFirstPaintLayoutShifts?: number[];
          }
        ).__authFirstPaintLayoutShifts ?? [],
    }));
    await testInfo.attach('auth-first-paint-probe', {
      body: Buffer.from(JSON.stringify(probe, null, 2)),
      contentType: 'application/json',
    });

    expect(probe.geometrySamples.length).toBeGreaterThan(1);
    const finalGeometry = probe.geometrySamples.at(-1);
    expect(finalGeometry).toBeDefined();
    expect(probe.layoutShifts.reduce((total, value) => total + value, 0)).toBe(0);
    expect(
      probe.geometrySamples.every(
        ({ cardHeight, cardWidth, inputHeight, submitHeight }) =>
          Math.abs(cardHeight - finalGeometry!.cardHeight) <= 0.5 &&
          Math.abs(cardWidth - finalGeometry!.cardWidth) <= 0.5 &&
          inputHeight === 44 &&
          submitHeight === 44,
      ),
    ).toBe(true);
  });

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
    expect(geometry.inputHeight).toBe(44);
    expect(geometry.submitHeight).toBe(geometry.inputHeight);
    expect(geometry.inputFontSize).toBe('14px');
    expect(geometry.placeholderFontSize).toBe('12.5px');
    expect(geometry.titleFontSize).toBe('20px');
    expect(geometry.wordmarkFontSize).toBe('20px');
  });

  test('keeps native label focusing without replaying the restored focus transition', async ({
    page,
  }) => {
    await page.goto('/login');

    const username = page.getByLabel('사용자 이름');
    const label = page.locator('label[for="login-username"]');
    await expect(page.locator('[data-auth-card="true"]')).toHaveCSS('opacity', '1');
    await expect(username).toBeEnabled();
    await username.focus();
    await expect(username).toBeFocused();

    const transitionState = await username.evaluate((element) => {
      const shell = element.closest<HTMLElement>(
        '[data-slot="input-group"], [data-slot="input-shell"]',
      );
      return {
        inputDuration: getComputedStyle(element).transitionDuration,
        shellDuration: shell ? getComputedStyle(shell).transitionDuration : null,
      };
    });
    expect(transitionState.inputDuration).not.toBe('0s');
    expect(transitionState.shellDuration).not.toBeNull();
    await page.waitForTimeout(220);

    await username.evaluate((element) => {
      const shell = element.closest<HTMLElement>(
        '[data-slot="input-group"], [data-slot="input-shell"]',
      );
      if (!shell) throw new Error('auth focus shell is missing');
      shell.dataset.focusMotionEvents = '0';
      const countMotionEvent = () => {
        shell.dataset.focusMotionEvents = String(
          Number(shell.dataset.focusMotionEvents ?? '0') + 1,
        );
      };
      shell.addEventListener('transitionrun', countMotionEvent);
      shell.addEventListener('animationstart', countMotionEvent);
    });
    await label.click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    await expect(username).toBeFocused();
    await expect(
      username.locator('xpath=ancestor-or-self::*[@data-slot="input-shell"]'),
    ).toHaveAttribute('data-focus-motion-events', '0');
  });

  test('uses the BC auth lift and one state-aware 3px ring', async ({ page }) => {
    await page.goto('/login');

    const usernameField = page.getByLabel('사용자 이름');
    await expect(usernameField).toBeEnabled();
    const restingY = await usernameField.evaluate((input) => input.getBoundingClientRect().y);
    await usernameField.focus();
    await page.waitForTimeout(220);
    const focused = await usernameField.evaluate((input) => {
      const shell = input.closest<HTMLElement>('[data-slot="input-shell"]');
      if (!shell) throw new Error('auth username shell is missing');
      const style = getComputedStyle(shell);
      return {
        boxShadow: style.boxShadow,
        focusToken: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim(),
        transform: style.transform,
        y: shell.getBoundingClientRect().y,
      };
    });
    expect(focused.transform).toBe('matrix(1, 0, 0, 1, 0, -1)');
    expect(focused.y).toBe(restingY - 1);
    const focusedShadows = parseComputedBoxShadows(focused.boxShadow);
    expect(focusedShadows).toHaveLength(1);
    const [focusedHalo] = focusedShadows;
    expect(focusedHalo).toMatchObject({
      inset: false,
      offsetX: 0,
      offsetY: 0,
      blur: 0,
      spread: 3,
    });
    const focusToken = parseComputedRgb(focused.focusToken);
    expect(
      Math.max(
        Math.abs(focusedHalo!.color.red - focusToken.red),
        Math.abs(focusedHalo!.color.green - focusToken.green),
        Math.abs(focusedHalo!.color.blue - focusToken.blue),
      ),
    ).toBeLessThanOrEqual(2);
    expect(focusedHalo!.color.alpha).toBeGreaterThanOrEqual(0.1);
    expect(focusedHalo!.color.alpha).toBeLessThanOrEqual(0.25);

    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(usernameField).toBeFocused();
    await page.waitForTimeout(220);
    const invalid = await usernameField.evaluate((input) => {
      const shell = input.closest<HTMLElement>('[data-slot="input-shell"]');
      if (!shell) throw new Error('invalid auth username shell is missing');
      const style = getComputedStyle(shell);
      return {
        boxShadow: style.boxShadow,
        risk: getComputedStyle(document.documentElement).getPropertyValue('--color-risk').trim(),
        transform: style.transform,
      };
    });
    expect(invalid.transform).toBe('matrix(1, 0, 0, 1, 0, -1)');
    const invalidShadows = parseComputedBoxShadows(invalid.boxShadow);
    expect(invalidShadows).toHaveLength(1);
    expect(invalidShadows[0]).toMatchObject({
      inset: false,
      offsetX: 0,
      offsetY: 0,
      blur: 0,
      spread: 3,
    });
    const risk = parseComputedRgb(invalid.risk);
    const invalidHalo = invalidShadows[0]!;
    expect(
      Math.max(
        Math.abs(invalidHalo.color.red - risk.red),
        Math.abs(invalidHalo.color.green - risk.green),
        Math.abs(invalidHalo.color.blue - risk.blue),
      ),
    ).toBeLessThanOrEqual(2);
    expect(invalidHalo.color.alpha).toBeGreaterThanOrEqual(0.1);
    expect(invalidHalo.color.alpha).toBeLessThanOrEqual(0.35);
  });

  test('suppresses auth lift for disabled and reduced-motion controls', async ({ page }) => {
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    await expect(usernameField).toBeEnabled();
    await usernameField.focus();
    await expect(usernameField).toBeFocused();
    await expect
      .poll(() =>
        usernameField.evaluate((input) => {
          const shell = input.closest<HTMLElement>(
            '[data-slot="input-group"], [data-slot="input-shell"]',
          );
          if (!shell) throw new Error('focused auth input shell is missing');
          return getComputedStyle(shell).transform;
        }),
      )
      .toBe('matrix(1, 0, 0, 1, 0, -1)');
    await usernameField.evaluate((input) => {
      const shell = input.closest<HTMLElement>(
        '[data-slot="input-group"], [data-slot="input-shell"]',
      );
      if (!shell) throw new Error('disabled auth input shell is missing');
      shell.dataset.disabled = 'true';
    });
    await expect(usernameField).toBeFocused();
    await expect
      .poll(() =>
        usernameField.evaluate((input) => {
          const shell = input.closest<HTMLElement>(
            '[data-slot="input-group"], [data-slot="input-shell"]',
          );
          if (!shell) throw new Error('disabled focused auth input shell is missing');
          return getComputedStyle(shell).transform;
        }),
      )
      .toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(usernameField).toBeEnabled();
    await usernameField.focus();
    await expect(usernameField).toBeFocused();
    await expect
      .poll(() =>
        usernameField.evaluate((input) => {
          const shell = input.closest<HTMLElement>(
            '[data-slot="input-group"], [data-slot="input-shell"]',
          );
          if (!shell) throw new Error('reduced-motion auth input shell is missing');
          return getComputedStyle(shell).transform;
        }),
      )
      .toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });

  test('keeps the password addon inside the single group focus ring', async ({ page }) => {
    await page.goto('/login');
    const passwordField = page.getByLabel('비밀번호', { exact: true });
    const visibilityButton = page.getByRole('button', { name: '비밀번호 표시하기' });
    const group = passwordField.locator('xpath=ancestor::*[@data-slot="input-group"]');

    await expect(passwordField).toBeEnabled();
    await passwordField.focus();
    await page.keyboard.press('Tab');
    await expect(visibilityButton).toBeFocused();
    await page.waitForTimeout(220);
    const appearance = await group.evaluate((shell) => {
      const addonButton = shell.querySelector<HTMLButtonElement>('button');
      if (!addonButton) throw new Error('password addon button is missing');
      return {
        addonBoxShadow: getComputedStyle(addonButton).boxShadow,
        addonOutline: getComputedStyle(addonButton).outlineStyle,
        groupBoxShadow: getComputedStyle(shell).boxShadow,
        groupTransform: getComputedStyle(shell).transform,
      };
    });
    expect(appearance.groupTransform).toBe('matrix(1, 0, 0, 1, 0, -1)');
    expect(parseComputedBoxShadows(appearance.groupBoxShadow)).toHaveLength(1);
    expect(appearance.addonBoxShadow).toBe('none');
    expect(appearance.addonOutline).toBe('none');
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
      .toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    const motionBox = await motionProbe.boundingBox();
    if (!motionBox) throw new Error('login motion probe does not have a bounding box');
    await page.mouse.move(motionBox.x + motionBox.width / 2, motionBox.y + motionBox.height / 2);
    await page.mouse.down();
    try {
      await expect
        .poll(() => motionProbe.evaluate((element) => getComputedStyle(element).transform))
        .toBe('matrix(1, 0, 0, 1, 0, 1)');
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

    const passwordField = page.getByLabel('비밀번호', { exact: true });
    const visibilityButton = page.getByRole('button', { name: '비밀번호 표시하기' });
    await passwordField.focus();
    await page.keyboard.press('Tab');
    await expect(visibilityButton).toBeFocused();
    const groupFocusState = await visibilityButton.evaluate((button) => {
      const group = button.closest<HTMLElement>('[data-slot="input-group"]');
      const control = group?.querySelector<HTMLElement>('[data-slot="input-group-control"]');
      if (!group || !control) throw new Error('forced-colors password group is missing');

      const groupStyle = getComputedStyle(group);
      const buttonStyle = getComputedStyle(button);
      const controlStyle = getComputedStyle(control);
      const explicitIndicators = [groupStyle, buttonStyle, controlStyle].filter(
        (style) => style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
      );

      return {
        active: document.activeElement === button,
        explicitIndicatorCount: explicitIndicators.length,
        groupOutlineStyle: groupStyle.outlineStyle,
        groupOutlineWidth: Number.parseFloat(groupStyle.outlineWidth),
        buttonOutlineStyle: buttonStyle.outlineStyle,
        buttonBoxShadow: buttonStyle.boxShadow,
        controlOutlineStyle: controlStyle.outlineStyle,
        controlBoxShadow: controlStyle.boxShadow,
      };
    });

    expect(groupFocusState.active).toBe(true);
    expect(groupFocusState.explicitIndicatorCount).toBe(1);
    expect(groupFocusState.groupOutlineStyle).not.toBe('none');
    expect(groupFocusState.groupOutlineWidth).toBeGreaterThanOrEqual(2);
    expect(groupFocusState.buttonOutlineStyle).toBe('none');
    expect(groupFocusState.buttonBoxShadow).toBe('none');
    expect(groupFocusState.controlOutlineStyle).toBe('none');
    expect(groupFocusState.controlBoxShadow).toBe('none');
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
    const focusedBorder = parseComputedRgb(focusAppearance.borderColor);
    const focusToken = parseComputedRgb(focusAppearance.focusToken);
    expect(
      Math.max(
        Math.abs(focusedBorder.red - focusToken.red),
        Math.abs(focusedBorder.green - focusToken.green),
        Math.abs(focusedBorder.blue - focusToken.blue),
      ),
    ).toBeGreaterThan(16);
    expect(focusAppearance.boxShadow).not.toBe(focusAppearance.restingAppearance.boxShadow);
    expect(focusAppearance.transitionDuration).not.toBe('0s');
    expect(focusAppearance.transitionProperty).toContain('box-shadow');
    expect(
      strongestFocusContrast(focusAppearance.focusColors, focusAppearance.adjacentBackground),
    ).toBeGreaterThanOrEqual(3);
  });

  test('shows feedback for rejected credentials', async ({ page }) => {
    await page.goto('/login');
    const usernameField = page.getByLabel('사용자 이름');
    const submit = page.getByRole('button', { name: '로그인', exact: true });
    const announcement = page.locator('[data-slot="inline-feedback-announcement"]');
    await page.waitForTimeout(300);
    await announcement.evaluate((element) => {
      const samples: string[] = [];
      const capture = () =>
        samples.push(`${element.getAttribute('role') ?? 'idle'}:${element.textContent ?? ''}`);
      new MutationObserver(capture).observe(element, {
        attributes: true,
        attributeFilter: ['role'],
        childList: true,
        subtree: true,
      });
      capture();
      Object.assign(window, { __authFeedbackSamples: samples });
    });
    await usernameField.fill('invalid-user');
    await page.getByRole('textbox', { name: '비밀번호', exact: true }).fill('not-a-real-password');
    const initialSubmitY = await submit.evaluate((element) => element.getBoundingClientRect().y);
    await submit.click();

    await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.locator('[data-slot="inline-feedback-visual"]')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect
      .poll(() => submit.evaluate((element) => getComputedStyle(element).transform))
      .toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    expect(await submit.evaluate((element) => element.getBoundingClientRect().y)).toBe(
      initialSubmitY,
    );
    const feedbackSamples = await page.evaluate(
      () =>
        (window as typeof window & { __authFeedbackSamples?: string[] }).__authFeedbackSamples ??
        [],
    );
    expect(feedbackSamples).toContain('status:계정 정보를 확인하고 있습니다.');
    expect(feedbackSamples).toContain('alert:아이디 또는 비밀번호를 확인해 주세요.');
    await page.waitForTimeout(500);
    expect(await activeLiveRegionOwners(page, '아이디 또는 비밀번호를 확인해 주세요.')).toEqual([
      {
        id: 'login-error',
        live: 'assertive',
        role: 'alert',
        text: '아이디 또는 비밀번호를 확인해 주세요.',
      },
    ]);
    await expect(page.locator('[data-toast-id]')).toHaveCount(0);
  });

  test('removes feedback translation when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    await page.locator('[data-slot="inline-feedback-announcement"]').evaluate((announcement) => {
      const slot = announcement.parentElement;
      if (!slot) throw new Error('feedback slot is missing');
      const samples: Array<{
        phase: string;
        text: string;
        transform: string;
        visualTexts: string[];
      }> = [];
      const capture = (phase: string) => {
        const visuals = Array.from(
          slot.querySelectorAll<HTMLElement>('[data-slot="inline-feedback-visual"]'),
        );
        const visualTexts = visuals.map((visual) => visual.textContent?.trim() ?? '');
        for (const visual of visuals) {
          const text = visual.textContent?.trim() ?? '';
          if (text) {
            samples.push({
              phase,
              text,
              transform: getComputedStyle(visual).transform,
              visualTexts,
            });
          }
        }
      };
      new MutationObserver(() => {
        capture('transition-start');
        requestAnimationFrame(() => capture('next-frame'));
      }).observe(slot, { childList: true, subtree: true, characterData: true });
      Object.assign(window, { __reducedFeedbackTransformSamples: samples });
    });
    await page.getByLabel('사용자 이름').fill('invalid-user');
    await page.getByRole('textbox', { name: '비밀번호', exact: true }).fill('not-a-real-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
    const visualFeedback = page.locator('[data-slot="inline-feedback-visual"]');
    await expect(visualFeedback).toHaveCount(1);
    await expect
      .poll(() => visualFeedback.evaluate((element) => getComputedStyle(element).transform))
      .toMatch(/^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const samples = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __reducedFeedbackTransformSamples?: Array<{
              phase: string;
              text: string;
              transform: string;
              visualTexts: string[];
            }>;
          }
        ).__reducedFeedbackTransformSamples ?? [],
    );
    const pendingMessage = '계정 정보를 확인하고 있습니다.';
    const errorMessage = '아이디 또는 비밀번호를 확인해 주세요.';
    const transitionSamples = samples.filter(
      ({ text, visualTexts }) =>
        visualTexts.includes(errorMessage) && (text === pendingMessage || text === errorMessage),
    );
    for (const message of [pendingMessage, errorMessage]) {
      expect(
        transitionSamples.some(
          ({ phase, text }) => phase === 'transition-start' && text === message,
        ),
      ).toBe(true);
      expect(
        transitionSamples.some(({ phase, text }) => phase === 'next-frame' && text === message),
      ).toBe(true);
    }
    expect(
      transitionSamples.every(({ transform }) =>
        /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(transform),
      ),
    ).toBe(true);
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

    // The app normalises /workspace to its default view (/workspace/today), so
    // the assertion must accept the sub-path it actually lands on.
    await expect(page).toHaveURL(/\/workspace(?:\/[\w-]+)*(?:\?|$)/);
    await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
    const session = (await context.cookies()).find(
      (cookie) => cookie.name === '__Host-stock-insight-session',
    );
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Strict', secure: true });
  });
});
