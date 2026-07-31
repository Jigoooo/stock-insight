import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootPackageUrl = new URL('../../../package.json', import.meta.url);
const authVisualUrl = new URL('../../../e2e/auth-visual.spec.ts', import.meta.url);
const authVisualRunnerUrl = new URL(
  '../../../scripts/run-auth-visual-production-e2e.mjs',
  import.meta.url,
);
const workspaceVisualUrl = new URL('../../../e2e/workspace-visual.spec.ts', import.meta.url);
const workspaceAuthSetupUrl = new URL('../../../e2e/workspace-auth.setup.ts', import.meta.url);
const workspaceAuthTeardownUrl = new URL(
  '../../../e2e/workspace-auth.teardown.ts',
  import.meta.url,
);
const playwrightConfigUrl = new URL('../../../playwright.config.ts', import.meta.url);

describe('release UI browser gates', () => {
  it('keeps auth accessibility assertions mandatory and screenshots opt-in', async () => {
    const source = await readFile(authVisualUrl, 'utf8');

    assert.doesNotMatch(source, /test\.skip\(!visualDirectory/);
    assert.match(source, /if \(visualDirectory\) \{[\s\S]*page\.screenshot/);
    assert.match(source, /new AxeBuilder\(\{ page \}\)\.analyze\(\)/);
  });

  it('runs auth visual accessibility and provider-free select gates after build', async () => {
    const packageJson = JSON.parse(await readFile(rootPackageUrl, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};
    const release = scripts['verify:release'] ?? '';

    assert.equal(
      scripts['test:auth:visual:production'],
      'node scripts/run-auth-visual-production-e2e.mjs',
    );
    assert.equal(
      scripts['test:select-controls:browser'],
      'node scripts/run-select-controls-browser-gate.mjs',
    );
    assert.match(
      release,
      /pnpm build && pnpm test:p6:browser && pnpm test:auth:visual:production && pnpm test:select-controls:browser/,
    );
  });

  it('runs production auth assertions with an ephemeral session secret and cleans it up', async () => {
    const source = await readFile(authVisualRunnerUrl, 'utf8');

    assert.match(source, /mkdtempSync\(join\(tmpdir\(\), 'stock-insight-auth-visual-'\)\)/);
    assert.match(
      source,
      /writeFileSync\(secretPath, randomBytes\(32\)\.toString\('hex'\), \{ mode: 0o600 \}\)/,
    );
    assert.match(source, /PLAYWRIGHT_USE_PRODUCTION_BUILD:\s*'1'/);
    assert.match(source, /STOCK_INSIGHT_E2E_SESSION_SECRET_PATH:\s*secretPath/);
    assert.match(source, /rmSync\(temporaryRoot, \{ force: true, recursive: true \}\)/);
  });

  it('defines the complete authenticated workspace visual matrix and focused captures', async () => {
    const source = await readFile(workspaceVisualUrl, 'utf8');

    for (const route of [
      '/workspace/today',
      '/workspace/radar',
      '/workspace/stocks',
      '/workspace/crypto',
      '/workspace/themes',
      '/workspace/research',
      '/workspace/history',
      '/workspace/status',
      '/admin/invitations',
    ]) {
      assert.match(source, new RegExp(`['"]${route}['"]`));
    }
    for (const viewport of [
      /expanded:\s*\{\s*width:\s*1440,\s*height:\s*960\s*\}/,
      /compact:\s*\{\s*width:\s*1180,\s*height:\s*900\s*\}/,
      /boundary:\s*\{\s*width:\s*768,\s*height:\s*900\s*\}/,
      /mobile:\s*\{\s*width:\s*390,\s*height:\s*844\s*\}/,
    ]) {
      assert.match(source, viewport);
    }

    assert.match(source, /document\.fonts\.ready/);
    assert.match(source, /scrollWidth[\s\S]*clientWidth\s*\+\s*1/);
    assert.match(source, /new AxeBuilder\(\{ page \}\)[\s\S]*\.analyze\(\)/);
    assert.match(source, /colorScheme[\s\S]*['"]light['"][\s\S]*['"]dark['"]/);
    assert.match(source, /reducedMotion:\s*['"]reduce['"]/);
    assert.match(source, /data-navigation-mode/);
    assert.match(source, /page\.screenshot\(/);
    assert.match(source, /PLAYWRIGHT_STORAGE_STATE/);
    assert.match(source, /STOCK_INSIGHT_E2E_USERNAME/);
    assert.match(source, /STOCK_INSIGHT_E2E_PASSWORD/);
    assert.match(source, /\/login/);
    assert.match(source, /requested route redirected to login/);

    const publicCaptureIndex = source.indexOf('public login pending-to-error');
    const authenticatedSkipIndex = source.indexOf('authorized storage state or credentials');
    assert.notEqual(publicCaptureIndex, -1);
    assert.notEqual(authenticatedSkipIndex, -1);
    assert.ok(publicCaptureIndex < authenticatedSkipIndex);
  });

  it('keeps workspace-only projects narrow without changing desktop and mobile names', async () => {
    const source = await readFile(playwrightConfigUrl, 'utf8');

    assert.match(source, /name:\s*['"]desktop['"][\s\S]*testIgnore:[\s\S]*\/workspace-visual/);
    assert.match(source, /name:\s*['"]mobile['"][\s\S]*testIgnore:[\s\S]*\/workspace-visual/);
    assert.match(source, /workspaceVisualProject\(['"]workspace-expanded['"][\s\S]*1440[\s\S]*960/);
    assert.match(source, /workspaceVisualProject\(['"]workspace-compact['"][\s\S]*1180[\s\S]*900/);
    assert.match(source, /workspaceVisualProject\(['"]workspace-boundary['"][\s\S]*768[\s\S]*900/);
    assert.match(source, /workspaceVisualProject\(['"]workspace-mobile['"][\s\S]*390[\s\S]*844/);
    assert.match(source, /testMatch:\s*\/workspace-visual/);
  });

  it('authenticates workspace visual projects once and removes generated storage state', async () => {
    const [config, setup, teardown, visual] = await Promise.all([
      readFile(playwrightConfigUrl, 'utf8'),
      readFile(workspaceAuthSetupUrl, 'utf8'),
      readFile(workspaceAuthTeardownUrl, 'utf8'),
      readFile(workspaceVisualUrl, 'utf8'),
    ]);

    assert.match(config, /PLAYWRIGHT_STORAGE_STATE/);
    assert.match(config, /STOCK_INSIGHT_E2E_USERNAME/);
    assert.match(config, /STOCK_INSIGHT_E2E_PASSWORD/);
    assert.match(config, /workspace-auth-setup/);
    assert.match(config, /dependencies:\s*workspaceAuthDependencies/);
    assert.match(config, /globalTeardown/);
    assert.match(setup, /storageState\(\{\s*path:\s*storageStatePath\s*\}\)/);
    assert.match(setup, /\/login\?redirect=%2Fworkspace%2Ftoday/);
    assert.match(teardown, /rmSync\(storageStatePath/);
    assert.doesNotMatch(visual, /test\.beforeAll\([\s\S]*\/login/);
    assert.doesNotMatch(visual, /authenticatedCookies/);
  });

  it('requires canonical absence evidence and fail-safe administrator cleanup', async () => {
    const source = await readFile(workspaceVisualUrl, 'utf8');

    assert.doesNotMatch(source, /test\.skip\([^\n]*count\(\)[^\n]*===\s*0/);
    assert.match(source, /observePendingLaneMarker/);
    assert.match(source, /expect\(pendingMarkerObserved\)\.toBe\(true\)/);
    assert.match(source, /이 분류에는 아직 변화가 없습니다/);
    assert.match(source, /조건에 맞는 종목이 없습니다/);
    assert.match(source, /표시할 관계가 없습니다/);
    assert.match(source, /지도 원천이 연결되지 않았습니다|지도에 표시할 위치가 없습니다/);
    assert.match(source, /finally\s*\{[\s\S]*코드 폐기/);
    assert.match(source, /\[code, dynamicLabel\]/);
    assert.match(source, /toHaveCount\(1\)/);
  });

  it('runs the workspace visual matrix against development and the built release artifact', async () => {
    const packageJson = JSON.parse(await readFile(rootPackageUrl, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};

    assert.equal(scripts['test:workspace:visual'], 'playwright test e2e/workspace-visual.spec.ts');
    assert.equal(
      scripts['test:workspace:visual:production'],
      'PLAYWRIGHT_USE_PRODUCTION_BUILD=1 PLAYWRIGHT_PORT=18098 playwright test e2e/workspace-visual.spec.ts',
    );
    const release = scripts['verify:release'] ?? '';
    assert.ok(release.indexOf('pnpm build') >= 0);
    assert.ok(
      release.indexOf('pnpm test:workspace:visual:production') > release.indexOf('pnpm build'),
    );
  });
});
