import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import { personalizationReaderSurfaceHardeningMigrationSql } from '../../../packages/db-schema/src/migrations/052_personalization_reader_surface_hardening.ts';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const adminUrl = new URL(process.env.XG_REHEARSAL_ADMIN_DATABASE_URL ?? '');
if (
  !['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
  adminUrl.search !== '' ||
  adminUrl.hash !== ''
) {
  throw new Error('XG rehearsal admin URL must be a query-free PostgreSQL URL');
}
const databaseName = `stock_insight_xg_rehearsal_${randomBytes(5).toString('hex')}`;
if (!/^stock_insight_xg_rehearsal_[a-f0-9]+$/.test(databaseName)) throw new Error('unsafe db name');
const inheritedRoleName = `stock_insight_xg_parent_${randomBytes(5).toString('hex')}`;
if (!/^stock_insight_xg_parent_[a-f0-9]+$/.test(inheritedRoleName)) {
  throw new Error('unsafe inherited role name');
}
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
const quotedDatabase = `"${databaseName}"`;
const quotedInheritedRole = `"${inheritedRoleName}"`;
const roleNames = ['stock_insight_reader', 'stock_insight_writer'];
const decisionAllowedColumns = [
  'decision_packet_id',
  'user_id',
  'security_entity_id',
  'portfolio_snapshot_id',
  'action',
  'action_reason',
  'abstention_reason',
  'common_view_key',
  'common_view_digest',
  'common_view_as_of',
  'generated_at',
  'expires_at',
  'advice_prohibited',
  'order_executable',
  'runtime_packet',
];
const legalAllowedColumns = [
  'decision_packet_legal_review_id',
  'decision_packet_id',
  'user_id',
  'review_status',
  'reviewed_at',
  'advice_prohibited',
  'order_executable',
];
const decisionDeniedColumns = [
  'user_profile_revision_id',
  'thesis_revision_id',
  'common_view_kind',
  'derivation_id',
  'counter_evidence',
  'failure_conditions',
  'estimated_costs',
  'tax_assumptions',
  'uncertainty',
  'legal_review_status',
  'engine_version',
  'packet_digest',
  'created_at',
];
const legalDeniedColumns = ['reviewer_ref', 'review_note', 'review_digest', 'created_at'];
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();

async function readRoleState() {
  const roles = await admin.query(
    `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
            rolreplication, rolbypassrls
       FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname`,
    [roleNames],
  );
  const memberships = await admin.query(
    `SELECT to_jsonb(membership) AS state
       FROM pg_auth_members membership
       JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
       JOIN pg_roles member_role ON member_role.oid=membership.member
      WHERE granted_role.rolname=ANY($1::text[]) OR member_role.rolname=ANY($1::text[])
      ORDER BY membership.roleid, membership.member, membership.grantor`,
    [roleNames],
  );
  return { roles: roles.rows, memberships: memberships.rows };
}

const roleStateBefore = await readRoleState();
const existingRoles = new Set(roleStateBefore.roles.map((row) => row.rolname));
let target;
let result;
let primaryError;
const cleanupErrors = [];

async function expectDenied(sql) {
  try {
    await target.query(sql);
  } catch (error) {
    if (error?.code === '42501') return true;
    throw error;
  }
  return false;
}

async function probeRoleSurface(roleName) {
  await target.query(`SET ROLE "${roleName}"`);
  try {
    await target.query(
      `SELECT ${decisionAllowedColumns.join(', ')} FROM personalization.decision_packet`,
    );
    await target.query(
      `SELECT ${legalAllowedColumns.join(', ')} FROM personalization.decision_packet_legal_review`,
    );
    for (const column of decisionDeniedColumns) {
      if (!(await expectDenied(`SELECT ${column} FROM personalization.decision_packet`))) {
        return false;
      }
    }
    for (const column of legalDeniedColumns) {
      if (
        !(await expectDenied(`SELECT ${column} FROM personalization.decision_packet_legal_review`))
      ) {
        return false;
      }
    }
    return (
      (await expectDenied('SELECT * FROM personalization.decision_packet')) &&
      (await expectDenied('SELECT * FROM personalization.decision_packet_legal_review'))
    );
  } finally {
    await target.query('RESET ROLE');
  }
}

try {
  await admin.query(`CREATE DATABASE ${quotedDatabase}`);
  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  const connectedDatabase = await target.query('SELECT current_database() AS database_name');
  if (connectedDatabase.rows[0]?.database_name !== databaseName) {
    throw new Error('XG rehearsal connected to an unexpected database');
  }
  await target.query(`
    DO $roles$
    DECLARE role_name TEXT;
    BEGIN
      FOREACH role_name IN ARRAY ARRAY['stock_insight_reader','stock_insight_writer'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
          EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
        END IF;
      END LOOP;
    END
    $roles$;
    CREATE SCHEMA personalization;
    CREATE TABLE personalization.decision_packet (
      decision_packet_id UUID,
      user_id UUID,
      security_entity_id BIGINT,
      user_profile_revision_id UUID,
      portfolio_snapshot_id UUID,
      thesis_revision_id UUID,
      common_view_kind TEXT,
      common_view_key TEXT,
      common_view_digest TEXT,
      common_view_as_of TIMESTAMPTZ,
      derivation_id BIGINT,
      action TEXT,
      action_reason TEXT,
      counter_evidence JSONB,
      failure_conditions JSONB,
      estimated_costs JSONB,
      tax_assumptions JSONB,
      uncertainty JSONB,
      expires_at TIMESTAMPTZ,
      abstention_reason TEXT,
      legal_review_status TEXT,
      advice_prohibited BOOLEAN,
      order_executable BOOLEAN,
      engine_version TEXT,
      packet_digest TEXT,
      generated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ,
      runtime_packet JSONB
    );
    CREATE TABLE personalization.decision_packet_legal_review (
      decision_packet_legal_review_id UUID,
      decision_packet_id UUID,
      user_id UUID,
      review_status TEXT,
      reviewed_at TIMESTAMPTZ,
      advice_prohibited BOOLEAN,
      order_executable BOOLEAN,
      reviewer_ref TEXT,
      review_note TEXT,
      review_digest TEXT,
      created_at TIMESTAMPTZ
    );
    GRANT USAGE ON SCHEMA personalization TO stock_insight_reader, stock_insight_writer;
    GRANT SELECT ON personalization.decision_packet,
      personalization.decision_packet_legal_review
      TO stock_insight_reader, stock_insight_writer;
  `);
  await target.query(
    `CREATE ROLE ${quotedInheritedRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  await target.query(
    `GRANT SELECT (reviewer_ref) ON personalization.decision_packet_legal_review TO ${quotedInheritedRole}`,
  );
  await target.query(`GRANT ${quotedInheritedRole} TO stock_insight_reader`);
  let inheritedColumnPrivilegeRejected = false;
  try {
    await target.query(personalizationReaderSurfaceHardeningMigrationSql);
  } catch (error) {
    if (error?.code !== '42501') throw error;
    inheritedColumnPrivilegeRejected = true;
  }
  if (!inheritedColumnPrivilegeRejected) {
    throw new Error('XG inherited column privilege was not rejected');
  }
  await target.query(`REVOKE ${quotedInheritedRole} FROM stock_insight_reader`);
  await target.query(
    `REVOKE SELECT (reviewer_ref) ON personalization.decision_packet_legal_review FROM ${quotedInheritedRole}`,
  );
  await target.query(`DROP ROLE ${quotedInheritedRole}`);
  await target.query('GRANT SELECT (packet_digest) ON personalization.decision_packet TO PUBLIC');
  let publicColumnPrivilegeRejected = false;
  try {
    await target.query(personalizationReaderSurfaceHardeningMigrationSql);
  } catch (error) {
    if (error?.code !== '42501') throw error;
    publicColumnPrivilegeRejected = true;
  }
  if (!publicColumnPrivilegeRejected) {
    throw new Error('XG PUBLIC column privilege was not rejected');
  }
  await target.query(
    'REVOKE SELECT (packet_digest) ON personalization.decision_packet FROM PUBLIC',
  );
  await target.query(personalizationReaderSurfaceHardeningMigrationSql);
  await target.query(personalizationReaderSurfaceHardeningMigrationSql);

  const readerSurfaceVerified = await probeRoleSurface('stock_insight_reader');
  const writerSurfaceVerified = await probeRoleSurface('stock_insight_writer');

  result = {
    ok:
      readerSurfaceVerified &&
      writerSurfaceVerified &&
      inheritedColumnPrivilegeRejected &&
      publicColumnPrivilegeRejected,
    replayed: true,
    connectedDatabaseVerified: true,
    readerSurfaceVerified,
    writerSurfaceVerified,
    inheritedColumnPrivilegeRejected,
    publicColumnPrivilegeRejected,
    roleStateRestored: false,
  };
  if (!result.ok) throw new Error(`XG privilege invariant failed: ${JSON.stringify(result)}`);
} catch (error) {
  primaryError = error;
} finally {
  if (target) {
    try {
      await target.query('RESET ROLE');
    } catch {}
    try {
      await target.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabase}`);
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await admin.query(`DROP ROLE IF EXISTS ${quotedInheritedRole}`);
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const roleName of roleNames.toReversed()) {
    if (existingRoles.has(roleName)) continue;
    try {
      await admin.query(`DROP ROLE IF EXISTS "${roleName}"`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    const roleStateAfter = await readRoleState();
    const restored = JSON.stringify(roleStateAfter) === JSON.stringify(roleStateBefore);
    if (result) result.roleStateRestored = restored;
    if (!restored) cleanupErrors.push(new Error('XG rehearsal role state was not restored'));
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await admin.end();
  } catch (error) {
    cleanupErrors.push(error);
  }
}

const failures = primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors;
if (failures.length > 0)
  throw new AggregateError(failures, 'XG privilege rehearsal or cleanup failed');
if (!result) throw new Error('XG privilege rehearsal produced no result');
console.log(JSON.stringify(result));
