export const defaultPrivilegeVisibilityMigrationSql = `
-- Stops six schemas from granting the reader SELECT on every table created in them
-- from now on. REVOKE only; nothing here touches an existing GRANT.
--
-- WHAT IS ACTUALLY WRONG. Migration 007 line 159 wrote
--   ALTER DEFAULT PRIVILEGES IN SCHEMA serving GRANT SELECT ON TABLES
--     TO stock_insight_app_reader
-- and five sibling migrations wrote the same statement for analytics, content,
-- knowledge, market and personalization. A default privilege is not a one-time grant.
-- It is a standing instruction to the server: every table CREATEd in that schema by
-- research_app afterwards is handed to stock_insight_app_reader at creation, with no
-- statement in any migration saying so. pg_default_acl currently holds exactly six
-- rows, all owned by research_app, all objtype 'r', all reading
-- {stock_insight_app_reader=r/research_app}. The writer appears in none of them.
--
-- WHY IT MATTERS TWICE OVER. First as an outage: a table created in one of these
-- schemas moves relation_privileges_digest in live-database-guard.ts without its author
-- writing a GRANT, so the boot guard throws and the brain crashloops. That happened on
-- 2026-08-03 with 059 and again on 2026-08-10 with 099 — whose header states in good
-- faith that it grants the reader nothing, because the file does not, while all four of
-- its serving relations carry the reader in pg_class.relacl. Second as a privacy leak in
-- waiting: personalization is on the list. REQ-SEM-003 and REQ-REC-001 hold that private
-- per-user derivations must not become readable by default; today the product reads
-- three of that schema's ten tables (user_profile, user_feed_item, user_asset_affinity)
-- under BEGIN READ ONLY with a transaction-local user GUC, which is a deliberate scoped
-- decision. The eleventh table nobody decided about should not join them silently.
--
-- WHY REVOKE ONLY, AND NO RE-GRANT. The obvious-looking repair — revoke the default,
-- then enumerate the tables that legitimately need reading and GRANT those explicitly —
-- is the dangerous one. information_schema.table_privileges does not record which GRANT
-- came from a default privilege and which was written by hand; both appear identically.
-- So the enumeration would have to be reconstructed by judgement across 688 reader
-- grants, and one omission does not fail at boot where the guard would catch it. It
-- fails at runtime, in production, as a permission error on a read path, at whatever
-- hour that path first runs.
--
-- REVOKE alone needs no enumeration, because ALTER DEFAULT PRIVILEGES governs future
-- objects only. Privileges already materialised on existing relations live in
-- pg_class.relacl and are untouched by removing the standing instruction. All 688
-- current reader grants survive, both catalog digests stay where the re-pin in this same
-- landing put them, and the leak closes for everything created after this migration.
-- Verified: grant count and digests measured before and after --apply.
--
-- The cost this accepts is that a future table in these schemas genuinely needed by a
-- read path must be granted explicitly. That is the point. A grant a human wrote is a
-- grant a human can be asked about.
--
-- No FOR ROLE clause: these run as research_app, which is the defaclrole on all six
-- rows, so the unqualified form targets exactly them. A REVOKE against a default
-- privilege that does not exist is a no-op, which keeps this safe to replay on a
-- database provisioned without one of the schemas' grants.
--
-- THE ROLE GUARD IS NOT DECORATION. Every statement this migration undoes was written
-- inside IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader')
-- — 007 line 156, and the same shape in 010, 011, 013 and 015. Those authors did not
-- assume the role exists, because nothing in this package creates it: it is provisioned
-- outside the migration series, and the logical-backup path dumps and restores roles
-- separately from schema. An unguarded REVOKE therefore raises a
-- "role stock_insight_app_reader does not exist" error and stops the whole run on any
-- database bootstrapped from migrations alone.
--
-- That asymmetry cannot be repaired by a later migration, because this one runs first.
-- It is fixed here, before this file was ever committed, which is the only window in
-- which editing an applied migration is honest: the applied record existed on one
-- database for minutes and no clone had ever seen the file. The REVOKE is idempotent,
-- so re-applying under the guard changed nothing that was already true — verified by
-- re-measuring the grant count, the pg_default_acl row count and both catalog digests
-- afterwards.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
      REVOKE SELECT ON TABLES FROM stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA content
      REVOKE SELECT ON TABLES FROM stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA knowledge
      REVOKE SELECT ON TABLES FROM stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA market
      REVOKE SELECT ON TABLES FROM stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA personalization
      REVOKE SELECT ON TABLES FROM stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA serving
      REVOKE SELECT ON TABLES FROM stock_insight_app_reader;
  END IF;
END $$;
`;
