import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

describe('P6 non-empty crypto browser gate', () => {
  it('renders the production component with a controlled non-empty fixture', async () => {
    const fixture = `${await read('e2e/fixtures/p6-crypto-ui/main.tsx')}\n${await read(
      'e2e/fixtures/p6-crypto-ui/fixture.ts',
    )}`;
    assert.match(fixture, /CryptoWorkspaceView/);
    assert.match(fixture, /satisfies CryptoResearchWorkspace/);
    assert.match(fixture, /cryptoResearchWorkspaceSchema\.parse/);
    assert.match(fixture, /relationState: 'verified'/);
    assert.match(fixture, /relationState: 'proposed'/);
    assert.match(fixture, /lifecycleState: 'sealed'/);
    assert.match(fixture, /lifecycleState: 'building'/);
    assert.match(fixture, /epistemicConfidence: null/);
  });

  it('measures responsive overflow, focus, raw coefficients, console, and Axe', async () => {
    const runner = await read('scripts/run-p6-crypto-ui-browser-gate.mjs');
    for (const contract of [
      'AxeBuilder',
      'bodyOverflow',
      'tableScrollWidth',
      'forbiddenControls',
      'document.activeElement === node',
      'scrollHint.isVisible()',
      'scrollHint.boundingBox()',
      '[role="combobox"]',
      '[contenteditable]:not([contenteditable="false"])',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="slider"]',
      '[tabindex]:not([tabindex^="-"])',
      '[role="tab"]',
      '[role="option"]',
      '[role="searchbox"]',
      '[role="treeitem"]',
      'data-relation-key',
      'data-exposure-key',
      '원계수 214000 BTC',
      '원계수 null',
      'axe.violations',
      'P6_CRYPTO_UI_BROWSER_GATE=PASS',
    ]) {
      assert.match(runner, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('is mandatory in the root release command', async () => {
    const packageJson = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };
    const playwrightConfig = await read('playwright.config.ts');
    const p3dSpec = await read('e2e/research-workspace-v3.spec.ts');
    const sigmaRunner = await read('scripts/run-sigma-production-e2e.mjs');
    const p6ProductionRunner = await read('scripts/run-p6-crypto-production-e2e.mjs');
    assert.equal(
      packageJson.scripts['test:p6:browser'],
      'node scripts/run-p6-crypto-ui-browser-gate.mjs',
    );
    assert.equal(
      packageJson.scripts['typecheck:p6:fixture'],
      'tsc -p e2e/fixtures/p6-crypto-ui/tsconfig.json --noEmit',
    );
    assert.match(packageJson.scripts['verify:release'] ?? '', /pnpm typecheck:p6:fixture/);
    assert.match(packageJson.scripts['verify:release'] ?? '', /pnpm test:p6:db/);
    assert.match(packageJson.scripts['verify:release'] ?? '', /pnpm build && pnpm test:p6:browser/);
    assert.equal(
      packageJson.scripts['test:p6:browser:production'],
      'node scripts/run-p6-crypto-production-e2e.mjs',
    );
    assert.match(packageJson.scripts['verify:release'] ?? '', /pnpm test:p6:browser:production/);
    assert.match(p6ProductionRunner, /stock_insight_p6_production_/);
    assert.match(p6ProductionRunner, /SELECT current_database\(\)/);
    assert.match(p6ProductionRunner, /DROP DATABASE IF EXISTS/);
    assert.match(p6ProductionRunner, /expectedTests = 4/);
    assert.match(packageJson.scripts['test:design:browser:production'] ?? '', /18094/);
    assert.match(playwrightConfig, /DATABASE_URL=.*research_app@127\.0\.0\.1:55432\/research_app/);
    assert.match(playwrightConfig, /STOCK_INSIGHT_SESSION_SECRET_FILE/);
    assert.equal((p3dSpec.match(/await document\.fonts\.ready/g) ?? []).length, 2);
    assert.match(sigmaRunner, /PLAYWRIGHT_PORT: process\.env\.PLAYWRIGHT_PORT \?\? '18095'/);
  });
});
