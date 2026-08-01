import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildE2eStack } from './e2e-stack.mjs';

const disposableDatabaseUrl = 'postgresql://qa@127.0.0.1:55432/stock_insight_e2e_deadbeef';

test('E2E stack starts the brain and points the BFF at it', () => {
  // Login is handled by the brain (apps/api-server); apps/web holds no database
  // credentials at all. Without the brain running, every authenticated spec
  // silently stays on /login?redirect=... — which is exactly how the suite
  // used to "pass" while never exercising auth.
  const stack = buildE2eStack({
    env: { STOCK_INSIGHT_E2E_DATABASE_URL: disposableDatabaseUrl },
    webPort: 18300,
    apiPort: 18301,
  });

  assert.equal(stack.apiServer.port, 18301);
  assert.match(stack.apiServer.command, /api-server/);
  assert.equal(stack.apiServer.env.STOCK_INSIGHT_API_PORT, '18301');
  // main.ts listens on env.port, which parseApiServerEnv reads from PORT.
  // Setting only STOCK_INSIGHT_API_PORT makes the brain silently bind 6200 and
  // the readiness probe then waits forever on the wrong port.
  assert.equal(stack.apiServer.env.PORT, '18301');
  assert.equal(stack.apiServer.env.DATABASE_READ_URL, disposableDatabaseUrl);
  assert.equal(stack.webServer.env.STOCK_INSIGHT_BRAIN_URL, 'http://127.0.0.1:18301');
  // Both processes must agree on the signing secret or every brain call 401s.
  assert.ok(stack.internalContextSecret.length >= 32);
  // The brain only accepts the secret via a file (STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE),
  // so the stack must materialise one and hand both processes the same value.
  assert.ok(stack.internalContextSecretFile.startsWith('/'));
  assert.ok(
    stack.internalContextSecretFile.startsWith(`${userInfo().homedir}/.hermes/run/`),
    'E2E secret must not follow TMPDIR onto a permissive filesystem',
  );
  assert.equal(
    readFileSync(stack.apiServer.env.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE, 'utf8').trim(),
    stack.webServer.env.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET,
  );
  assert.equal(statSync(stack.internalContextSecretFile).mode & 0o777, 0o600);
  stack.cleanup();
});

test('E2E stack refuses to run the brain against the production database', () => {
  for (const value of [
    'postgresql://stock_insight_app_writer@127.0.0.1:55432/research_app',
    'postgresql://research_app@insight-db.jigooo.com:5432/research_app',
  ]) {
    assert.throws(
      () => buildE2eStack({ env: { STOCK_INSIGHT_E2E_DATABASE_URL: value } }),
      /E2E refused/,
      `must refuse production DSN: ${value}`,
    );
  }
});

test('E2E stack never leaks live-mode credentials into the brain', () => {
  const stack = buildE2eStack({
    env: {
      STOCK_INSIGHT_E2E_DATABASE_URL: disposableDatabaseUrl,
      PGPASSFILE: '/home/someone/.hermes/secrets/stock-insight-live-dev/pgpass',
      DATABASE_WRITE_URL: 'postgresql://stock_insight_app_writer@127.0.0.1:55432/research_app',
      STOCK_INSIGHT_LIVE_DATABASE_EXPECTED: 'true',
    },
    webPort: 18302,
    apiPort: 18303,
  });
  assert.equal(stack.apiServer.env.PGPASSFILE, undefined);
  assert.equal(stack.apiServer.env.DATABASE_WRITE_URL, undefined);
  assert.equal(stack.apiServer.env.STOCK_INSIGHT_LIVE_DATABASE_EXPECTED, 'false');
  stack.cleanup();
});

test('E2E stack rejects hostile environment names and never forwards E2E credentials to servers', () => {
  const hostileKey = 'STOCK_INSIGHT_E2E_X; touch /tmp/e2e-env-injected';
  const stack = buildE2eStack({
    env: {
      STOCK_INSIGHT_E2E_DATABASE_URL: disposableDatabaseUrl,
      STOCK_INSIGHT_E2E_USERNAME: 'candidate',
      [hostileKey]: '1',
    },
    webPort: 18308,
    apiPort: 18309,
  });
  assert.equal(stack.apiServer.env.STOCK_INSIGHT_E2E_USERNAME, undefined);
  assert.equal(stack.webServer.env.STOCK_INSIGHT_E2E_USERNAME, undefined);
  assert.equal(stack.apiServer.env[hostileKey], undefined);
  stack.cleanup();
});

test('E2E stack does not hand the raw QA DSN to children twice', () => {
  // The DSN carries the QA password. The brain already receives it as
  // DATABASE_READ_URL; re-exporting STOCK_INSIGHT_E2E_DATABASE_URL widens the
  // blast radius to the sandboxed BFF and anything that inherits its env.
  const stack = buildE2eStack({
    env: { STOCK_INSIGHT_E2E_DATABASE_URL: disposableDatabaseUrl },
    webPort: 18304,
    apiPort: 18305,
  });
  assert.equal(stack.apiServer.env.STOCK_INSIGHT_E2E_DATABASE_URL, undefined);
  assert.equal(stack.webServer.env.STOCK_INSIGHT_E2E_DATABASE_URL, undefined);
  assert.equal(stack.webServer.env.DATABASE_READ_URL, undefined);
  stack.cleanup();
});

test('E2E stack cleans up its per-run secret directory', () => {
  const stack = buildE2eStack({
    env: { STOCK_INSIGHT_E2E_DATABASE_URL: disposableDatabaseUrl },
    webPort: 18306,
    apiPort: 18307,
  });
  assert.equal(typeof stack.cleanup, 'function');
  assert.ok(existsSync(stack.internalContextSecretFile));
  stack.cleanup();
  assert.equal(
    existsSync(stack.internalContextSecretFile),
    false,
    'a run must not leave its signing secret on disk',
  );
  stack.cleanup(); // idempotent
});

test('Playwright config wires the brain into its webServer list', () => {
  const config = readFileSync(
    fileURLToPath(new URL('../playwright.config.ts', import.meta.url)),
    'utf8',
  );
  assert.match(config, /buildE2eStack/, 'playwright config must build the full E2E stack');
  assert.match(config, /e2e-server-launcher\.mjs api/);
  assert.match(config, /e2e-server-launcher\.mjs web-production/);
  assert.doesNotMatch(config, /buildEnvPrefix|STOCK_INSIGHT_APP_ORIGIN=\$\{/);
  // The brain must be listed before the web server so it is already listening
  // when the first login request arrives.
  assert.match(config, /\[brainServerConfig, webServerConfig\]/, 'brain must start before the BFF');
  assert.match(config, /stack\.apiServer\.env/, 'the brain must run with the stack-built env');
  assert.match(config, /stack\.webServer\.env/, 'the BFF must inherit the stack-built env');
});

test('auth specs read the same credential names the secret file provides', () => {
  // The secret file ships STOCK_INSIGHT_E2E_USERNAME/PASSWORD. A spec reading a
  // different name silently test.skip()s, so auth coverage disappears without
  // any failure to notice.
  const spec = readFileSync(
    fileURLToPath(new URL('../e2e/auth-login.spec.ts', import.meta.url)),
    'utf8',
  );
  assert.match(spec, /STOCK_INSIGHT_E2E_USERNAME/);
  assert.match(spec, /STOCK_INSIGHT_E2E_PASSWORD/);
});
