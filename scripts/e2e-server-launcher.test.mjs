import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildServerProcess,
  describeBuildFreshness,
  newestInputMtime,
  selectServerEnvironment,
  WEB_BUILD_ENTRY,
} from './e2e-server-launcher.mjs';

test('server launcher strips ambient database credentials from the web child', () => {
  const selected = selectServerEnvironment('web-dev', {
    HOME: '/home/test',
    PATH: '/usr/bin',
    PORT: '18302',
    PLAYWRIGHT_E2E: '1',
    VITE_ENABLE_DEV_PREVIEW: '1',
    VITE_ENABLE_UI_LAB: '1',
    STOCK_INSIGHT_BRAIN_URL: 'http://127.0.0.1:18301',
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET: 'ephemeral-secret',
    DATABASE_READ_URL: 'postgresql://must-not-pass',
    DATABASE_WRITE_URL: 'postgresql://must-not-pass',
    PGPASSFILE: '/must/not/pass',
    NODE_OPTIONS: '--require=/tmp/evil.cjs',
  });

  assert.equal(selected.DATABASE_READ_URL, undefined);
  assert.equal(selected.DATABASE_WRITE_URL, undefined);
  assert.equal(selected.PGPASSFILE, undefined);
  assert.equal(selected.NODE_OPTIONS, undefined);
  assert.equal(selected.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET, 'ephemeral-secret');
  assert.equal(selected.VITE_ENABLE_DEV_PREVIEW, '1');
  assert.equal(selected.VITE_ENABLE_UI_LAB, '1');
});

test('server launcher keeps the UI Lab flag out of the production web child', () => {
  const selected = selectServerEnvironment('web-production', {
    PATH: '/usr/bin',
    NODE_ENV: 'production',
    PORT: '18302',
    VITE_ENABLE_DEV_PREVIEW: '1',
    VITE_ENABLE_UI_LAB: '1',
  });

  assert.equal(selected.NODE_ENV, 'production');
  assert.equal(selected.VITE_ENABLE_DEV_PREVIEW, undefined);
  assert.equal(selected.VITE_ENABLE_UI_LAB, undefined);
});

test('server launcher keeps secrets out of child argv', () => {
  const secret = "qa-secret'; touch /tmp/e2e-argv-injected";
  const spec = buildServerProcess('api', {
    PATH: '/usr/bin',
    DATABASE_READ_URL: `postgresql://qa:${secret}@127.0.0.1/stock_insight_e2e_deadbeef`,
    STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: '/home/test/internal-context.secret',
    PORT: '18301',
  });

  assert.equal(spec.command, process.execPath);
  assert.deepEqual(spec.args, ['apps/api-server/dist/main.js']);
  assert.doesNotMatch(spec.args.join(' '), /qa-secret|postgresql|internal-context/);
  assert.match(spec.env.DATABASE_READ_URL, /qa-secret/);
  assert.equal(spec.env.HOME, undefined);
  assert.equal(spec.env.USER, undefined);
  assert.equal(spec.env.LOGNAME, undefined);
});

test('web launcher passes port as a fixed argv element, not a shell fragment', () => {
  const spec = buildServerProcess('web-dev', {
    PATH: '/usr/bin',
    PORT: '18302',
    PLAYWRIGHT_E2E: '1',
  });
  assert.equal(spec.command, 'pnpm');
  assert.equal(spec.args[spec.args.indexOf('--port') + 1], '18302');
});

// `web-production` serves a prebuilt bundle. A contrast fix was "verified" three
// times in a row on 2026-08-05 against an `.output` a day older than the fix, so
// a build older than its sources has to be an error, not a silent pass.
const HOUR = 60 * 60 * 1000;
const AT = Date.UTC(2026, 7, 5, 12, 0, 0);

test('a web production build older than its sources is rejected', () => {
  const verdict = describeBuildFreshness({
    buildMtimeMs: AT - HOUR,
    newestInput: { path: 'apps/web/public/styles/profiles/market-graphite.css', mtimeMs: AT },
  });

  assert.equal(verdict.fresh, false);
  // The operator has to be able to see WHICH file outran the build and by how
  // much; "stale" on its own sends them looking in the wrong place.
  assert.match(verdict.message, /market-graphite\.css/);
  assert.match(verdict.message, /2026-08-05T11:00:00\.000Z/);
  assert.match(verdict.message, /2026-08-05T12:00:00\.000Z/);
  assert.match(verdict.message, /pnpm --filter @stock-insight\/web build/);
});

test('a missing web production build is rejected rather than spawned', () => {
  const verdict = describeBuildFreshness({ buildMtimeMs: null, newestInput: null });

  assert.equal(verdict.fresh, false);
  assert.match(verdict.message, new RegExp(WEB_BUILD_ENTRY.replaceAll('/', '\\/')));
});

test('a web production build newer than its sources is accepted', () => {
  const verdict = describeBuildFreshness({
    buildMtimeMs: AT,
    newestInput: { path: 'apps/web/src/main.tsx', mtimeMs: AT - HOUR },
  });

  assert.equal(verdict.fresh, true);
  assert.equal(verdict.message, null);
});

test('an equal timestamp counts as fresh — a source touched mid-build is indistinguishable', () => {
  const verdict = describeBuildFreshness({
    buildMtimeMs: AT,
    newestInput: { path: 'apps/web/src/main.tsx', mtimeMs: AT },
  });

  assert.equal(verdict.fresh, true);
});

test('input scan takes the newest real source and ignores vendored and generated trees', () => {
  const root = mkdtempSync(join(tmpdir(), 'launcher-freshness-'));
  try {
    const touch = (relative, epochSeconds) => {
      const absolute = join(root, relative);
      mkdirSync(join(absolute, '..'), { recursive: true });
      writeFileSync(absolute, '');
      utimesSync(absolute, epochSeconds, epochSeconds);
    };
    touch('apps/web/src/old.tsx', 1_000);
    touch('apps/web/src/nested/new.tsx', 3_000);
    touch('apps/web/public/styles/theme.css', 2_000);
    // Neither of these says anything about whether OUR sources moved.
    touch('apps/web/src/node_modules/vendored/index.js', 9_000);
    touch('apps/web/src/.cache/generated.js', 9_000);

    const newest = newestInputMtime(['apps/web/src', 'apps/web/public', 'apps/web/missing'], root);

    assert.equal(newest.path, join('apps/web/src', 'nested', 'new.tsx'));
    assert.equal(newest.mtimeMs, 3_000_000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
