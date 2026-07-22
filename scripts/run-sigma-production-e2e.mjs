import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashProductionArtifact } from './production-artifact-hash.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const productionOutput = new URL('../apps/web/.output/', import.meta.url);

// Ambient grep/worker/skip knobs would let the release gate pass a reduced or
// fully-skipped suite. Strip them and pin our own values so the gate is total.
for (const key of ['PLAYWRIGHT_GREP', 'PLAYWRIGHT_GREP_INVERT', 'PLAYWRIGHT_SKIP_WEB_SERVER']) {
  delete process.env[key];
}

const artifactSha256 = hashProductionArtifact(productionOutput);
console.log(`sigma_production_artifact_sha256=${artifactSha256}`);

// Exclusive-create the auth-state file at an unpredictable path so a local
// attacker cannot pre-plant a symlink to capture the session cookie. O_EXCL
// (openSync 'wx') refuses to follow or reuse an existing path.
const authStatePath = join(
  tmpdir(),
  `stock-insight-sigma-auth-${randomBytes(16).toString('hex')}.json`,
);
closeSync(openSync(authStatePath, 'wx', 0o600));

const reportPath = join(
  tmpdir(),
  `stock-insight-sigma-report-${randomBytes(8).toString('hex')}.json`,
);

try {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'e2e/relation-sigma.spec.ts',
      '--project=desktop',
      '--project=mobile',
      '--reporter=json',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
        PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? '8095',
        PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256: artifactSha256,
        PLAYWRIGHT_SIGMA_AUTH_STATE: authStatePath,
        PLAYWRIGHT_USE_PRODUCTION_BUILD: '1',
        PLAYWRIGHT_WORKERS: process.env.PLAYWRIGHT_WORKERS ?? '1',
      },
      stdio: ['inherit', 'inherit', 'inherit'],
    },
  );
  if (result.error) throw result.error;

  // Fail closed on the actual outcome, not just the exit code: require that
  // every test ran (zero skipped) and produced an expected pass.
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const stats = report.stats ?? {};
  const counts = { expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const status = test.status ?? 'unknown';
        if (status === 'expected' && test.expectedStatus !== 'passed') counts.unexpected += 1;
        else if (status in counts) counts[status] += 1;
        else counts.unexpected += 1;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);

  const EXPECTED_TESTS = 10;
  const failures = [];
  if (counts.unexpected > 0) failures.push(`${counts.unexpected} unexpected`);
  if (counts.skipped > 0 || (stats.skipped ?? 0) > 0) {
    failures.push(`${counts.skipped || stats.skipped} skipped`);
  }
  if (counts.flaky > 0) failures.push(`${counts.flaky} flaky`);
  if (counts.expected !== EXPECTED_TESTS) {
    failures.push(`${counts.expected} passed (need exactly ${EXPECTED_TESTS})`);
  }
  const reportPassed =
    (stats.expected ?? 0) === EXPECTED_TESTS &&
    (stats.unexpected ?? 0) === 0 &&
    (stats.skipped ?? 0) === 0 &&
    (stats.flaky ?? 0) === 0 &&
    (report.errors?.length ?? 0) === 0;
  if (!reportPassed) failures.push('JSON report did not converge to an all-passed result');

  console.log(
    `sigma_production_e2e expected=${counts.expected} skipped=${counts.skipped} ` +
      `unexpected=${counts.unexpected} flaky=${counts.flaky}`,
  );

  if (result.status !== 0 || failures.length > 0) {
    console.error(
      `sigma_production_e2e FAILED: ${failures.join(', ') || 'runner exit ' + result.status}`,
    );
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
} finally {
  rmSync(authStatePath, { force: true });
  rmSync(reportPath, { force: true });
}

// Surface the auth file's residual permissions in case of an earlier crash.
try {
  statSync(authStatePath);
  rmSync(authStatePath, { force: true });
} catch {
  // already gone — expected
}
