import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = new URL('../../../scripts/p0-10-raw-object-durability.sh', import.meta.url).pathname;

function run(scriptPath: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync('bash', [scriptPath, ...args], { encoding: 'utf8', env });
}

test('P0 raw-object durability is fail-closed and verifies the physical replica by hash', async () => {
  const source = await readFile(script, 'utf8');
  assert.match(source, /PRIMARY_ROOT="\$\{PRIMARY_ROOT:-/);
  assert.match(source, /PSQL_BIN="\$\{PSQL_BIN:-psql\}"/);
  assert.match(source, /RSYNC_BIN="\$\{RSYNC_BIN:-rsync\}"/);
  assert.match(source, /--checksum/);
  assert.doesNotMatch(source, /done\s*<\s*<\(/);

  const root = await mkdtemp(join(tmpdir(), 'p0-raw-durability-'));
  const primary = join(root, 'primary');
  const replica = join(root, 'replica');
  const fakePsql = join(root, 'fake-psql');
  await mkdir(primary);
  await mkdir(replica);
  await writeFile(
    fakePsql,
    '#!/usr/bin/env bash\nif [[ "${FAKE_PSQL_MODE:-ok}" == fail ]]; then exit 41; fi\nprintf "%s\\n" "$FIXTURE_URI"\n',
  );
  await chmod(fakePsql, 0o700);
  const baseEnv = {
    ...process.env,
    PRIMARY_ROOT: primary,
    REPLICA_ROOT: replica,
    PSQL_BIN: fakePsql,
  };

  try {
    const dbFailure = run(script, ['--scrub-only'], {
      ...baseEnv,
      FAKE_PSQL_MODE: 'fail',
      FIXTURE_URI: 'file:///unused',
    });
    assert.notEqual(dbFailure.status, 0);
    assert.match(dbFailure.stderr, /query failed/i);

    const outsideFile = join(root, 'outside.bin');
    await writeFile(outsideFile, 'outside');
    const outside = run(script, ['--scrub-only'], {
      ...baseEnv,
      FIXTURE_URI: `file://${outsideFile}`,
    });
    assert.notEqual(outside.status, 0);
    assert.match(outside.stderr, /outside primary root/i);

    const payload = Buffer.from('replicated evidence');
    const digest = createHash('sha256').update(payload).digest('hex');
    const primaryFile = join(primary, digest);
    const replicaFile = join(replica, digest);
    await writeFile(primaryFile, payload);
    await writeFile(replicaFile, 'corrupt replica');
    const scrub = run(script, ['--scrub-only'], {
      ...baseEnv,
      FIXTURE_URI: `file://${primaryFile}`,
    });
    assert.notEqual(scrub.status, 0);
    assert.match(scrub.stderr, /replica corrupt/i);

    const repaired = run(script, [], {
      ...baseEnv,
      FIXTURE_URI: `file://${primaryFile}`,
    });
    assert.equal(repaired.status, 0, repaired.stderr);
    const summary = JSON.parse(repaired.stdout) as {
      scrub: { total: number; ok: number; missing: number; corrupt: number; outside: number };
      replica: { ok: number; missing: number; corrupt: number };
    };
    assert.deepEqual(summary.scrub, { total: 1, ok: 1, missing: 0, corrupt: 0, outside: 0 });
    assert.deepEqual(summary.replica, { ok: 1, missing: 0, corrupt: 0 });
    assert.deepEqual(await readFile(replicaFile), payload);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
