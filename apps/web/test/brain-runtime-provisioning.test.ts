// ARCHITECTURAL INVARIANT: the brain must be provisioned for everything it owns.
//
// Regression origin: P2 moved every write path (manual portfolio, signup,
// invitation issue/revoke) from the BFF into the brain, but the P3 manifest gave
// the brain only DATABASE_READ_URL. Reads returned 200 while every mutation
// failed closed with 503 — a failure mode no read-only smoke test could see.
//
// This test ties the manifest to the code: if a service uses a write client, its
// container must be given a write DSN.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (relative: string) => readFileSync(repoRoot + relative, 'utf8');

const compose = read('docker-compose.prod-db-auth.yml');
const apiServerSource = [
  'apps/api-server/src/auth/auth.controller.ts',
  'apps/api-server/src/write/manual-portfolio.service.ts',
  'apps/api-server/src/personalization/personalization.service.ts',
]
  .map(read)
  .join('\n');

function serviceBlock(text: string, name: string): string {
  const match = text.match(
    new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|\\nsecrets:|\\nnetworks:)`),
  );
  return match?.[1] ?? '';
}

describe('brain runtime provisioning matches the code it owns', () => {
  const api = serviceBlock(compose, 'api');
  const app = serviceBlock(compose, 'app');

  it('gives the brain a write DSN because it opens write clients', () => {
    // Proof the brain genuinely needs it, so this is not a stale assertion.
    assert.match(
      apiServerSource,
      /createScopedDatabaseClient|createSignupDatabaseClient/,
      'expected the api-server to open write database clients',
    );
    assert.match(api, /DATABASE_WRITE_URL/);
    assert.match(api, /DATABASE_READ_URL/);
  });

  it('keeps every database credential off the BFF', () => {
    assert.doesNotMatch(app, /DATABASE_READ_URL|DATABASE_WRITE_URL/);
    assert.doesNotMatch(app, /research:/);
    assert.match(app, /STOCK_INSIGHT_BRAIN_URL/);
  });

  // Both sides must derive the same MAC, so both need the same secret mounted.
  it('mounts the internal-context secret on both the signer and the verifier', () => {
    for (const [name, block] of [
      ['api', api],
      ['app', app],
    ] as const) {
      assert.match(
        block,
        /STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE/,
        `${name} must receive the internal-context secret`,
      );
      assert.match(block, /- stock-insight-internal-context/, `${name} must mount the secret`);
    }
  });

  it('declares every secret each service references', () => {
    const declared = compose.match(/\nsecrets:\n([\s\S]*?)(?=\nnetworks:|$)/)?.[1] ?? '';
    assert.notEqual(declared, '', 'expected a top-level secrets: block');
    for (const secret of ['stock-insight-internal-context', 'stock-insight-session-secret']) {
      assert.match(declared, new RegExp(`  ${secret}:`), `${secret} must be declared`);
    }
  });
});
