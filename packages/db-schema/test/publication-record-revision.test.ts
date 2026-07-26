import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const migrationUrl = new URL(
  '../../../ops/db/migrations/222_publication_record_revision.sql',
  import.meta.url,
);
const rehearsalUrl = new URL(
  '../../../ops/db/tests/222_publication_record_revision_rehearsal.sql',
  import.meta.url,
);

describe('222 publication record revision migration', () => {
  it('creates an immutable payload revision ledger', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ops\.publication_record_revision/);
    assert.match(sql, /UNIQUE \(record_id, payload_sha256\)/);
    assert.match(sql, /CREATE TRIGGER trg_reject_publication_record_revision_mutation/);
    assert.match(sql, /BEFORE UPDATE OR DELETE OR TRUNCATE/);
  });

  it('captures a revision id on every new analysis binding', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS record_revision_id BIGINT/);
    assert.match(sql, /CREATE TRIGGER trg_capture_analysis_run_record_revision/);
    assert.match(sql, /NEW\.record_revision_id/);
    assert.match(sql, /payload snapshot hash does not match binding/);
    assert.match(
      sql,
      /FUNCTION ops\.capture_analysis_run_record_revision\(\)[\s\S]*SECURITY DEFINER/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION ops\.capture_analysis_run_record_revision\(\) FROM PUBLIC/,
    );
  });

  it('appends a recovery revision when the same content hash has an unsealed binding', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /register_analysis_run_contract_v1/);
    assert.match(sql, /immutable payload recovery/);
    assert.match(sql, /binding\.record_revision_id IS NULL/);
    assert.match(sql, /ORDER BY record\.id[\s\S]*FOR UPDATE OF record/);
    assert.match(sql, /same-content recovery payloads have not been restored/);
    assert.match(sql, /current_row\.current_revision \+ 1/);
    assert.match(sql, /invalidated_revision.*next_revision/s);
  });

  it('serves typed records from the immutable snapshot', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /JOIN ops\.publication_record_revision revision/);
    assert.match(
      sql,
      /jsonb_populate_record\(NULL::public\.publication_records, revision\.payload\)/,
    );
    assert.match(sql, /revision\.payload_sha256=binding\.payload_sha256/);
    const servingView = sql.slice(
      sql.indexOf('CREATE OR REPLACE VIEW ops.internal_web_publication_records'),
    );
    assert.doesNotMatch(servingView, /publication_record_payload_sha256\(binding\.record_id\)/);
  });

  it('rehearses writer isolation, same-hash recovery, serving, and replay attacks', async () => {
    const sql = await readFile(rehearsalUrl, 'utf8');
    assert.match(sql, /publication_revision_writer_probe/);
    assert.match(sql, /SET LOCAL ROLE publication_revision_writer_probe/);
    assert.match(sql, /same-content recovery did not append exactly one revision/);
    assert.match(sql, /mutated same-content recovery unexpectedly succeeded/);
    assert.match(sql, /FROM ops\.internal_web_publication_records/);
    assert.match(sql, /wrong-hash active binding unexpectedly succeeded/);
    assert.match(sql, /retraction did not reuse the sealed payload revision/);
    assert.match(sql, /DELETE FROM ops\.publication_record_revision/);
    assert.match(sql, /TRUNCATE ops\.publication_record_revision/);
  });
});
