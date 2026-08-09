import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { additiveAppMigrations } from '@stock-insight/db-schema';

import { legacyBootstrapSql } from './sec-numeric-fact-rehearsal-bootstrap.mjs';
import {
  assertEvidence,
  parseLastJson,
  runC2Rehearsal,
} from './sec-numeric-fact-rehearsal-lib.mjs';

const { Pool } = pg;
const REQUIRED_MIGRATION = '090_numeric_fact_revision_guard';
const DATABASE_PREFIX = 'stock_insight_sec_rehearsal_';
const ADMIN_ENV = 'SEC_NUMERIC_FACT_REHEARSAL_ADMIN_DATABASE_URL';
const CONFIRM_ENV = 'SEC_NUMERIC_FACT_REHEARSAL_CONFIRM_DISPOSABLE';
const LEGACY_ROLES = [
  'stock_insight_app_reader',
  'stock_insight_app_writer',
  'stock_insight_reader',
  'stock_insight_writer',
  'si_collector',
  'si_knowledge',
  'si_analytics',
  'si_publisher',
  'si_personal',
  'si_readapi',
];
const apiRoot = fileURLToPath(new URL('..', import.meta.url));

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function requireDisposableAdminUrl() {
  const raw = process.env[ADMIN_ENV]?.trim();
  if (!raw) throw new Error(`${ADMIN_ENV} is required`);
  if (process.env[CONFIRM_ENV] !== 'YES') throw new Error(`${CONFIRM_ENV}=YES is required`);
  const url = new URL(raw);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'admin DSN must be local');
  assert.equal(url.pathname, '/postgres', 'admin DSN must target postgres');
  assert.equal(url.search, '', 'admin DSN may not contain query parameters');
  assert.equal(url.hash, '', 'admin DSN may not contain a fragment');
  return url;
}

function targetUrl(adminUrl, databaseName) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function runSchemaApply(databaseUrl) {
  return parseLastJson(
    execFileSync(process.execPath, ['src/ops/run-schema-migrations.ts', '--apply'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}

async function pathIsAbsent(path) {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const adminUrl = requireDisposableAdminUrl();
  assert.ok(additiveAppMigrations.some(({ id }) => id === REQUIRED_MIGRATION));
  const databaseName = `${DATABASE_PREFIX}${randomBytes(8).toString('hex')}`;
  const databaseUrl = targetUrl(adminUrl, databaseName);
  const rawRoot = await mkdtemp(join(tmpdir(), 'stock-insight-sec-rehearsal-'));
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  let target;
  let databaseCreated = false;
  const legacyRolesCreated = [];
  let migrationReapplyVerified;
  let evidence;
  let cleanupVerified;
  try {
    for (const role of LEGACY_ROLES) {
      const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
      if (existing.rowCount === 0) {
        await admin.query(`CREATE ROLE ${quoteIdentifier(role)} NOLOGIN`);
        legacyRolesCreated.push(role);
      }
    }
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databaseCreated = true;
    target = new Pool({ connectionString: databaseUrl, max: 4 });
    await target.query(legacyBootstrapSql);
    const firstMigrationRun = runSchemaApply(databaseUrl);
    assert.equal(firstMigrationRun.audit.changed.length, additiveAppMigrations.length);
    const secondMigrationRun = runSchemaApply(databaseUrl);
    migrationReapplyVerified = assertEvidence(
      secondMigrationRun.audit.changed.length === 0 &&
        secondMigrationRun.audit.alreadyApplied === additiveAppMigrations.length,
      'full migration registry reapplies idempotently',
    );
    const migration = await target.query(
      `SELECT count(*)::int AS count FROM public.schema_migration
        WHERE source='db-schema' AND migration_id=$1`,
      [REQUIRED_MIGRATION],
    );
    assert.equal(migration.rows[0].count, 1);
    evidence = await runC2Rehearsal({ pool: target, databaseUrl, rawRoot, apiRoot });
    for (const [name, value] of Object.entries(evidence)) assertEvidence(value, name);
  } finally {
    if (target) await target.end().catch(() => undefined);
    if (databaseCreated) {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    }
    for (const role of legacyRolesCreated.reverse()) {
      await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
    }
    await rm(rawRoot, { recursive: true, force: true });
    const remaining = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [
      databaseName,
    ]);
    const remainingRoles = await admin.query(
      'SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])',
      [legacyRolesCreated],
    );
    cleanupVerified = assertEvidence(
      remaining.rowCount === 0 && remainingRoles.rowCount === 0 && (await pathIsAbsent(rawRoot)),
      'database, roles, and raw fixture cleanup',
    );
    await admin.end();
  }
  assert.ok(evidence);
  console.log(
    JSON.stringify(
      {
        databaseName,
        migrationReapplyVerified,
        ...evidence,
        cleanupVerified,
      },
      null,
      2,
    ),
  );
}

await main();
