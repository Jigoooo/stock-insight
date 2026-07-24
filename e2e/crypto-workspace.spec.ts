import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { CryptoResearchWorkspace } from '../packages/contracts/src/crypto-research.ts';

import { hashProductionArtifact } from '../scripts/production-artifact-hash.mjs';
import { cryptoWorkspaceFixture } from './fixtures/p6-crypto-ui/fixture';

const cryptoProductionWireFixture = {
  ...cryptoWorkspaceFixture,
  riskExposures: cryptoWorkspaceFixture.riskExposures.map(
    (risk: CryptoResearchWorkspace['riskExposures'][number]) =>
      risk.exposureKey === 'risk:aave:fixture'
        ? {
            ...risk,
            economicMagnitude: '0',
            economicMagnitudeUnit: 'ratio',
            epistemicConfidence: 0.5,
          }
        : risk,
  ),
} satisfies CryptoResearchWorkspace;

const readOnlyActionSelector =
  'button, form, a, input, select, textarea, summary, iframe, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex^="-"]), [role="button"], [role="link"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="option"], [role="treeitem"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="slider"], [role="spinbutton"], [aria-pressed], [aria-checked]';

type SerializedNode = {
  i?: number;
  p?: { k: string[]; v: SerializedNode[] };
  a?: SerializedNode[];
  [key: string]: unknown;
};

function findSerializedRecord(node: SerializedNode, key: string): SerializedNode | undefined {
  if (node.p?.k.includes(key)) return node;
  for (const value of node.p?.v ?? []) {
    const found = findSerializedRecord(value, key);
    if (found) return found;
  }
  for (const value of node.a ?? []) {
    const found = findSerializedRecord(value, key);
    if (found) return found;
  }
  return undefined;
}

function setSerializedRecordValue(node: SerializedNode, key: string, value: SerializedNode) {
  const index = node.p?.k.indexOf(key) ?? -1;
  if (index >= 0 && node.p) node.p.v[index] = value;
}

function maxSerializedId(node: SerializedNode): number {
  let maximum = typeof node.i === 'number' ? node.i : -1;
  for (const value of node.p?.v ?? []) maximum = Math.max(maximum, maxSerializedId(value));
  for (const value of node.a ?? []) maximum = Math.max(maximum, maxSerializedId(value));
  return maximum;
}

function serializedValue(value: unknown, allocateId: () => number): SerializedNode {
  if (typeof value === 'string') return { t: 1, s: value };
  if (typeof value === 'number') return { t: 0, s: value };
  if (typeof value === 'boolean') return { t: 2, s: value ? 2 : 3 };
  if (value === null) return { t: 2, s: 1 };
  if (Array.isArray(value)) {
    return { t: 9, i: allocateId(), a: value.map((item) => serializedValue(item, allocateId)) };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      t: 10,
      i: allocateId(),
      p: {
        k: entries.map(([key]) => key),
        v: entries.map(([, item]) => serializedValue(item, allocateId)),
      },
    };
  }
  throw new Error(`Unsupported crypto E2E fixture value: ${typeof value}`);
}

async function installNonEmptyCryptoRoute(page: Page) {
  const evidence = { matched: false };
  await page.route('**/_serverFn/**', async (route) => {
    const requestUrl = decodeURIComponent(route.request().url());
    if (!requestUrl.includes('crypto')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    let payload: SerializedNode;
    try {
      payload = (await response.json()) as SerializedNode;
    } catch {
      await route.fulfill({ response });
      return;
    }
    const result = findSerializedRecord(payload, 'crypto');
    if (!result) {
      await route.fulfill({ response });
      return;
    }
    let nextId = maxSerializedId(payload) + 1;
    setSerializedRecordValue(
      result,
      'crypto',
      serializedValue(cryptoProductionWireFixture, () => nextId++),
    );
    evidence.matched = true;
    await route.fulfill({ response, json: payload });
  });
  return evidence;
}

const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === '1';
const expectedArtifactSha256 = process.env.PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256;
const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;

function assertProductionArtifactIdentity(): void {
  if (!useProductionBuild) return;
  if (!expectedArtifactSha256 || !/^[0-9a-f]{64}$/.test(expectedArtifactSha256)) {
    throw new Error('PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256 is required for production QA');
  }
  expect(hashProductionArtifact(new URL('../apps/web/.output/', import.meta.url))).toBe(
    expectedArtifactSha256,
  );
}

async function navigateToCrypto(page: Page): Promise<void> {
  if (!username || !password) throw new Error('Stock Insight E2E credentials are required');
  await page.goto('/login?redirect=%2Fworkspace%3Fview%3Dcrypto');
  await page.getByLabel('사용자 이름').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\?view=crypto$/);
  await expect(page.getByTestId('research-workspace-v3')).toBeVisible();
}

