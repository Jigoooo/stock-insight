import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';

import {
  cleanupRehearsalRoles,
  prepareRehearsalDatabase,
  seedAndExercise,
} from './sec-numeric-fact-rehearsal-lib.mjs';

const { Pool } = pg;
const DATABASE_PREFIX = 'stock_insight_sec_rehearsal_';
const ADMIN_ENV = 'SEC_NUMERIC_FACT_REHEARSAL_ADMIN_DATABASE_URL';
const CONFIRM_ENV = 'SEC_NUMERIC_FACT_REHEARSAL_CONFIRM_DISPOSABLE';

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function requireDisposableAdminUrl() {
  const raw = process.env[ADMIN_ENV]?.trim();
  if (!raw) throw new Error(`${ADMIN_ENV} is required`);
  if (process.env[CONFIRM_ENV] !== 'YES') {
    throw new Error(`${CONFIRM_ENV}=YES is required`);
  }
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

async function main() {
  const adminUrl = requireDisposableAdminUrl();
  const databaseName = `${DATABASE_PREFIX}${randomBytes(8).toString('hex')}`;
  const databaseUrl = targetUrl(adminUrl, databaseName);
  const rawRoot = await mkdtemp(join(tmpdir(), 'stock-insight-sec-rehearsal-'));
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  let target;
  let databaseCreated = false;
  let cleanupVerified = false;
  let createdRoles = [];
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databaseCreated = true;
    target = new Pool({ connectionString: databaseUrl, max: 4 });
    const { migrationReapplyVerified } = await prepareRehearsalDatabase(
      admin,
      target,
      createdRoles,
    );
    const evidence = await seedAndExercise(target, databaseUrl, rawRoot);
    console.log(JSON.stringify({ databaseName, migrationReapplyVerified, ...evidence }, null, 2));
  } finally {
    if (target) await target.end().catch(() => undefined);
    if (databaseCreated) {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    }
    await cleanupRehearsalRoles(admin, createdRoles);
    await rm(rawRoot, { recursive: true, force: true });
    const remaining = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    cleanupVerified = remaining.rowCount === 0;
    await admin.end();
  }
  assert.equal(cleanupVerified, true);
  console.log(JSON.stringify({ cleanupVerified }));
}

await main();
