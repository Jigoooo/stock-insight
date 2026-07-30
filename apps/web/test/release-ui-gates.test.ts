import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootPackageUrl = new URL('../../../package.json', import.meta.url);
const authVisualUrl = new URL('../../../e2e/auth-visual.spec.ts', import.meta.url);
const authVisualRunnerUrl = new URL(
  '../../../scripts/run-auth-visual-production-e2e.mjs',
  import.meta.url,
);

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
});
