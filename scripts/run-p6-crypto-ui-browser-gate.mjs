import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const configFile = resolve(root, 'e2e/fixtures/p6-crypto-ui/vite.config.ts');
const server = await createServer({ configFile, logLevel: 'error' });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/`;

  for (const viewport of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '크립토·기업 연결 리서치' }).waitFor();

    const metrics = await page.evaluate(() => {
      const tableWrap = document.querySelector('[aria-label="기업 연결 표 가로 스크롤 영역"]');
      const forbiddenControlNodes = [
        ...document.querySelectorAll(
          'button, form, a, input, select, textarea, summary, iframe, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex^="-"]), [role="button"], [role="link"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="option"], [role="treeitem"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="slider"], [role="spinbutton"], [aria-pressed], [aria-checked]',
        ),
      ].filter((node) => node !== tableWrap);
      return {
        bodyOverflow: document.documentElement.scrollWidth > window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        tableClientWidth: tableWrap?.clientWidth ?? null,
        tableScrollWidth: tableWrap?.scrollWidth ?? null,
        forbiddenControls: forbiddenControlNodes.length,
        forbiddenControlDetails: forbiddenControlNodes.map((node) => node.outerHTML.slice(0, 240)),
        listRoles: [...document.querySelectorAll('ul[aria-label], ol[aria-label]')].map((node) =>
          node.getAttribute('role'),
        ),
      };
    });

    const bodyText = await page.locator('body').innerText();
    for (const expected of [
      '검증 1개 · 검토 중 1개',
      '214,000 BTC',
      '원계수 214000 BTC',
      '<0.0001 ratio',
      '신뢰 원계수 0.999',
      '유동성 회수 · 거래소 경로',
      '오라클 장애 · 오라클 피드',
      '봉인됨',
      '작성 중',
      '최종 확정',
      '안전 확인',
      '검토 중',
    ]) {
      assert.match(bodyText, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const evidence = page.getByText(expected, { exact: false }).first();
      await evidence.scrollIntoViewIfNeeded();
      assert.equal(await evidence.isVisible(), true);
      const [box, style] = await Promise.all([
        evidence.boundingBox(),
        evidence.evaluate((node) => {
          const computed = getComputedStyle(node);
          return { opacity: Number(computed.opacity), visibility: computed.visibility };
        }),
      ]);
      assert(box !== null && box.width > 0 && box.height > 0);
      assert(style.opacity > 0 && style.visibility !== 'hidden');
    }
    assert.doesNotMatch(bodyText, /원계수 null/);
    const verifiedRelation = await page.locator('[data-relation-key="cross:btc:mstr"]').innerText();
    assert.match(verifiedRelation, /검증됨/);
    assert.match(verifiedRelation, /원계수 214000 BTC/);
    const proposedRelation = await page
      .locator('[data-relation-key="cross:aave:coin"]')
      .innerText();
    assert.match(proposedRelation, /검토 중/);
    assert.match(proposedRelation, /원계수 0\.00001 ratio/);
    assert.match(proposedRelation, /신뢰 원계수 0\.999/);
    const buildingRisk = await page.locator('[data-exposure-key="risk:aave:fixture"]').innerText();
    assert.match(buildingRisk, /작성 중/);
    assert.match(buildingRisk, /검토 중/);
    assert.match(buildingRisk, /정량값 없음/);
    assert.equal(await page.getByRole('row').count(), 3);
    assert.equal(metrics.bodyOverflow, false);
    assert.equal(
      metrics.forbiddenControls,
      0,
      `forbidden controls: ${JSON.stringify(metrics.forbiddenControlDetails)}`,
    );
    assert.deepEqual(metrics.listRoles, ['list', 'list', 'list']);
    assert.deepEqual(consoleErrors, []);

    const tableRegion = page.getByRole('region', { name: '기업 연결 표 가로 스크롤 영역' });
    const scrollHint = page.getByText('좌우로 밀어 전체 근거 확인', { exact: true });
    await tableRegion.focus();
    assert.equal(await tableRegion.evaluate((node) => document.activeElement === node), true);
    if (viewport.name === 'mobile') {
      assert.match(bodyText, /좌우로 밀어 전체 근거 확인/);
      assert.equal(await scrollHint.isVisible(), true);
      assert(Number(await scrollHint.evaluate((node) => getComputedStyle(node).opacity)) > 0);
      const [hintBox, regionBox] = await Promise.all([
        scrollHint.boundingBox(),
        tableRegion.boundingBox(),
      ]);
      assert(hintBox !== null && regionBox !== null);
      assert(
        hintBox.x >= regionBox.x && hintBox.x + hintBox.width <= regionBox.x + regionBox.width,
      );
      assert(
        hintBox.y >= regionBox.y && hintBox.y + hintBox.height <= regionBox.y + regionBox.height,
      );
      assert(
        (metrics.tableScrollWidth ?? 0) > (metrics.tableClientWidth ?? 0),
        `mobile table must scroll within its region: ${JSON.stringify(metrics)}`,
      );
    } else {
      assert.doesNotMatch(bodyText, /좌우로 밀어 전체 근거 확인/);
      assert.equal(await scrollHint.isVisible(), false);
    }

    const axe = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(
      axe.violations.map((violation) => violation.id),
      [],
    );
    results.push({ viewport: viewport.name, ...metrics, consoleErrors, axeViolations: [] });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`P6_CRYPTO_UI_BROWSER_GATE=PASS ${JSON.stringify(results)}`);
