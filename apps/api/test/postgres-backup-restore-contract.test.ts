import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('../../../', import.meta.url).pathname;
const restoreScript = readFileSync(
  join(repoRoot, 'ops/scripts/verify-research-app-restore.sh'),
  'utf8',
);
const backupScript = readFileSync(
  join(repoRoot, 'ops/scripts/backup-research-app-logical.sh'),
  'utf8',
);
const backupService = readFileSync(
  join(repoRoot, 'ops/systemd/user/research-app-logical-backup.service'),
  'utf8',
);
const backupTimer = readFileSync(
  join(repoRoot, 'ops/systemd/user/research-app-logical-backup.timer'),
  'utf8',
);
const backupContract = readFileSync(
  join(repoRoot, 'ops/scripts/research-app-backup-contract.py'),
  'utf8',
);
const snapshotKeeper = readFileSync(
  join(repoRoot, 'ops/scripts/export-research-app-snapshot.mjs'),
  'utf8',
);
const pgBackRestConfig = readFileSync(
  join(repoRoot, 'ops/config/pgbackrest-research-app.conf'),
  'utf8',
);
const pgBackRestCompose = readFileSync(
  join(repoRoot, 'ops/compose/research-app-pgbackrest.override.yml'),
  'utf8',
);
const pgBackRestDrill = readFileSync(
  join(repoRoot, 'ops/scripts/verify-research-app-pgbackrest-restore.sh'),
  'utf8',
);

