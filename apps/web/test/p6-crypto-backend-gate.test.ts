import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

describe('P6 crypto backend-only release gate', () => {
  it('keeps the database rehearsal while removing retired crypto UI gates', async () => {
    const packageJson = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };
    const release = packageJson.scripts['verify:release'] ?? '';

    assert.equal(
      packageJson.scripts['test:p6:db'],
      'pnpm --filter @stock-insight/api test:p6-db-rehearsal',
    );
    assert.match(release, /pnpm test:p6:db/);
    assert.equal(packageJson.scripts['typecheck:p6:fixture'], undefined);
    assert.equal(packageJson.scripts['test:p6:browser'], undefined);
    assert.equal(packageJson.scripts['test:p6:browser:production'], undefined);
    assert.doesNotMatch(release, /typecheck:p6:fixture|test:p6:browser/);

    for (const path of [
      'e2e/crypto-workspace.spec.ts',
      'e2e/fixtures/p6-crypto-ui/main.tsx',
      'scripts/run-p6-crypto-ui-browser-gate.mjs',
      'scripts/run-p6-crypto-production-e2e.mjs',
    ]) {
      await assert.rejects(access(new URL(path, root)), { code: 'ENOENT' });
    }
  });

  it('uses one product-neutral disposable database boundary for active production browser gates', async () => {
    const [genericRunner, p3dRunner, sigmaRunner] = await Promise.all([
      read('scripts/run-production-browser-e2e.mjs'),
      read('scripts/run-p3d-production-e2e.mjs'),
      read('scripts/run-sigma-production-e2e.mjs'),
    ]);

    assert.match(genericRunner, /PRODUCTION_E2E_ADMIN_DATABASE_URL/);
    assert.match(genericRunner, /PRODUCTION_E2E_SOURCE_DATABASE_URL/);
    assert.match(genericRunner, /supportedSuites = new Set\(\['p3d', 'sigma'\]\)/);
    assert.match(genericRunner, /authenticateCredentials/);
    assert.match(genericRunner, /credentialFingerprint/);
    assert.match(genericRunner, /DROP DATABASE IF EXISTS/);
    assert.match(genericRunner, /DROP ROLE IF EXISTS/);
    assert.doesNotMatch(genericRunner, /P6_|p6|crypto-workspace/);
    assert.match(p3dRunner, /run-production-browser-e2e\.mjs/);
    assert.match(sigmaRunner, /run-production-browser-e2e\.mjs/);
    assert.doesNotMatch(p3dRunner, /run-p6-crypto-production-e2e/);
    assert.doesNotMatch(sigmaRunner, /run-p6-crypto-production-e2e/);
  });

  it('preserves the crypto read model and public contract for backend compatibility', async () => {
    const [readModel, contractPackage] = await Promise.all([
      read('apps/api/src/crypto/read-model.ts'),
      read('packages/contracts/package.json'),
    ]);

    assert.match(readModel, /getCryptoResearchWorkspace/);
    assert.match(contractPackage, /\.\/crypto-research/);
  });
});
