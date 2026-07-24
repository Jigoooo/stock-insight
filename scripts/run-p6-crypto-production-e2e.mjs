import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashProductionArtifact } from './production-artifact-hash.mjs';
import { getCryptoResearchWorkspace } from '../apps/api/src/crypto/read-model.ts';
import { getMyResearchOverview } from '../apps/api/src/my-research/read-model.ts';
import { getRadarSignals } from '../apps/api/src/radar/read-model.ts';
import { createScryptPasswordRecordAsync } from '../apps/web/src/server/auth/session-core.ts';
import { cryptoIdentityFoundationMigrationSql } from '../packages/db-schema/src/migrations/046_crypto_identity_foundation.ts';
import { cryptoTruthFoundationMigrationSql } from '../packages/db-schema/src/migrations/047_crypto_truth_foundation.ts';
import { cryptoTokenomicsMigrationSql } from '../packages/db-schema/src/migrations/048_crypto_tokenomics.ts';
import { cryptoContagionImpactMigrationSql } from '../packages/db-schema/src/migrations/049_crypto_contagion_impact.ts';
import { cryptoCrossDomainGraphMigrationSql } from '../packages/db-schema/src/migrations/050_crypto_cross_domain_graph.ts';
import { cryptoServingViewsMigrationSql } from '../packages/db-schema/src/migrations/051_crypto_serving_views.ts';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const root = fileURLToPath(new URL('../', import.meta.url));
const productionOutput = new URL('../apps/web/.output/', import.meta.url);
const requiredEnvironment = [
  'P6_REHEARSAL_ADMIN_DATABASE_URL',
  'STOCK_INSIGHT_E2E_SESSION_SECRET_PATH',
  'STOCK_INSIGHT_E2E_USER_ID',
  'STOCK_INSIGHT_E2E_USERNAME',
  'STOCK_INSIGHT_E2E_PASSWORD',
];
for (const key of requiredEnvironment) {
  if (!process.env[key]) throw new Error(`${key} is required for P6 production QA`);
}
for (const key of [
  'PLAYWRIGHT_BASE_URL',
  'PLAYWRIGHT_GREP',
  'PLAYWRIGHT_GREP_INVERT',
  'PLAYWRIGHT_SKIP_WEB_SERVER',
]) {
  delete process.env[key];
}

function requireQueryFreePostgresUrl(value, label) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`${label} must be a query-free PostgreSQL URL`);
  }
  return url;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return result;
}

const adminUrl = requireQueryFreePostgresUrl(
  process.env.P6_REHEARSAL_ADMIN_DATABASE_URL,
  'P6 production admin URL',
);
const sourceUrl = requireQueryFreePostgresUrl(
  process.env.P6_PRODUCTION_SOURCE_DATABASE_URL ??
    'postgresql://research_app@127.0.0.1:55432/research_app',
  'P6 production source URL',
);
const databaseName = `stock_insight_p6_production_${randomBytes(5).toString('hex')}`;
if (!/^stock_insight_p6_production_[a-f0-9]+$/.test(databaseName)) {
  throw new Error('unsafe P6 production database name');
}
const quotedDatabase = `"${databaseName}"`;
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
const roleNames = ['research_app', 'si_knowledge', 'si_analytics', 'si_publisher', 'si_readapi'];
const migrations = [
  cryptoIdentityFoundationMigrationSql,
  cryptoTruthFoundationMigrationSql,
  cryptoTokenomicsMigrationSql,
  cryptoContagionImpactMigrationSql,
  cryptoCrossDomainGraphMigrationSql,
  cryptoServingViewsMigrationSql,
];
const artifactSha256 = hashProductionArtifact(productionOutput);
const nonce = randomBytes(8).toString('hex');
const reportPath = join(tmpdir(), `stock-insight-p6-crypto-report-${nonce}.json`);
const dumpPath = join(tmpdir(), `stock-insight-p6-crypto-source-${nonce}.sql`);
const expectedTests = 4;
const admin = new Client({ connectionString: adminUrl.toString() });
let target;
let source;
let createdDatabase = false;
const createdRoles = [];
const cleanupErrors = [];
let primaryError;

console.log(`p6_crypto_production_artifact_sha256=${artifactSha256}`);

