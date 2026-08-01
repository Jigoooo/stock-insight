import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertSafeE2eConfiguration, resolvePlaywrightBaseUrl } from './e2e-safety.mjs';

const productionAck = 'I_ACKNOWLEDGE_PRODUCTION_WRITES';
const existingServerAck = 'I_ACKNOWLEDGE_EXISTING_SERVER';

test('E2E safety rejects production-like database URLs without explicit mutation acknowledgement', () => {
  for (const [key, value] of [
    ['DATABASE_URL', 'postgresql://research_app@127.0.0.1:55432/research_app'],
    ['DATABASE_READ_URL', 'postgresql://stock_insight_app_reader@127.0.0.1:55432/research_app'],
    [
      'DATABASE_WRITE_URL',
      'postgresql://stock_insight_app_writer@insight-db.jigooo.com:5432/research_app',
    ],
  ]) {
    assert.throws(() => assertSafeE2eConfiguration({ [key]: value }), /E2E refused/);
  }
});

test('E2E safety rejects live flags and external server reuse by default', () => {
  assert.throws(
    () => assertSafeE2eConfiguration({ STOCK_INSIGHT_MUTATIONS_ENABLED: 'true' }),
    /E2E refused/,
  );
  assert.throws(
    () => assertSafeE2eConfiguration({ PLAYWRIGHT_SKIP_WEB_SERVER: '1' }),
    /existing server/,
  );
});

test('E2E safety allows isolated databases and requires exact acknowledgements', () => {
  const isolated = assertSafeE2eConfiguration({
    DATABASE_URL: 'postgresql://qa@127.0.0.1:55432/stock_insight_p6_production_deadbeef',
  });
  assert.equal(isolated.allowProductionWrites, false);

  const acknowledged = assertSafeE2eConfiguration({
    DATABASE_URL: 'postgresql://research_app@127.0.0.1:55432/research_app',
    PLAYWRIGHT_SKIP_WEB_SERVER: '1',
    STOCK_INSIGHT_E2E_PRODUCTION_MUTATION_ACK: productionAck,
    STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK: existingServerAck,
  });
  assert.deepEqual(acknowledged, {
    allowExistingServer: true,
    allowProductionWrites: true,
  });
});

test('Playwright web server command severs ambient env inheritance', () => {
  // Playwright merges its webServer.env ON TOP of process.env
  // (runner/index.js: { ...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...env }).
  // An allowlist object therefore only OVERRIDES keys — it cannot remove an
  // ambient DATABASE_URL / PGPASSFILE, so production credentials would still
  // reach the web server. A fixed launcher must rebuild an allowlisted child
  // environment in memory and spawn without a shell.
  const config = readFileSync(
    fileURLToPath(new URL('../playwright.config.ts', import.meta.url)),
    'utf8',
  );
  const launcher = readFileSync(
    fileURLToPath(new URL('./e2e-server-launcher.mjs', import.meta.url)),
    'utf8',
  );
  assert.match(config, /e2e-server-launcher\.mjs web-(?:dev|production)/);
  assert.match(launcher, /shell:\s*false/);
  assert.match(launcher, /selectServerEnvironment/);
  assert.doesNotMatch(
    config,
    /DATABASE_READ_URL=.*\$\{|STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET=.*\$\{/,
  );
});

test('E2E safety refuses every production DSN variant that reaches the live cluster', () => {
  // The tunnel is reachable on any local port, over IPv6, via a unix socket, and
  // hostnames/schemes are case-insensitive. Anchoring the check on one port or
  // one spelling lets a destructive suite through to the real research_app.
  for (const value of [
    'postgresql://stock_insight_app_writer@127.0.0.1:15432/research_app',
    'postgresql://stock_insight_app_writer@[::1]:55432/research_app',
    'postgresql://research_app@localhost:5433/research_app',
    'POSTGRESQL://research_app@127.0.0.1:55432/research_app',
    'postgresql://research_app@INSIGHT-DB.JIGOOO.COM:5432/research_app',
    'postgresql://research_app@insight-db.jigooo.com./research_app',
    'postgresql://research_app@%31%32%37.0.0.1:55432/research_app',
    'postgresql:///research_app?host=/var/run/postgresql',
    'postgresql://stock_insight_app_writer@10.0.0.5:5432/research_app',
  ]) {
    assert.throws(
      () => assertSafeE2eConfiguration({ DATABASE_URL: value }),
      /E2E refused/,
      `must refuse production DSN variant: ${value}`,
    );
  }
});

test('E2E safety refuses DSN query parameters that can override parsed connection fields', () => {
  // node-postgres/pg-connection-string reads query fields before URL
  // credentials and uses some of them preferentially (notably host/user).
  // E2E uses a local QA DSN and needs no query parameters at all.
  for (const query of [
    'db=research_app',
    'database=research_app',
    'user=stock_insight_app_writer',
    'host=insight-db.jigooo.com',
    'port=5432',
    'options=-c%20search_path%3Dpublic',
    'sslkey=%2Fhome%2Fuser%2Fsecret.key',
  ]) {
    const value = `postgresql://qa@127.0.0.1:55432/stock_insight_e2e_deadbeef?${query}`;
    assert.throws(
      () => assertSafeE2eConfiguration({ DATABASE_URL: value }),
      /E2E refused/,
      `must refuse query-bearing DSN: ${value}`,
    );
  }
});

test('E2E safety still allows genuinely disposable QA databases', () => {
  for (const value of [
    'postgresql://qa@127.0.0.1:55432/stock_insight_p6_production_deadbeef',
    'postgresql://qa@127.0.0.1:55432/stock_insight_test_abc123',
  ]) {
    const result = assertSafeE2eConfiguration({ DATABASE_URL: value });
    assert.equal(result.allowProductionWrites, false);
  }
});

test('E2E safety refuses disposable DSNs that rely on libpq identity or address defaults', () => {
  for (const value of [
    'postgresql://127.0.0.1:55432/stock_insight_e2e_deadbeef',
    'postgresql://qa@/stock_insight_e2e_deadbeef',
    'postgresql://qa@127.0.0.1/stock_insight_e2e_deadbeef',
  ]) {
    assert.throws(
      () => assertSafeE2eConfiguration({ DATABASE_URL: value }),
      /production-like mutation context/,
    );
  }
});

test('managed Playwright servers ignore a requested foreign base URL', () => {
  assert.equal(
    resolvePlaywrightBaseUrl({ PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:19999' }, 18302),
    'http://127.0.0.1:18302',
  );
  assert.equal(
    resolvePlaywrightBaseUrl(
      {
        PLAYWRIGHT_SKIP_WEB_SERVER: '1',
        PLAYWRIGHT_BASE_URL: 'https://preview.example.test',
      },
      18302,
    ),
    'https://preview.example.test',
  );
});