function sha256(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function writeStrictBackup(directory: string, sequenceCount = 1): void {
  const dump = 'fake-custom-dump';
  const globals = '-- globals\n';
  const metadata = `FORMAT_VERSION=3
POSTGRES_IMAGE=example/postgres@sha256:${'a'.repeat(64)}
POSTGRES_VERSION=16.14
SOURCE_TIMESCALE_VERSION=2.28.2
SOURCE_POSTGIS_VERSION=3.6.4
SOURCE_VECTOR_VERSION=0.8.5
SOURCE_GLOBALS_SHA256=${'b'.repeat(64)}
DATABASE_OWNER=research_app
SOURCE_CONTENT_PACK_ITEMS=1
SOURCE_SEALED_DERIVATIONS=1
SOURCE_INVALID_INDEXES=0
SOURCE_HYPERTABLES=1
SOURCE_TIMESCALE_JOBS=1
DUMP_SEQUENCE_COUNT=${sequenceCount}
SOURCE_CAPTURED_AT=2026-07-25T00:00:00Z
`;
  writeFileSync(join(directory, 'research_app.dump'), dump);
  writeFileSync(join(directory, 'globals.sql'), globals);
  writeFileSync(join(directory, 'RESTORE_METADATA'), metadata);
  writeFileSync(
    join(directory, 'SHA256SUMS'),
    `${sha256(dump)}  research_app.dump\n${sha256(globals)}  globals.sql\n${sha256(metadata)}  RESTORE_METADATA\n`,
  );
}

function executable(path: string, body: string): void {
  writeFileSync(path, body, { mode: 0o700 });
  chmodSync(path, 0o700);
}

test('restore proof starts outside the target DB and recreates the source extension version', () => {
  assert.match(restoreScript, /POSTGRES_DB=postgres/);
  assert.match(restoreScript, /DATABASE_OWNER/);
  assert.match(restoreScript, /CREATE DATABASE research_app OWNER.*TEMPLATE template0/);
  assert.match(restoreScript, /SOURCE_TIMESCALE_VERSION/);
  assert.match(restoreScript, /CREATE EXTENSION timescaledb VERSION/);
  assert.doesNotMatch(restoreScript, /CREATE EXTENSION IF NOT EXISTS timescaledb/);
});

test('restore proof waits for the final postmaster and verifies the complete artifact', () => {
  assert.match(restoreScript, /pg_postmaster_start_time/);
  assert.match(restoreScript, /timescaledb_pre_restore/);
  assert.match(restoreScript, /timescaledb_post_restore/);
  assert.match(restoreScript, /--heapallindexed --parent-check --rootdescend/);
  assert.match(restoreScript, /research-app-backup-contract\.py" verify/);
  assert.match(restoreScript, /SOURCE_GLOBALS_SHA256/);
  assert.match(restoreScript, /ON_ERROR_STOP=1/);
  assert.match(restoreScript, /sequence-validation-sql/);
  assert.match(restoreScript, /EXPECTED_HYPERTABLES/);
  assert.match(restoreScript, /--network none/);
  assert.match(restoreScript, /trap cleanup EXIT/);
});

test('preflight validates metadata without creating a container or volume', () => {
  assert.match(restoreScript, /--preflight/);
  assert.match(restoreScript, /RESTORE_METADATA/);
  assert.match(restoreScript, /preflight=PASS/);
});

test('strict metadata contract rejects duplicate keys and unhealthy source indexes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock-insight-backup-contract-'));
  const metadata = join(directory, 'RESTORE_METADATA');
  const base = `FORMAT_VERSION=3
POSTGRES_IMAGE=example/postgres@sha256:${'a'.repeat(64)}
POSTGRES_VERSION=16.14
SOURCE_TIMESCALE_VERSION=2.28.2
SOURCE_POSTGIS_VERSION=3.6.4
SOURCE_VECTOR_VERSION=0.8.5
SOURCE_GLOBALS_SHA256=${'b'.repeat(64)}
DATABASE_OWNER=research_app
SOURCE_CONTENT_PACK_ITEMS=1
SOURCE_SEALED_DERIVATIONS=1
SOURCE_INVALID_INDEXES=0
SOURCE_HYPERTABLES=1
SOURCE_TIMESCALE_JOBS=1
DUMP_SEQUENCE_COUNT=240
SOURCE_CAPTURED_AT=2026-07-25T00:00:00Z
`;
  try {
    writeFileSync(metadata, `${base}FORMAT_VERSION=3\n`);
    assert.notEqual(
      spawnSync('python3', [
        join(repoRoot, 'ops/scripts/research-app-backup-contract.py'),
        'validate',
        metadata,
      ]).status,
      0,
    );
    writeFileSync(metadata, base.replace('SOURCE_INVALID_INDEXES=0', 'SOURCE_INVALID_INDEXES=1'));
    assert.notEqual(
      spawnSync('python3', [
        join(repoRoot, 'ops/scripts/research-app-backup-contract.py'),
        'validate',
        metadata,
      ]).status,
      0,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('strict backup CLI rejects checksum and sequence corruption plus publish collisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'stock-insight-backup-behavior-'));
  const contract = join(repoRoot, 'ops/scripts/research-app-backup-contract.py');
  try {
    const backup = join(root, 'backup');
    mkdirSync(backup);
    writeStrictBackup(backup);
    assert.equal(spawnSync('python3', [contract, 'verify', backup]).status, 0);

    writeFileSync(join(backup, 'research_app.dump'), 'tampered');
    assert.notEqual(spawnSync('python3', [contract, 'verify', backup]).status, 0);

    const sequenceSql = join(root, 'sequences.sql');
    writeFileSync(sequenceSql, "SELECT pg_catalog.setval('public.items_id_seq', 41, true);\n");
    const first = spawnSync('python3', [contract, 'sequence-validation-sql', sequenceSql], {
      encoding: 'utf8',
    });
    assert.equal(first.status, 0);
    assert.match(first.stdout, /actual_last <> 41 OR actual_called <> true/);
    writeFileSync(sequenceSql, "SELECT pg_catalog.setval('public.items_id_seq', 42, false);\n");
    const mutated = spawnSync('python3', [contract, 'sequence-validation-sql', sequenceSql], {
      encoding: 'utf8',
    });
    assert.equal(mutated.status, 0);
    assert.match(mutated.stdout, /actual_last <> 42 OR actual_called <> false/);
    assert.notEqual(mutated.stdout, first.stdout);
    writeFileSync(
      sequenceSql,
      "SELECT pg_catalog.setval('public.items_id_seq', 42, false);\nSELECT pg_catalog.setval('public.items_id_seq', 42, false);\n",
    );
    assert.notEqual(spawnSync('python3', [contract, 'sequence-count', sequenceSql]).status, 0);

    const staging = join(root, '.staging');
    const target = join(root, 'published');
    mkdirSync(staging);
    mkdirSync(target);
    writeFileSync(join(staging, 'marker'), 'new');
    writeFileSync(join(target, 'marker'), 'existing');
    assert.notEqual(spawnSync('python3', [contract, 'publish', staging, target]).status, 0);
    assert.equal(readFileSync(join(target, 'marker'), 'utf8'), 'existing');
    assert.equal(readFileSync(join(staging, 'marker'), 'utf8'), 'new');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restore subprocess propagates container startup failure and runs cleanup in order', () => {
  const root = mkdtempSync(join(tmpdir(), 'stock-insight-restore-behavior-'));
  try {
    const backup = join(root, 'backup');
    const bin = join(root, 'bin');
    const dockerLog = join(root, 'docker.log');
    mkdirSync(backup);
    mkdirSync(bin);
    writeStrictBackup(backup);
    executable(
      join(bin, 'pg_restore'),
      `#!/usr/bin/env bash
set -eu
if [[ " $* " == *" --list "* ]]; then
  printf '1; 0 0 SEQUENCE SET public items_id_seq owner\\n'
  exit 0
fi
for arg in "$@"; do
  if [[ "$arg" == --file=* ]]; then
    printf "SELECT pg_catalog.setval('public.items_id_seq', 41, true);\\n" >"\${arg#--file=}"
    exit 0
  fi
done
exit 64
`,
    );
    executable(
      join(bin, 'docker'),
      `#!/usr/bin/env bash
set -u
printf '%s\\n' "$*" >>${JSON.stringify(dockerLog)}
if [[ "\${1:-}" == container && "\${2:-}" == inspect ]]; then exit 1; fi
if [[ "\${1:-}" == volume && "\${2:-}" == inspect ]]; then exit 1; fi
if [[ "\${1:-}" == run ]]; then exit 42; fi
exit 0
`,
    );
    const result = spawnSync(
      'bash',
      [join(repoRoot, 'ops/scripts/verify-research-app-restore.sh'), backup],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          RESEARCH_APP_RESTORE_NAME: 'contract-test-restore',
          RESEARCH_APP_RESTORE_VOLUME: 'contract-test-volume',
          RESEARCH_APP_RESTORE_LOG: join(root, 'restore.log'),
        },
      },
    );
    assert.equal(result.status, 42, result.stderr);
    const calls = readFileSync(dockerLog, 'utf8');
    const create = calls.indexOf('volume create');
    const run = calls.indexOf('run -d');
    const removeContainer = calls.indexOf('rm -f contract-test-restore');
    const removeVolume = calls.indexOf('volume rm contract-test-volume');
    assert.ok(
      create >= 0 && run > create && removeContainer > run && removeVolume > removeContainer,
      calls,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('logical backup captures self-contained restore metadata and never prunes WAL', () => {
  assert.match(backupScript, /shopt -s inherit_errexit/);
  assert.match(backupScript, /RESTORE_METADATA/);
  assert.match(backupScript, /SOURCE_TIMESCALE_VERSION/);
  assert.match(backupScript, /SOURCE_GLOBALS_SHA256/);
  assert.match(backupScript, /--snapshot="\$SNAPSHOT_ID"/);
  assert.match(snapshotKeeper, /pg_export_snapshot/);
  assert.match(backupScript, /global role state changed during backup/);
  for (const script of [backupScript, restoreScript]) {
    assert.match(script, /m\.admin_option/);
    assert.match(script, /m\.inherit_option/);
    assert.match(script, /m\.set_option/);
    assert.match(script, /role_role\.rolname !~ '\^pg_' OR member_role\.rolname !~ '\^pg_'/);
  }
  assert.match(backupScript, /research-app-backup-contract\.py" publish/);
  assert.match(backupContract, /rename_noreplace/);
  assert.match(backupContract, /os\.fsync/);
  assert.doesNotMatch(backupScript + restoreScript, /rolconfig/);
  assert.match(backupScript, /pg_restore --list/);
  assert.match(backupScript, /sha256sum.*RESTORE_METADATA/);
  assert.doesNotMatch(backupScript, /wal_archive/);
});

test('logical backup timer names the actual recovery contract and runs the versioned script', () => {
  assert.match(backupService, /Description=.*logical backup/i);
  assert.match(backupService, /ExecStartPre=.*wait-research-app-ready\.sh/);
  assert.match(backupService, /ops\/scripts\/backup-research-app-logical\.sh/);
  assert.match(backupService, /ExecStartPost=.*publish-research-app-dr-bundle\.sh/);
  assert.match(backupService, /Restart=on-failure/);
  assert.match(backupService, /OnFailure=research-app-logical-backup-alert/);
  assert.match(backupService, /NoNewPrivileges=true/);
  assert.match(backupTimer, /OnCalendar=\*-\*-\* 04:30:00/);
  assert.match(backupTimer, /Persistent=true/);
  assert.doesNotMatch(backupService + backupTimer, /base backup|WAL archiving/i);
});

test('pgBackRest contract retains WAL, restores to a named point, and requires checksums', () => {
  assert.match(pgBackRestConfig, /repo1-retention-full=2/);
  assert.match(pgBackRestConfig, /repo1-retention-diff=6/);
  assert.match(pgBackRestConfig, /repo1-retention-archive-type=full/);
  assert.match(pgBackRestCompose, /archive_mode=on/);
  assert.match(pgBackRestCompose, /archive-push %p/);
  assert.match(pgBackRestCompose, /archive-get %f %p/);
  assert.match(pgBackRestDrill, /pg_create_restore_point/);
  assert.match(pgBackRestDrill, /--type=name/);
  assert.match(pgBackRestDrill, /--target-action=promote/);
  assert.match(pgBackRestDrill, /current_setting\('data_checksums'\)/);
  assert.match(pgBackRestDrill, /pg_amcheck/);
});