try {
  await admin.connect();
  for (const roleName of roleNames) {
    const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [roleName]);
    if (existing.rowCount === 0) {
      await admin.query(
        `CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      createdRoles.push(roleName);
    }
  }
  await admin.query(`CREATE DATABASE ${quotedDatabase}`);
  createdDatabase = true;

  source = new Client({ connectionString: sourceUrl.toString() });
  await source.connect();
  const internalViewRows = await source.query(`
    SELECT schemaname, viewname AS relation_name
      FROM pg_views
     WHERE definition LIKE '%_timescaledb_internal%'
    UNION
    SELECT schemaname, matviewname AS relation_name
      FROM pg_matviews
     WHERE definition LIKE '%_timescaledb_internal%'
    ORDER BY 1, 2
  `);
  const internalViewExclusions = internalViewRows.rows.flatMap((row) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(row.schemaname)) throw new Error('unsafe source schema');
    if (!/^[a-z_][a-z0-9_]*$/.test(row.relation_name)) throw new Error('unsafe source relation');
    return [`--exclude-table=${row.schemaname}.${row.relation_name}`];
  });
  await source.end();
  source = undefined;

  run('pg_dump', [
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--exclude-schema=_timescaledb_*',
    '--exclude-schema=timescaledb_*',
    ...internalViewExclusions,
    '--file',
    dumpPath,
    sourceUrl.toString(),
  ]);
  run('psql', ['--set', 'ON_ERROR_STOP=1', '--file', dumpPath, targetUrl.toString()], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  const connected = await target.query('SELECT current_database() AS database_name');
  if (connected.rows[0]?.database_name !== databaseName) {
    throw new Error('P6 production QA connected to an unexpected database');
  }
  await target.query(`
    CREATE SCHEMA IF NOT EXISTS geo;
    CREATE TABLE IF NOT EXISTS geo.entity (geo_entity_id BIGINT PRIMARY KEY);
    CREATE SCHEMA IF NOT EXISTS world;
    CREATE TABLE IF NOT EXISTS world.event_revision (event_revision_id BIGINT PRIMARY KEY);
  `);
  for (const migration of migrations) await target.query(migration);
  const passwordRecord = await createScryptPasswordRecordAsync(
    process.env.STOCK_INSIGHT_E2E_PASSWORD,
  );
  const accountUpdate = await target.query(
    `UPDATE public.app_local_accounts
        SET password_record=$1
      WHERE user_id=$2::uuid AND username=$3
      RETURNING user_id`,
    [passwordRecord, process.env.STOCK_INSIGHT_E2E_USER_ID, process.env.STOCK_INSIGHT_E2E_USERNAME],
  );
  if (accountUpdate.rowCount !== 1) throw new Error('P6 production QA account was not found');
  const queryExecutor = {
    queryRows: async (sql, parameters = []) => (await target.query(sql, parameters)).rows,
  };
  const userScope = { userId: process.env.STOCK_INSIGHT_E2E_USER_ID };
  await getCryptoResearchWorkspace(queryExecutor, { knownAt: new Date(), limit: 40 });
  await getRadarSignals(queryExecutor, { userScope, limit: 1 });
  await getMyResearchOverview(queryExecutor, { userScope });
  await target.end();
  target = undefined;

  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'e2e/crypto-workspace.spec.ts',
      '--project=desktop',
      '--project=mobile',
      '--reporter=json',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl.toString(),
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
        PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? '18096',
        PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256: artifactSha256,
        PLAYWRIGHT_USE_PRODUCTION_BUILD: '1',
        PLAYWRIGHT_WORKERS: '1',
      },
      stdio: ['inherit', 'inherit', 'inherit'],
    },
  );
  if (result.error) throw result.error;
  if (!existsSync(reportPath)) throw new Error('P6 crypto production report is missing');

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
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

  const stats = report.stats ?? {};
  const passed =
    result.status === 0 &&
    counts.expected === expectedTests &&
    counts.unexpected === 0 &&
    counts.skipped === 0 &&
    counts.flaky === 0 &&
    (stats.expected ?? 0) === expectedTests &&
    (stats.unexpected ?? 0) === 0 &&
    (stats.skipped ?? 0) === 0 &&
    (stats.flaky ?? 0) === 0 &&
    (report.errors?.length ?? 0) === 0;
  console.log(
    `p6_crypto_production_e2e expected=${counts.expected} skipped=${counts.skipped} ` +
      `unexpected=${counts.unexpected} flaky=${counts.flaky}`,
  );
  if (!passed) {
    throw new Error(`P6 crypto production E2E did not converge to exactly ${expectedTests} passes`);
  }
} catch (error) {
  primaryError = error;
} finally {
  if (source) {
    try {
      await source.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (target) {
    try {
      await target.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (createdDatabase) {
    try {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`,
        [databaseName],
      );
      await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabase}`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const roleName of createdRoles.toReversed()) {
    try {
      await admin.query(`DROP ROLE IF EXISTS "${roleName}"`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await admin.end();
  } catch (error) {
    cleanupErrors.push(error);
  }
  rmSync(reportPath, { force: true });
  rmSync(dumpPath, { force: true });
}

if (primaryError || cleanupErrors.length > 0) {
  throw new AggregateError(
    [primaryError, ...cleanupErrors].filter(Boolean),
    'P6 production QA or cleanup failed',
  );
}
