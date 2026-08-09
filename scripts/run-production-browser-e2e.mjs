import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createScryptPasswordRecordAsync } from '../apps/api/src/auth/password-record.ts';
import { authenticateCredentials } from '../apps/api-server/dist/index.js';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const root = fileURLToPath(new URL('../', import.meta.url));
const requiredEnvironment = [
  'PRODUCTION_E2E_ADMIN_DATABASE_URL',
  'PRODUCTION_E2E_SOURCE_DATABASE_URL',
];
for (const key of requiredEnvironment) {
  if (!process.env[key]) throw new Error(`${key} is required for production browser QA`);
}
const supportedSuites = new Set(['p3d', 'sigma']);
const delegatedSuites = {
  p3d: { label: 'P3-D', script: 'scripts/run-p3d-production-e2e.mjs' },
  sigma: { label: 'Sigma', script: 'scripts/run-sigma-production-e2e.mjs' },
};
const selectedSuite = process.env.STOCK_INSIGHT_PRODUCTION_E2E_SUITE;
if (!supportedSuites.has(selectedSuite)) {
  throw new Error('STOCK_INSIGHT_PRODUCTION_E2E_SUITE must be p3d or sigma');
}
const temporaryRoot = mkdtempSync(join(tmpdir(), 'stock-insight-production-browser-'));
const generatedSecretPath = join(temporaryRoot, 'session-secret');
writeFileSync(generatedSecretPath, `${randomBytes(32).toString('base64url')}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
for (const key of [
  'PLAYWRIGHT_BASE_URL',
  'PLAYWRIGHT_GREP',
  'PLAYWRIGHT_GREP_INVERT',
  'PLAYWRIGHT_SKIP_WEB_SERVER',
  'PLAYWRIGHT_STORAGE_STATE',
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
  process.env.PRODUCTION_E2E_ADMIN_DATABASE_URL,
  'production browser admin URL',
);
const sourceUrl = requireQueryFreePostgresUrl(
  process.env.PRODUCTION_E2E_SOURCE_DATABASE_URL,
  'production browser source URL',
);
const databaseName = `stock_insight_production_browser_${randomBytes(5).toString('hex')}`;
if (!/^stock_insight_production_browser_[a-f0-9]+$/.test(databaseName)) {
  throw new Error('unsafe production browser database name');
}
const quotedDatabase = `"${databaseName}"`;
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
const databaseRoleName = databaseName.replace(
  'stock_insight_production_browser_',
  'stock_insight_browser_qa_',
);
const databaseRolePassword = randomBytes(32).toString('base64url');
if (!/^[A-Za-z0-9_-]+$/.test(databaseRolePassword)) throw new Error('unsafe QA role password');
const databaseUserUrl = new URL(targetUrl);
databaseUserUrl.username = databaseRoleName;
databaseUserUrl.password = databaseRolePassword;
const roleNames = ['research_app', 'si_knowledge', 'si_analytics', 'si_publisher', 'si_readapi'];
const nonce = randomBytes(8).toString('hex');
const dumpPath = join(tmpdir(), `stock-insight-production-browser-source-${nonce}.dump`);
const tocPath = join(tmpdir(), `stock-insight-production-browser-source-${nonce}.toc`);
const admin = new Client({ connectionString: adminUrl.toString() });
let target;
let source;
let createdDatabase = false;
const createdRoles = [];
const cleanupErrors = [];
let primaryError;

async function ensureDisposableRole(roleName) {
  if (!/^[a-z_][a-z0-9_]*$/.test(roleName)) throw new Error('unsafe source policy role');
  const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [roleName]);
  if (existing.rowCount > 0) return;
  await admin.query(
    `CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  createdRoles.push(roleName);
}

