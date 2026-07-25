import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('../../../', import.meta.url).pathname;
const wrapper = join(repoRoot, 'apps/api/scripts/run_company_fundamentals.sh');

function executable(path: string, body: string): void {
  writeFileSync(path, body, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function runWrapper(gateResult: '0' | '1', runnerOutput?: string) {
  const root = mkdtempSync(join(tmpdir(), 'fundamentals-wrapper-'));
  const bin = join(root, 'bin');
  const runtime = join(root, 'runtime');
  const log = join(root, 'psql.log');
  const countFile = join(root, 'psql.count');
  const fixture = join(root, 'sec-result.json');
  try {
    executable(
      join(root, 'mkdir-bin.sh'),
      `#!/usr/bin/env bash\nmkdir -p ${JSON.stringify(bin)} ${JSON.stringify(runtime)}\nchmod 700 ${JSON.stringify(runtime)}\n`,
    );
    spawnSync('bash', [join(root, 'mkdir-bin.sh')], { stdio: 'inherit' });
    writeFileSync(
      fixture,
      runnerOutput ??
        JSON.stringify({
          mode: 'apply',
          runId: 'sec-edgar-20260725-101010000Z',
          cacheRunId: 'sec-edgar-20260725-101010000Z-cache',
          liveStatus: 'transient_cache_fallback',
          cacheFallback: { rowsWritten: 32, rowsSkipped: 3 },
        }),
    );
    executable(join(bin, 'curl'), '#!/usr/bin/env bash\nexit 0\n');
    executable(
      join(bin, 'psql'),
      `#!/usr/bin/env bash\nset -eu\nprintf '%s\\n' "$*" >>${JSON.stringify(log)}\ncount=0\n[[ ! -f ${JSON.stringify(countFile)} ]] || count=$(cat ${JSON.stringify(countFile)})\ncount=$((count + 1))\nprintf '%s' "$count" >${JSON.stringify(countFile)}\nif [[ "$count" == 1 ]]; then printf '1\\n'; else printf '%s\\n' "\${PSQL_GATE_RESULT}"; fi\n`,
    );
    executable(
      join(bin, 'node'),
      `#!/usr/bin/env bash\nfor arg in "$@"; do if [[ "$arg" == *run-sec-edgar.ts ]]; then cat ${JSON.stringify(fixture)}; exit 0; fi; done\nexec ${JSON.stringify(process.execPath)} "$@"\n`,
    );

    const result = spawnSync('bash', [wrapper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        XDG_RUNTIME_DIR: runtime,
        STOCK_INSIGHT_ROOT: repoRoot,
        STOCK_INSIGHT_DATABASE_URL: 'postgresql://test.invalid/research_app',
        PSQL_GATE_RESULT: gateResult,
      },
    });
    return { result, psqlLog: readFileSync(log, 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('fundamentals wrapper binds a successful cache fallback gate to the current cache run id', () => {
  const { result, psqlLog } = runWrapper('1');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /fresh cache fallback was applied; quality gate passed/i);
  assert.match(psqlLog, /sec-edgar-20260725-101010000Z-cache/);
  assert.match(psqlLog, /rows_written >= 30/);
  assert.doesNotMatch(
    psqlLog,
    /source_system = 'sec-edgar'\s+AND status = 'completed'\s+AND rows_written >= 30/,
  );
});

test('fundamentals wrapper exits nonzero when the current-run quality gate fails', () => {
  const { result } = runWrapper('0');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /quality gate passed/i);
});

test('fundamentals wrapper fails closed when a successful SEC process writes no result', () => {
  const { result } = runWrapper('1', '');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /empty SEC result/i);
});

test('fundamentals wrapper rejects a live current run with fewer than 30 metric groups', () => {
  const { result, psqlLog } = runWrapper(
    '1',
    JSON.stringify({
      mode: 'apply',
      runId: 'sec-edgar-20260725-111111000Z',
      cacheRunId: null,
      liveStatus: 'available',
      audit: { metricGroups: 29 },
    }),
  );
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(psqlLog, /sec-edgar-20260725-111111000Z/);
});

test('fundamentals wrapper binds live quality to current-run summary metric groups', () => {
  const { result, psqlLog } = runWrapper(
    '1',
    JSON.stringify({
      mode: 'apply',
      runId: 'sec-edgar-20260725-121212000Z',
      cacheRunId: null,
      liveStatus: 'available',
      audit: { metricGroups: 79 },
    }),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(psqlLog, /sec-edgar-20260725-121212000Z/);
  assert.match(psqlLog, /summary ->> 'metricGroups'/);
});
