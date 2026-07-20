import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

import { coreIdentityGapBackfillMigrationSql } from '../../../packages/db-schema/src/migrations/029_core_identity_gap_backfill.ts';

const databaseUrl = process.env.STOCK_INSIGHT_MIGRATION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_MIGRATION_TEST_DB_URL is required';

describe('029 core identity gap backfill', () => {
  it('declares a unique backfill natural key and returns the conflict winner', () => {
    assert.match(coreIdentityGapBackfillMigrationSql, /CREATE UNIQUE INDEX/);
    assert.match(coreIdentityGapBackfillMigrationSql, /metadata\s*->>\s*'legacy_key'/);
    assert.match(
      coreIdentityGapBackfillMigrationSql,
      /ON CONFLICT[\s\S]*DO UPDATE[\s\S]*RETURNING/,
    );
  });

  it(
    'creates exactly one entity per key under two concurrent applies',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const admin = new pg.Client({ connectionString: databaseUrl });
      await admin.connect();
      try {
        await admin.query(`
        DROP SCHEMA IF EXISTS core CASCADE;
        CREATE SCHEMA core;
        CREATE TABLE core.entity (
          entity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          entity_type TEXT NOT NULL,
          canonical_name TEXT NOT NULL,
          country_code TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'
        );
        CREATE TABLE core.entity_identifier (
          entity_identifier_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
          identifier_type TEXT NOT NULL,
          identifier_value TEXT NOT NULL,
          namespace TEXT NOT NULL,
          valid_from TIMESTAMPTZ NOT NULL,
          UNIQUE(identifier_type, identifier_value)
        );
        CREATE OR REPLACE FUNCTION core.delay_backfill_insert()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.metadata ->> 'backfill' = 'p0-core-identity-gap-v1' THEN
            PERFORM pg_sleep(0.2);
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER delay_backfill_insert
        BEFORE INSERT ON core.entity
        FOR EACH ROW EXECUTE FUNCTION core.delay_backfill_insert();
      `);
      } finally {
        await admin.end();
      }

      const first = new pg.Client({ connectionString: databaseUrl });
      const second = new pg.Client({ connectionString: databaseUrl });
      await Promise.all([first.connect(), second.connect()]);
      try {
        await Promise.all([
          first.query(coreIdentityGapBackfillMigrationSql),
          second.query(coreIdentityGapBackfillMigrationSql),
        ]);
        const result = await first.query(`
        SELECT
          (SELECT count(*)::int FROM core.entity
           WHERE metadata ->> 'backfill' = 'p0-core-identity-gap-v1') AS entities,
          (SELECT count(*)::int FROM core.entity_identifier
           WHERE identifier_type='INTERNAL_KEY'
             AND identifier_value IN ('US:AAL','US:NOK','US:T')) AS identifiers,
          (SELECT count(*)::int
           FROM core.entity entity
           LEFT JOIN core.entity_identifier identifier ON identifier.entity_id=entity.entity_id
           WHERE entity.metadata ->> 'backfill' = 'p0-core-identity-gap-v1'
             AND identifier.entity_id IS NULL) AS orphans
      `);
        assert.deepEqual(result.rows[0], { entities: 3, identifiers: 3, orphans: 0 });
      } finally {
        await Promise.all([first.end(), second.end()]);
      }
    },
  );
});
