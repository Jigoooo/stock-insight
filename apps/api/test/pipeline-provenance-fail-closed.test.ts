import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import pg from 'pg';

const common = new URL('../scripts/pipeline_common.sh', import.meta.url).pathname;
const databaseUrl = process.env.STOCK_INSIGHT_MIGRATION_TEST_DB_URL;

test('pipeline stage provenance fails closed and fingerprints wrapper plus tracked source tree', async () => {
  const source = await readFile(common, 'utf8');
  assert.doesNotMatch(source, /echo unknown/);
  assert.match(source, /rev-parse --verify HEAD/);
  assert.match(source, /source_tree_hash/);
  assert.match(source, /BASH_SOURCE\[0\]/);
  assert.match(source, /wrapper_script/);
  assert.match(source, /rev-parse --show-toplevel/);
  assert.match(source, /ls-files --error-unmatch/);
  assert.match(source, /wrapper_attempt[\s\S]*code_commit[\s\S]*source_tree_hash/);
  assert.match(source, /wrapper_status' = 'failed'[\s\S]*code_commit[\s\S]*source_tree_hash/);
  assert.match(source, /pipeline_finish_wrapper_attempt\(\)[\s\S]*pipeline_resolve_provenance/);
  assert.match(source, /summary ->> 'wrapper_script' = :'finish_wrapper_script'/);

  const root = await mkdtemp(join(tmpdir(), 'pipeline-provenance-'));
  const bin = join(root, 'bin');
  const marker = join(root, 'psql-called');
  const wrapper = join(root, 'wrapper.sh');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(bin));
  await writeFile(join(bin, 'git'), '#!/usr/bin/env bash\nexit 41\n');
  await writeFile(
    join(bin, 'psql'),
    `#!/usr/bin/env bash\ntouch ${JSON.stringify(marker)}\nexit 0\n`,
  );
  await chmod(join(bin, 'git'), 0o700);
  await chmod(join(bin, 'psql'), 0o700);
  await writeFile(
    wrapper,
    `#!/usr/bin/env bash\nset -euo pipefail\nROOT=${JSON.stringify(root)}\nDB_URL=postgresql://fixture\nsource ${JSON.stringify(common)}\npipeline_record_stage_success fixture-stage 2026-07-20T00:00:00Z\n`,
  );
  await chmod(wrapper, 0o700);

  try {
    const result = spawnSync('bash', [wrapper], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pipeline provenance rejects a tracked launcher that sources common code outside ROOT', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-wrong-root-'));
  const bin = join(root, 'bin');
  const marker = join(root, 'psql-called');
  const wrapper = join(root, 'wrapper.sh');
  await mkdir(bin);
  await writeFile(
    join(bin, 'psql'),
    `#!/usr/bin/env bash\ntouch ${JSON.stringify(marker)}\ncat >/dev/null\nexit 0\n`,
  );
  await chmod(join(bin, 'psql'), 0o700);
  await writeFile(
    wrapper,
    `#!/usr/bin/env bash\nset -euo pipefail\nROOT=${JSON.stringify(root)}\nDB_URL=postgresql://fixture\nsource ${JSON.stringify(common)}\npipeline_record_stage_success fixture-stage 2026-07-20T00:00:00Z\n`,
  );
  await chmod(wrapper, 0o700);
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 'fixture@example.invalid'],
    ['config', 'user.name', 'Fixture'],
    ['add', 'wrapper.sh'],
    ['commit', '-qm', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }

  try {
    const result = spawnSync('bash', [wrapper], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'wrapper completion rejects a different tracked caller even with a valid run id',
  { skip: databaseUrl ? false : 'STOCK_INSIGHT_MIGRATION_TEST_DB_URL is required' },
  async () => {
    assert.ok(databaseUrl);
    const root = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
    const analytics = join(root, 'apps/api/scripts/run_analytics_pipeline.sh');
    const probe = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail
ROOT=${JSON.stringify(root)}
COMMON=${JSON.stringify(common)}
source "$COMMON"
started=$(pipeline_db_now)
pipeline_start_wrapper_attempt fixture-caller-binding "$started"
run_id="$PIPELINE_WRAPPER_ATTEMPT_ID"
if bash -c 'ROOT="$2"; source "$3"; pipeline_finish_wrapper_attempt "$1" completed' "$0" "$run_id" "$ROOT" "$COMMON"; then
  echo 'spoofed completion unexpectedly succeeded' >&2
  exit 88
fi
state=$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt -c "SELECT status FROM public.migration_runs WHERE run_id='$run_id'")
[[ "$state" = 'running' ]]
pipeline_finish_wrapper_attempt "$run_id" completed
printf '%s\n' "$run_id"`,
        analytics,
      ],
      { encoding: 'utf8', env: { ...process.env, DB_URL: databaseUrl } },
    );
    assert.equal(probe.status, 0, probe.stderr);
    const runId = probe.stdout.trim();
    assert.match(runId, /^wrapper-attempt-/);

    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const completed = await client.query(
        'SELECT status FROM public.migration_runs WHERE run_id=$1',
        [runId],
      );
      assert.equal(completed.rows[0]?.status, 'completed');
    } finally {
      await client.query(
        `UPDATE public.migration_runs
         SET status='failed',finished_at=clock_timestamp(),error='test_cleanup'
         WHERE run_id=$1 AND status='running'`,
        [runId],
      );
      await client.end();
    }
  },
);