async function settleFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function expectNoReadOnlyActions(page: Page): Promise<void> {
  const details = await page
    .locator('[data-read-only="true"]')
    .locator(readOnlyActionSelector)
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getAttribute('aria-label') !== '기업 연결 표 가로 스크롤 영역')
        .map((node) => node.outerHTML.slice(0, 240)),
    );
  expect(details).toEqual([]);
}

test.describe('P6 crypto read-only workspace', () => {
  test.beforeAll(() => {
    assertProductionArtifactIdentity();
    if (!username || !password) throw new Error('Stock Insight E2E credentials are required');
  });

  test.afterAll(() => assertProductionArtifactIdentity());

  test('renders a truthful empty read-only surface without overflow or serious a11y defects', async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await navigateToCrypto(page);
    await expect(page.getByRole('heading', { name: '크립토·기업 연결 리서치' })).toBeVisible();
    await expect(page.locator('output').filter({ hasText: '조회 전용' })).toBeVisible();
    await expect(page.getByText('데이터가 아직 없습니다')).toBeVisible();

    const readOnlyRoot = page.locator('[data-read-only="true"]');
    await expect(readOnlyRoot).toBeVisible();
    await expectNoReadOnlyActions(page);
    await settleFonts(page);

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.html).toBeLessThanOrEqual(1);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({
      path: testInfo.outputPath(`crypto-workspace-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });

  test('renders deterministic non-empty evidence through the authenticated production route', async ({
    page,
  }, testInfo) => {
    const evidence = await installNonEmptyCryptoRoute(page);
    await navigateToCrypto(page);
    const statusNav = page.getByTestId('workspace-nav-status');
    await expect(statusNav).toBeEnabled();
    await statusNav.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page).toHaveURL(/\/workspace\?view=status$/);
    const cryptoNav = page.getByTestId('workspace-nav-crypto');
    await expect(cryptoNav).toBeEnabled();
    await cryptoNav.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page).toHaveURL(/\/workspace\?view=crypto$/);
    await expect.poll(() => evidence.matched).toBe(true);
    await expect(page.getByRole('heading', { name: '크립토·기업 연결 리서치' })).toBeVisible();
    await expect(page.getByText('검증 1개 · 검토 중 1개')).toBeVisible();
    await expect(page.getByText('원계수 214000 BTC')).toBeVisible();
    await expect(page.getByText('최종 확정')).toBeVisible();
    await expect(page.getByText('봉인됨')).toBeVisible();
    await expect(page.getByText('기준 시각', { exact: false }).first()).toBeVisible();
    await expect(page.locator('[data-relation-key="cross:aave:coin"]')).toContainText(
      '원계수 0.00001 ratio',
    );
    const buildingRisk = page.locator('[data-exposure-key="risk:aave:fixture"]');
    await expect(buildingRisk).toContainText('작성 중');
    await expect(buildingRisk).toContainText('신뢰도 50%');
    await expect(buildingRisk).toContainText('원계수 0 ratio');
    await expect(page.locator('[data-read-only="true"]')).toBeVisible();
    await expect(page.locator('[data-order-executable="false"]')).toBeVisible();
    await expectNoReadOnlyActions(page);
    await settleFonts(page);
    await page.screenshot({
      path: testInfo.outputPath(`crypto-workspace-populated-${testInfo.project.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  });
});