try {
  await admin.connect();
  await admin.query(
    `CREATE ROLE "${databaseRoleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${databaseRolePassword}'`,
  );
  createdRoles.push(databaseRoleName);
  for (const roleName of roleNames) {
    await ensureDisposableRole(roleName);
  }
  await admin.query(`CREATE DATABASE ${quotedDatabase} OWNER "${databaseRoleName}"`);
  createdDatabase = true;

  source = new Client({ connectionString: sourceUrl.toString() });
  await source.connect();
  const policyRoleRows = await source.query(`
    SELECT DISTINCT role.rolname
      FROM pg_policy AS policy
      CROSS JOIN LATERAL unnest(policy.polroles) AS policy_role(role_oid)
      JOIN pg_roles AS role ON role.oid = policy_role.role_oid
     WHERE role.rolname !~ '^pg_'
     ORDER BY role.rolname
  `);
  const extensionRows = await source.query(`
    SELECT extname
      FROM pg_extension
     WHERE extname <> 'plpgsql'
     ORDER BY extname
  `);
  const extensionConfigRows = await source.query(`
    SELECT namespace.nspname AS schemaname, relation.relname AS relation_name
      FROM pg_extension AS extension
      CROSS JOIN LATERAL unnest(extension.extconfig) AS config(relation_oid)
      JOIN pg_class AS relation ON relation.oid = config.relation_oid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     ORDER BY namespace.nspname, relation.relname
  `);
  const eventTriggerRows = await source.query(`
    SELECT event.evtname,
           event.evtevent,
           event.evtenabled,
           event.evttags,
           namespace.nspname AS function_schema,
           function.proname AS function_name
      FROM pg_event_trigger AS event
      JOIN pg_proc AS function ON function.oid = event.evtfoid
      JOIN pg_namespace AS namespace ON namespace.oid = function.pronamespace
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_event_trigger'::regclass
          AND dependency.objid = event.oid
          AND dependency.deptype = 'e'
     )
     ORDER BY event.evtname
  `);
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
  const extensionConfigDataExclusions = extensionConfigRows.rows.flatMap((row) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(row.schemaname)) {
      throw new Error('unsafe extension config schema');
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(row.relation_name)) {
      throw new Error('unsafe extension config relation');
    }
    return [`--exclude-table-data=${row.schemaname}.${row.relation_name}`];
  });
  for (const row of policyRoleRows.rows) {
    await ensureDisposableRole(String(row.rolname));
  }
  await source.end();
  source = undefined;

  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  for (const row of extensionRows.rows) {
    const extensionName = String(row.extname);
    if (!/^[a-z][a-z0-9_-]*$/.test(extensionName)) {
      throw new Error('unsafe source extension name');
    }
    await target.query(`CREATE EXTENSION IF NOT EXISTS "${extensionName}"`);
  }
  await target.end();
  target = undefined;

  run('pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--no-comments',
    '--exclude-schema=_timescaledb_*',
    '--exclude-schema=timescaledb_*',
    ...internalViewExclusions,
    ...extensionConfigDataExclusions,
    '--file',
    dumpPath,
    sourceUrl.toString(),
  ]);
  const tocResult = run('pg_restore', ['--list', dumpPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const tocLines = String(tocResult.stdout).split('\n');
  const eventTriggerTocLines = tocLines.filter((line) => line.includes(' EVENT TRIGGER '));
  if (eventTriggerTocLines.length !== eventTriggerRows.rowCount) {
    throw new Error('P6 event trigger archive and source catalog disagree');
  }
  writeFileSync(
    tocPath,
    `${tocLines.filter((line) => !line.includes(' EVENT TRIGGER ')).join('\n')}\n`,
    { mode: 0o600 },
  );
  run(
    'pg_restore',
    [
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--no-comments',
      '--use-list',
      tocPath,
      '--dbname',
      databaseUserUrl.toString(),
      dumpPath,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  const allowedEventNames = new Set([
    'ddl_command_start',
    'ddl_command_end',
    'sql_drop',
    'table_rewrite',
    'login',
  ]);
  const eventTriggerModes = new Map([
    ['O', undefined],
    ['D', 'DISABLE'],
    ['R', 'ENABLE REPLICA'],
    ['A', 'ENABLE ALWAYS'],
  ]);
  for (const row of eventTriggerRows.rows) {
    const triggerName = String(row.evtname);
    const eventName = String(row.evtevent);
    const functionSchema = String(row.function_schema);
    const functionName = String(row.function_name);
    const mode = eventTriggerModes.get(String(row.evtenabled));
    const tags = row.evttags ?? [];
    if (
      ![triggerName, functionSchema, functionName].every((value) =>
        /^[a-z_][a-z0-9_]*$/.test(value),
      ) ||
      !allowedEventNames.has(eventName) ||
      !Array.isArray(tags) ||
      !tags.every((tag) => typeof tag === 'string' && /^[A-Z][A-Z0-9 _-]*$/.test(tag)) ||
      !eventTriggerModes.has(String(row.evtenabled))
    ) {
      throw new Error('unsafe source event trigger definition');
    }
    const duplicate = await target.query('SELECT 1 FROM pg_event_trigger WHERE evtname=$1', [
      triggerName,
    ]);
    if (duplicate.rowCount > 0) throw new Error('duplicate source event trigger');
    const whenClause =
      tags.length > 0 ? ` WHEN TAG IN (${tags.map((tag) => `'${tag}'`).join(', ')})` : '';
    await target.query(
      `CREATE EVENT TRIGGER "${triggerName}" ON ${eventName}${whenClause} ` +
        `EXECUTE FUNCTION "${functionSchema}"."${functionName}"()`,
    );
    if (mode) await target.query(`ALTER EVENT TRIGGER "${triggerName}" ${mode}`);
  }
  await target.end();
  target = undefined;

  target = new Client({ connectionString: databaseUserUrl.toString() });
  await target.connect();
  const connected = await target.query('SELECT current_database() AS database_name');
  if (connected.rows[0]?.database_name !== databaseName) {
    throw new Error('production browser QA connected to an unexpected database');
  }
  const qaCredentials = {
    userId: randomUUID(),
    username: `production.qa.${nonce}`,
    password: `ProductionQa!${randomBytes(24).toString('base64url')}`,
    secretPath: generatedSecretPath,
  };
  const passwordRecord = await createScryptPasswordRecordAsync(qaCredentials.password);
  const legacyUserId = `productionqa:${qaCredentials.userId}`;
  await target.query('BEGIN');
  try {
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [
      qaCredentials.userId,
    ]);
    await target.query(
      `INSERT INTO public.app_user_identity_map (legacy_user_id, user_id)
       VALUES ($1, $2::uuid)`,
      [legacyUserId, qaCredentials.userId],
    );
    await target.query(
      `INSERT INTO public.app_users (id, external_ref, display_name, channel_type)
       VALUES ($1::uuid, $2, $3, 'local')`,
      [qaCredentials.userId, legacyUserId, qaCredentials.username],
    );
    await target.query(
      `INSERT INTO public.app_auth_bootstrap_state (user_id)
       VALUES ($1::uuid)`,
      [qaCredentials.userId],
    );
    await target.query(
      `INSERT INTO public.app_local_accounts (user_id, username, password_record)
       VALUES ($1::uuid, $2, $3)`,
      [qaCredentials.userId, qaCredentials.username, passwordRecord],
    );
    await target.query('COMMIT');
  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  }
  const queryExecutor = {
    queryRows: async (sql, parameters = []) => (await target.query(sql, parameters)).rows,
  };
  const authenticationPreflight = await authenticateCredentials(
    queryExecutor.queryRows,
    randomBytes(32),
    {
      username: qaCredentials.username,
      password: qaCredentials.password,
    },
  );
  if (
    authenticationPreflight.status !== 'authenticated' ||
    authenticationPreflight.identity.userId !== qaCredentials.userId ||
    authenticationPreflight.identity.username !== qaCredentials.username ||
    !/^[A-Za-z0-9_-]{43}$/.test(authenticationPreflight.identity.credentialFingerprint)
  ) {
    throw new Error('production browser credential authentication preflight failed');
  }
  await target.end();
  target = undefined;

  const sharedQaEnvironment = {
    ...process.env,
    DATABASE_URL: databaseUserUrl.toString(),
    STOCK_INSIGHT_E2E_DATABASE_URL: databaseUserUrl.toString(),
    STOCK_INSIGHT_E2E_PASSWORD: qaCredentials.password,
    STOCK_INSIGHT_E2E_SESSION_SECRET_PATH: qaCredentials.secretPath,
    STOCK_INSIGHT_E2E_USER_ID: qaCredentials.userId,
    STOCK_INSIGHT_E2E_USERNAME: qaCredentials.username,
  };
  const delegatedSuite = delegatedSuites[selectedSuite];
  const delegatedResult = spawnSync(process.execPath, [delegatedSuite.script], {
    cwd: root,
    env: {
      ...sharedQaEnvironment,
      STOCK_INSIGHT_PRODUCTION_E2E_PREPARED: '1',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  if (delegatedResult.error) throw delegatedResult.error;
  if (delegatedResult.status !== 0) {
    throw new Error(`${delegatedSuite.label} production E2E exited with ${delegatedResult.status}`);
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
  rmSync(dumpPath, { force: true });
  rmSync(tocPath, { force: true });
  rmSync(temporaryRoot, { force: true, recursive: true });
}

if (primaryError || cleanupErrors.length > 0) {
  throw new AggregateError(
    [primaryError, ...cleanupErrors].filter(Boolean),
    'production browser QA or cleanup failed',
  );
}
