import assert from 'node:assert/strict';

import pg from 'pg';

import { SECURITY_DEFINER_ACL_JSON_SQL } from '../dist/index.js';

const databaseUrl = process.env.STOCK_INSIGHT_GUARD_ACL_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('STOCK_INSIGHT_GUARD_ACL_TEST_DATABASE_URL is required');
}

const client = new pg.Client({ connectionString: databaseUrl });

async function readAcl(signature: string) {
  const result = await client.query(
    `SELECT ${SECURITY_DEFINER_ACL_JSON_SQL} AS acl
       FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid = $1::pg_catalog.regprocedure`,
    [signature],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0].acl as Array<Record<string, unknown>>;
}

await client.connect();
try {
  await client.query('BEGIN');
  await client.query('CREATE ROLE "PUBLIC" NOLOGIN');
  await client.query('CREATE ROLE acl_probe_a NOLOGIN');
  await client.query('CREATE ROLE acl_probe_b NOLOGIN');
  await client.query('CREATE SCHEMA acl_probe');
  await client.query(`
    CREATE FUNCTION acl_probe.target()
    RETURNS integer
    LANGUAGE sql
    SECURITY DEFINER
    AS 'SELECT 1'
  `);
  await client.query(`
    CREATE FUNCTION acl_probe.default_acl()
    RETURNS integer
    LANGUAGE sql
    SECURITY DEFINER
    AS 'SELECT 1'
  `);

  await client.query('REVOKE ALL ON FUNCTION acl_probe.target() FROM PUBLIC, "PUBLIC"');
  await client.query('GRANT EXECUTE ON FUNCTION acl_probe.target() TO PUBLIC');
  const pseudoPublic = await readAcl('acl_probe.target()');
  assert.ok(
    pseudoPublic.some((entry) => entry.grantee_kind === 'public' && entry.grantee_name === null),
  );

  await client.query('REVOKE EXECUTE ON FUNCTION acl_probe.target() FROM PUBLIC');
  await client.query('GRANT EXECUTE ON FUNCTION acl_probe.target() TO "PUBLIC"');
  const quotedPublicRole = await readAcl('acl_probe.target()');
  assert.ok(
    quotedPublicRole.some(
      (entry) => entry.grantee_kind === 'role' && entry.grantee_name === 'PUBLIC',
    ),
  );
  assert.notDeepEqual(quotedPublicRole, pseudoPublic);

  await client.query('GRANT EXECUTE ON FUNCTION acl_probe.target() TO "PUBLIC" WITH GRANT OPTION');
  const grantable = await readAcl('acl_probe.target()');
  assert.notDeepEqual(grantable, quotedPublicRole);
  assert.ok(
    grantable.some(
      (entry) =>
        entry.grantee_kind === 'role' &&
        entry.grantee_name === 'PUBLIC' &&
        entry.grantable === true,
    ),
  );

  await client.query('REVOKE ALL ON FUNCTION acl_probe.target() FROM PUBLIC, "PUBLIC"');
  await client.query('GRANT EXECUTE ON FUNCTION acl_probe.target() TO acl_probe_a, acl_probe_b');
  const firstOrder = await readAcl('acl_probe.target()');
  await client.query('REVOKE EXECUTE ON FUNCTION acl_probe.target() FROM acl_probe_a, acl_probe_b');
  await client.query('GRANT EXECUTE ON FUNCTION acl_probe.target() TO acl_probe_b, acl_probe_a');
  const reverseOrder = await readAcl('acl_probe.target()');
  assert.deepEqual(reverseOrder, firstOrder);

  const defaultAcl = await readAcl('acl_probe.default_acl()');
  await client.query('REVOKE EXECUTE ON FUNCTION acl_probe.default_acl() FROM PUBLIC');
  await client.query('GRANT EXECUTE ON FUNCTION acl_probe.default_acl() TO PUBLIC');
  const explicitDefaultAcl = await readAcl('acl_probe.default_acl()');
  assert.deepEqual(explicitDefaultAcl, defaultAcl);

  console.log('SECURITY DEFINER ACL canonicalization: PASS');
} finally {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.end();
}
