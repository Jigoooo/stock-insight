import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import pg from 'pg';

const scriptUrl = new URL('../../../scripts/p0-7-source-contract-approval.sql', import.meta.url);
const databaseUrl = process.env.STOCK_INSIGHT_MIGRATION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_MIGRATION_TEST_DB_URL is required';

describe('P0-7 source contract approval audit', () => {
  it('derives audit counts and rejects unmapped provisional providers', async () => {
    const sql = await readFile(scriptUrl, 'utf8');
    assert.doesNotMatch(sql, /\b29\s*,\s*29\b/);
    assert.match(sql, /unmapped_count/);
    assert.match(sql, /RAISE EXCEPTION/);
    assert.match(sql, /GET DIAGNOSTICS\s+inserted_count\s*=\s*ROW_COUNT/);
  });

  it(
    'rolls back unmapped input and records exact counts for mapped input',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const sql = await readFile(scriptUrl, 'utf8');
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query(`
        DROP SCHEMA IF EXISTS ingestion CASCADE;
        DROP TABLE IF EXISTS public.migration_runs;
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE SCHEMA ingestion;
        CREATE TABLE ingestion.source (
          source_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          provider_key TEXT NOT NULL UNIQUE
        );
        CREATE TABLE ingestion.source_contract_revision (
          source_contract_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          source_id BIGINT NOT NULL REFERENCES ingestion.source(source_id),
          revision_no INTEGER NOT NULL,
          policy_status TEXT NOT NULL,
          cadence_policy JSONB NOT NULL DEFAULT '{}',
          cutoff_policy JSONB NOT NULL DEFAULT '{}',
          delay_policy JSONB NOT NULL DEFAULT '{}',
          correction_policy JSONB NOT NULL DEFAULT '{}',
          required_fields JSONB NOT NULL DEFAULT '[]',
          license_policy JSONB NOT NULL DEFAULT '{}',
          redistribution_policy JSONB NOT NULL DEFAULT '{}',
          raw_retention_policy JSONB NOT NULL DEFAULT '{}',
          quality_gate_policy JSONB NOT NULL DEFAULT '{}',
          effective_from TIMESTAMPTZ NOT NULL,
          known_from TIMESTAMPTZ NOT NULL,
          supersedes_contract_revision_id BIGINT,
          content_hash TEXT NOT NULL,
          UNIQUE(source_id, revision_no)
        );
        CREATE VIEW ingestion.source_contract_current_v1 AS
        SELECT DISTINCT ON (source_id) *
        FROM ingestion.source_contract_revision
        ORDER BY source_id, revision_no DESC;
        CREATE TABLE public.migration_runs (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          run_id TEXT NOT NULL,
          job_name TEXT NOT NULL,
          source_system TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ,
          rows_read INTEGER NOT NULL,
          rows_written INTEGER NOT NULL,
          rows_skipped INTEGER NOT NULL,
          error TEXT,
          summary JSONB NOT NULL
        );
        INSERT INTO ingestion.source(provider_key) VALUES ('fred'),('unmapped-provider');
        INSERT INTO ingestion.source_contract_revision(
          source_id,revision_no,policy_status,effective_from,known_from,content_hash
        )
        SELECT source_id,1,'provisional_review_required',now(),now(),repeat('a',64)
        FROM ingestion.source;
      `);

        await assert.rejects(client.query(sql), /unmapped provisional source providers/);
        await client.query('ROLLBACK');
        assert.equal(
          Number(
            (
              await client.query(
                `SELECT count(*) FROM ingestion.source_contract_revision WHERE revision_no=2`,
              )
            ).rows[0].count,
          ),
          0,
        );
        assert.equal(
          Number((await client.query(`SELECT count(*) FROM public.migration_runs`)).rows[0].count),
          0,
        );

        await client.query(`
        DELETE FROM ingestion.source_contract_revision
        WHERE source_id=(SELECT source_id FROM ingestion.source WHERE provider_key='unmapped-provider');
        DELETE FROM ingestion.source WHERE provider_key='unmapped-provider';
      `);
        await client.query(sql);
        const audit = await client.query(`
        SELECT rows_read,rows_written,rows_skipped
        FROM public.migration_runs
        WHERE job_name='p0-7-source-contract-approval'
        ORDER BY id DESC LIMIT 1
      `);
        assert.deepEqual(audit.rows[0], { rows_read: 1, rows_written: 1, rows_skipped: 0 });
      } finally {
        await client.end();
      }
    },
  );
});
