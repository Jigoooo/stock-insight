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
    const p6ProductionSpec = await read('e2e/crypto-workspace.spec.ts');
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
    assert.match(p6ProductionRunner, /mkdtempSync/);
    assert.match(p6ProductionRunner, /FROM pg_policy AS policy/);
    assert.match(p6ProductionRunner, /ensureDisposableRole/);
    assert.match(p6ProductionRunner, /stock_insight_p6_qa_/);
    assert.match(
      p6ProductionRunner,
      /CREATE DATABASE \$\{quotedDatabase\} OWNER "\$\{databaseRoleName\}"/,
    );
    assert.match(p6ProductionRunner, /FROM pg_extension/);
    assert.match(
      p6ProductionRunner,
      /STOCK_INSIGHT_E2E_DATABASE_URL: databaseUserUrl\.toString\(\)/,
    );
    assert.match(p6ProductionRunner, /'--no-comments'/);
    assert.match(p6ProductionRunner, /unnest\(extension\.extconfig\)/);
    assert.match(p6ProductionRunner, /--exclude-table-data=/);
    assert.match(p6ProductionRunner, /--format=custom/);
    assert.match(p6ProductionRunner, /pg_restore/);
    assert.match(p6ProductionRunner, /EVENT TRIGGER/);
    assert.match(p6ProductionRunner, /FROM pg_event_trigger AS event/);
    assert.match(p6ProductionRunner, /deptype = 'e'/);
    assert.match(p6ProductionRunner, /CREATE EVENT TRIGGER/);
    assert.match(p6ProductionRunner, /randomUUID/);
    for (const table of [
      'app_user_identity_map',
      'app_users',
      'app_auth_bootstrap_state',
      'app_local_accounts',
    ]) {
      assert.match(p6ProductionRunner, new RegExp(`INSERT INTO public\\.${table}`));
    }
    assert.doesNotMatch(p6ProductionRunner, /suppliedAccountKeys/);
    assert.doesNotMatch(p6ProductionRunner, /process\.env\.STOCK_INSIGHT_E2E_PASSWORD \?\?/);
    assert.match(p6ProductionRunner, /authenticateCredentials/);
    assert.doesNotMatch(p6ProductionRunner, /STOCK_INSIGHT_E2E_PRODUCTION_MUTATION_ACK/);
    assert.match(
      p6ProductionRunner,
      /randomBytes\(32\)\.toString\('base64url'\)/,
      'session secrets consumed as UTF-8 must be generated as printable text',
    );
    assert.doesNotMatch(
      p6ProductionRunner,
      /writeFileSync\(generatedSecretPath, randomBytes\(32\)/,
      'raw random bytes are not a valid UTF-8 session-secret contract',
    );
    assert.match(p6ProductionRunner, /STOCK_INSIGHT_PRODUCTION_E2E_SUITE/);
    assert.match(p6ProductionRunner, /new Set\(\['p6', 'p3d', 'sigma'\]\)/);
    assert.match(p6ProductionRunner, /run-p3d-production-e2e\.mjs/);
    assert.match(p6ProductionRunner, /run-sigma-production-e2e\.mjs/);
    assert.match(p6ProductionRunner, /delete process\.env\[key\]/);
    assert.match(p6ProductionRunner, /PLAYWRIGHT_STORAGE_STATE/);
    assert.match(p6ProductionRunner, /STOCK_INSIGHT_PRODUCTION_E2E_PREPARED:\s*'1'/);
    assert.match(
      p6ProductionRunner,
      /STOCK_INSIGHT_E2E_SESSION_SECRET_PATH: qaCredentials\.secretPath/,
    );
    assert.match(p6ProductionRunner, /rmSync\(temporaryRoot, \{ force: true, recursive: true \}\)/);
    const requiredEnvironmentDeclaration =
      p6ProductionRunner.match(/const requiredEnvironment = \[[^\]]*\]/)?.[0] ?? '';
    assert.match(requiredEnvironmentDeclaration, /P6_REHEARSAL_ADMIN_DATABASE_URL/);
    assert.doesNotMatch(requiredEnvironmentDeclaration, /STOCK_INSIGHT_E2E_SESSION_SECRET_PATH/);
    assert.match(packageJson.scripts['test:design:browser:production'] ?? '', /18094/);
    // The Playwright web server must NOT carry a hardcoded production DSN
    // fallback: with the live-database dev mode, an ambient production
    // DATABASE_URL would let a browser gate mutate the real research_app.
    // Credentials now arrive only through the guarded, allowlisted server env.
    assert.doesNotMatch(
      playwrightConfig,
      /research_app@127\.0\.0\.1:55432\/research_app/,
      'playwright config must not hardcode a production database fallback',
    );
    assert.match(playwrightConfig, /assertSafeE2eConfiguration/);
    assert.match(playwrightConfig, /reuseExistingServer: false/);
    assert.match(p6ProductionSpec, /page\.goto\('\/login\?redirect=%2Fworkspace%2Fcrypto'\)/);
    assert.match(p6ProductionSpec, /toHaveURL\(\/\\\/workspace\\\/crypto\$\//);
    assert.doesNotMatch(p6ProductionSpec, /workspace\\\?view=/);
    assert.doesNotMatch(p6ProductionSpec, /workspace-nav-status/);
    assert.doesNotMatch(p6ProductionSpec, /데이터가 아직 없습니다/);
    assert.match(playwrightConfig, /STOCK_INSIGHT_SESSION_SECRET_FILE/);
    assert.equal((p3dSpec.match(/await document\.fonts\.ready/g) ?? []).length, 2);
    assert.match(sigmaRunner, /PLAYWRIGHT_PORT: process\.env\.PLAYWRIGHT_PORT \?\? '18095'/);
  });
});
