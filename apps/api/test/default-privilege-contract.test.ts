import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

// No schema may hand the application roles a privilege on tables nobody has decided to
// share. This is the check that was missing when the same failure shipped twice.
//
// 2026-08-03, migration 059: serving.impact_summary_v2 was created, the reader received
// SELECT on it without any GRANT in the file, relation_privileges_digest moved, and
// live-database-guard.ts threw on boot. The log said only "live database verification
// failed for stock_insight_app_reader" — no indication which of ~40 conditions failed —
// and ops/scripts/repin-live-database-digests.mjs was written to make the next one
// diagnosable.
//
// 2026-08-10, migration 099: identical failure. Its header states, in good faith, "NO
// grant to stock_insight_app_reader and NO EXPECTED_CATALOG_DIGESTS change", while all
// four of its serving relations carry `stock_insight_app_reader=r/research_app` in
// pg_class.relacl. The author was right about the file and wrong about the database,
// because migration 007 line 159 left an ALTER DEFAULT PRIVILEGES standing in serving —
// and five sibling schemas carried the same instruction.
//
// A repin script makes the second occurrence cheaper to diagnose. It does not stop a
// third. Migration 117 removed all six default privileges; this test is what keeps them
// from being reintroduced.
//
// WHAT THIS TEST DOES NOT YET DO, stated because the mistake above was a header that was
// true about its file and false about the world. It does not run in `pnpm test`. The
// turbo `test` task declares no `env` or `passThroughEnv` and turbo runs in strict env
// mode, so DATABASE_URL never reaches the child process and this skips — silently, inside
// a suite that reports green. That is not specific to this file: measured 2026-08-11,
// 47 tests in this package skip that way, and running them directly with the URL exported
// passes 1309 of 1354 with zero failures. There is also no `.github/workflows` directory,
// so there is no CI to fail in. Until a runner exports the URL and asserts `skipped 0`,
// this file is a check you can run, not a gate that runs itself.
//
// Beyond the outage, personalization was among the six. REQ-SEM-003 and REQ-REC-001 hold
// that private per-user derivations are readable only by explicit decision — three of
// that schema's ten tables are, deliberately and scoped by a transaction-local user GUC.
// A default privilege would have added the eleventh table silently.
//
// Requires a live connection. Skipped without one, because a check that silently passes
// when it cannot run is worse than no check.
const databaseUrl = process.env.STOCK_INSIGHT_LIVE_READ_DB_URL ?? process.env.DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : 'STOCK_INSIGHT_LIVE_READ_DB_URL or DATABASE_URL is required';

// aclexplode rather than a LIKE over defaclacl::text. The text form is
// `grantee=privs/grantor`, so a substring match also fires on the grantor half and would
// pass or fail for the wrong reason. Expanding the ACL compares the grantee OID itself.
//
// PUBLIC IS IN THE LIST BECAUSE THE ROLE NAMES ARE NOT THE THING BEING PROTECTED. A
// default privilege granted `TO PUBLIC` records grantee OID 0, which renders as '-' and
// slips past a filter that names the two app roles — while still handing the reader
// SELECT on every future table, because PUBLIC includes it. The boot guard measures
// effective privilege (`has_table_privilege(current_user, ...)`), so that route moves the
// same digests and crashloops the brain identically. Reproduced 2026-08-11: a default ACL
// granted to PUBLIC left `has_table_privilege('stock_insight_app_reader', ..., 'SELECT')`
// true while the role-name filter returned nothing. No migration in this package grants
// anything TO PUBLIC today (only REVOKE ... FROM PUBLIC appears), so this is a door being
// shut before anyone walks through it, not a leak being patched.
const DEFAULT_ACL_SQL = `
  SELECT default_acl.defaclnamespace::regnamespace::text AS schema_name,
         default_acl.defaclobjtype AS object_type,
         CASE WHEN entry.grantee = 0 THEN 'PUBLIC'
              ELSE entry.grantee::regrole::text
         END AS grantee_name,
         entry.privilege_type AS privilege
    FROM pg_catalog.pg_default_acl default_acl
   CROSS JOIN pg_catalog.aclexplode(default_acl.defaclacl) entry
   WHERE entry.grantee = 0
      OR entry.grantee::regrole::text IN (
           'stock_insight_app_reader',
           'stock_insight_app_writer'
         )
   ORDER BY 1, 2, 3, 4
`;

describe('no schema grants the app roles privileges on objects by default', () => {
  it(
    'has no pg_default_acl entry reaching the app roles, by name or through PUBLIC',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const client = await pool.connect();
        try {
          // Read-only and rolled back: this test never changes what it measures.
          await client.query('BEGIN READ ONLY');
          const { rows } = await client.query(DEFAULT_ACL_SQL);
          await client.query('ROLLBACK');

          // Named, not counted. A failure here has to say which schema to write the
          // REVOKE against, or the next author repeats the hunt this test exists to end.
          const offenders = rows.map(
            (row) =>
              `${row.schema_name} (objtype ${row.object_type}): ${row.grantee_name} ${row.privilege}`,
          );
          assert.deepEqual(
            offenders,
            [],
            `pg_default_acl grants the app roles privileges on future objects. Every object created in these schemas is handed over with no GRANT in any migration, which moves the catalog digests in live-database-guard.ts and crashloops the brain on boot. Add an ALTER DEFAULT PRIVILEGES ... REVOKE in a new migration, as 117 did:\n  ${offenders.join('\n  ')}`,
          );
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    },
  );
});
