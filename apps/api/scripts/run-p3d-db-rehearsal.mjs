import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';

import { selectExactP3dCandidateBundle } from './p3d-candidate-bundle.mjs';

const { Client } = pg;
const DISPOSABLE_PREFIX = 'stock_insight_p3d_rehearsal_';
const CANDIDATE_BASELINE_ABSENCE_RELATIONS = [
  'knowledge.assertion',
  'world.event',
  'knowledge.resolution_policy',
  'geo.entity',
  'geo.entity_exposure_revision',
  'serving.v_truth_assertion_pit_v1',
  'analytics.impact_shock',
  'analytics.io_industry_linkage',
  'analytics.methodology_template',
  'analytics.scenario_set',
  'analytics.precompute_policy',
];

function runCommand(command, args, password) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, PGPASSWORD: password },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit ${code}: ${stderr.trim()}`));
    });
  });
}

function postgresCliArgs(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    args: [
      '--host',
      url.hostname,
      '--port',
      url.port || '5432',
      '--username',
      decodeURIComponent(url.username),
      '--dbname',
      decodeURIComponent(url.pathname.slice(1)),
    ],
    password: decodeURIComponent(url.password),
  };
}

async function readSourceTimescaleVersion(sourceDatabaseUrl) {
  const client = new Client({ connectionString: sourceDatabaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`,
    );
    const version = result.rows[0]?.extversion;
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error('Source TimescaleDB version is unavailable or invalid');
    }
    return version;
  } finally {
    await client.end();
  }
}

async function restoreProductionShapedSnapshot(
  sourceDatabaseUrl,
  targetDatabaseUrl,
  dumpPath,
  timescaleVersion,
) {
  const source = postgresCliArgs(sourceDatabaseUrl);
  await runCommand(
    'pg_dump',
    [
      ...source.args,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--exclude-table-data=_timescaledb_catalog.bgw_job',
      '--file',
      dumpPath,
    ],
    source.password,
  );
  const target = postgresCliArgs(targetDatabaseUrl);
  await runCommand(
    'psql',
    [
      ...target.args,
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      `CREATE EXTENSION IF NOT EXISTS timescaledb VERSION '${timescaleVersion}'; SELECT timescaledb_pre_restore();`,
    ],
    target.password,
  );
  await runCommand(
    'pg_restore',
    [...target.args, '--exit-on-error', '--no-owner', '--no-privileges', dumpPath],
    target.password,
  );
  await runCommand(
    'psql',
    [...target.args, '--set', 'ON_ERROR_STOP=1', '--command', 'SELECT timescaledb_post_restore();'],
    target.password,
  );
}

async function loadAdditiveAppMigrations() {
  const indexUrl = new URL('../../../packages/db-schema/src/index.ts', import.meta.url);
  const source = await readFile(indexUrl, 'utf8');
  const importByExport = new Map(
    [...source.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+'\.\/migrations\/([^']+)'/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
  const registryStart = source.indexOf('export const additiveAppMigrations');
  const registryEnd = source.indexOf('\n];', registryStart);
  if (registryStart < 0 || registryEnd < 0) throw new Error('Migration registry source not found');
  const registrySource = source.slice(registryStart, registryEnd);
  const entries = [...registrySource.matchAll(/id:\s*'([^']+)'[\s\S]*?sql:\s*(\w+),\s*\n\s*\}/g)];
  if (entries.length === 0) throw new Error('Migration registry is empty');

  return Promise.all(
    entries.map(async ([, id, exportName]) => {
      const modulePath = importByExport.get(exportName);
      if (!modulePath) throw new Error(`Migration export is not imported: ${exportName}`);
      const migrationModule = await import(
        new URL(`../../../packages/db-schema/src/migrations/${modulePath}.ts`, import.meta.url)
      );
      const sql = migrationModule[exportName];
      if (typeof sql !== 'string')
        throw new Error(`Migration SQL export is invalid: ${exportName}`);
      return { id, sql };
    }),
  );
}

const additiveAppMigrations = await loadAdditiveAppMigrations();
const candidateMigrationBundle = selectExactP3dCandidateBundle(additiveAppMigrations);

function assertDisposableDatabaseName(databaseName) {
  if (!new RegExp(`^${DISPOSABLE_PREFIX}[a-z0-9_]+$`).test(databaseName)) {
    throw new Error(`Refusing non-disposable database name: ${databaseName}`);
  }
}

function quotedIdentifier(identifier) {
  assertDisposableDatabaseName(identifier);
  return `"${identifier}"`;
}

function assertSafeConnectionUrl(url, label) {
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${label} must use PostgreSQL`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error(`${label} must not include query parameters or fragments`);
  }
}

function databaseUrlFor(adminDatabaseUrl, databaseName) {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function assertP3dBaseline(client) {
  const baseline = await client.query(
    `SELECT
       to_regclass('public.app_invitations') IS NOT NULL AS has_migration_030,
       (
         SELECT count(*)::int
         FROM pg_trigger
         WHERE tgrelid = to_regclass('geo.entity')
           AND tgname = 'geo_entity_identity_immutable'
       ) AS p3d_trigger_count`,
  );
  if (baseline.rows[0]?.has_migration_030 !== true) {
    throw new Error('P3-D rehearsal source is missing migration 030 baseline');
  }
  if (baseline.rows[0]?.p3d_trigger_count !== 0) {
    throw new Error('P3-D rehearsal source already contains migration 042');
  }
  const candidateSurfaces = await client.query(
    `SELECT relation_name
     FROM unnest($1::text[]) AS candidate(relation_name)
     WHERE to_regclass(relation_name) IS NOT NULL
     ORDER BY relation_name`,
    [CANDIDATE_BASELINE_ABSENCE_RELATIONS],
  );
  if (candidateSurfaces.rows.length > 0) {
    throw new Error(
      `P3-D rehearsal source already contains candidate surfaces: ${candidateSurfaces.rows
        .map((row) => row.relation_name)
        .join(', ')}`,
    );
  }
}

async function applyCandidateBundle(client) {
  for (const round of [1, 2]) {
    for (const migration of candidateMigrationBundle) {
      try {
        await client.query(migration.sql);
      } catch (error) {
        throw new Error(`P3-D migration rehearsal failed at round ${round}, ${migration.id}`, {
          cause: error,
        });
      }
    }
  }
}

async function expectMutationBlocked(client, savepoint, sql, parameters) {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(sql, parameters);
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    if (!(error instanceof Error) || error.code !== '55000') throw error;
    return;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  throw new Error(`${savepoint.toUpperCase()}_NOT_BLOCKED`);
}

async function proveGeoIdentityGuard(client) {
  const before = await client.query('SELECT count(*)::int AS count FROM geo.entity');
  const suffix = randomBytes(6).toString('hex');
  await client.query('BEGIN');
  try {
    const inserted = await client.query(
      `INSERT INTO geo.entity (geo_entity_key, geo_kind, canonical_name)
       VALUES ($1, 'facility', 'P3-D rehearsal identity')
       RETURNING geo_entity_id`,
      [`rehearsal:${suffix}`],
    );
    const geoEntityId = inserted.rows[0]?.geo_entity_id;
    if (geoEntityId === undefined) throw new Error('P3-D rehearsal insert did not return an id');

    await expectMutationBlocked(
      client,
      'update_probe',
      `UPDATE geo.entity SET canonical_name = 'mutated' WHERE geo_entity_id = $1`,
      [geoEntityId],
    );
    await expectMutationBlocked(
      client,
      'delete_probe',
      `DELETE FROM geo.entity WHERE geo_entity_id = $1`,
      [geoEntityId],
    );
    await client.query(
      `INSERT INTO geo.entity (geo_entity_key, geo_kind, canonical_name)
       VALUES ($1, 'facility', 'P3-D second accepted identity')`,
      [`rehearsal:${suffix}:second`],
    );
  } finally {
    await client.query('ROLLBACK');
  }

  const after = await client.query('SELECT count(*)::int AS count FROM geo.entity');
  if (before.rows[0]?.count !== after.rows[0]?.count) {
    throw new Error('P3-D rehearsal rollback changed canonical geo row count');
  }
  const trigger = await client.query(
    `SELECT count(*)::int AS count
     FROM pg_trigger
     WHERE tgrelid = 'geo.entity'::regclass
       AND tgname = 'geo_entity_identity_immutable'
       AND tgenabled = 'O'`,
  );
  if (trigger.rows[0]?.count !== 1) throw new Error('P3-D geo identity trigger is not enabled');
  return { beforeCount: before.rows[0]?.count, afterCount: after.rows[0]?.count };
}

const adminDatabaseUrl = process.env.STOCK_INSIGHT_TEST_ADMIN_DATABASE_URL;
if (!adminDatabaseUrl) throw new Error('STOCK_INSIGHT_TEST_ADMIN_DATABASE_URL is required');
const sourceDatabaseUrl = process.env.STOCK_INSIGHT_REHEARSAL_SOURCE_DATABASE_URL;
if (!sourceDatabaseUrl) {
  throw new Error('STOCK_INSIGHT_REHEARSAL_SOURCE_DATABASE_URL is required');
}
const adminUrl = new URL(adminDatabaseUrl);
const sourceUrl = new URL(sourceDatabaseUrl);
assertSafeConnectionUrl(adminUrl, 'P3-D rehearsal admin URL');
assertSafeConnectionUrl(sourceUrl, 'P3-D rehearsal source URL');
const allowDockerBridge = process.env.STOCK_INSIGHT_ALLOW_DOCKER_BRIDGE_REHEARSAL === '1';
const adminIsLocal = ['127.0.0.1', 'localhost'].includes(adminUrl.hostname);
const adminIsApprovedBridge =
  allowDockerBridge && /^172\.(1[6-9]|2\d|3[01])\./.test(adminUrl.hostname);
if (
  (!adminIsLocal && !adminIsApprovedBridge) ||
  !['127.0.0.1', 'localhost'].includes(sourceUrl.hostname)
) {
  throw new Error('P3-D rehearsal requires a localhost PostgreSQL endpoint');
}

const databaseName = `${DISPOSABLE_PREFIX}${process.pid}_${randomBytes(4).toString('hex')}`;
assertDisposableDatabaseName(databaseName);
let created = false;
let rehearsalClient;
const tempDirectory = await mkdtemp(join(tmpdir(), 'stock-insight-p3d-'));
const dumpPath = join(tempDirectory, 'source.dump');

try {
  const adminClient = new Client({ connectionString: adminDatabaseUrl });
  await adminClient.connect();
  try {
    await adminClient.query(
      `CREATE DATABASE ${quotedIdentifier(databaseName)} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    created = true;
  } finally {
    await adminClient.end();
  }

  const rehearsalDatabaseUrl = databaseUrlFor(adminDatabaseUrl, databaseName);
  const timescaleVersion = await readSourceTimescaleVersion(sourceDatabaseUrl);
  await restoreProductionShapedSnapshot(
    sourceDatabaseUrl,
    rehearsalDatabaseUrl,
    dumpPath,
    timescaleVersion,
  );
  rehearsalClient = new Client({
    connectionString: rehearsalDatabaseUrl,
  });
  await rehearsalClient.connect();
  await assertP3dBaseline(rehearsalClient);
  await applyCandidateBundle(rehearsalClient);
  const counts = await proveGeoIdentityGuard(rehearsalClient);
  console.log(
    JSON.stringify({
      ok: true,
      bundleStart: candidateMigrationBundle[0].id,
      bundleEnd: candidateMigrationBundle.at(-1).id,
      migrationCount: candidateMigrationBundle.length,
      rounds: 2,
      timescaleVersion,
      insertAccepted: true,
      updateBlocked: true,
      deleteBlocked: true,
      rollbackInvariant: counts.beforeCount === counts.afterCount,
    }),
  );
} finally {
  try {
    if (rehearsalClient) await rehearsalClient.end().catch(() => undefined);
    if (created) {
      assertDisposableDatabaseName(databaseName);
      const cleanupClient = new Client({ connectionString: adminDatabaseUrl });
      await cleanupClient.connect();
      try {
        await cleanupClient.query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [databaseName],
        );
        await cleanupClient.query(`DROP DATABASE ${quotedIdentifier(databaseName)}`);
      } finally {
        await cleanupClient.end();
      }
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
