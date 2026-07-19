import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

const databaseUrl = process.env.STOCK_INSIGHT_KNOWLEDGE_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_KNOWLEDGE_TEST_DB_URL is required';

describe('B4 versioned chunk and evidence integrity', () => {
  it('chunks every available legacy title+summary without pretending it is full body', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM knowledge.document document
           JOIN public.source_documents legacy ON legacy.id=document.legacy_source_document_pk
           WHERE length(trim(coalesce(legacy.title,'')||E'\\n'||coalesce(legacy.summary,'')))>0) AS eligible,
          (SELECT count(*)::int FROM knowledge.document_chunk WHERE revision_no=1 AND chunk_index=0) AS chunks,
          (SELECT count(*)::int FROM knowledge.document_chunk
           WHERE content_metadata->>'content_scope'<>'title_and_summary_only'
              OR (content_metadata->>'full_body')::boolean IS DISTINCT FROM false) AS false_full_body,
          (SELECT count(*)::int FROM knowledge.document_chunk
           WHERE content_hash<>encode(sha256(convert_to(content,'UTF8')),'hex')) AS hash_mismatch
      `);
      assert.equal(result.rows[0]!.eligible, 2568);
      assert.equal(result.rows[0]!.chunks, result.rows[0]!.eligible);
      assert.equal(result.rows[0]!.false_full_body, 0);
      assert.equal(result.rows[0]!.hash_mismatch, 0);
    } finally {
      await pool.end();
    }
  });

  it('all corroborated/verified knowledge has the configured distinct docs and chunk quotes', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM knowledge.claim claim
           WHERE claim.verification_status IN ('corroborated','verified')
             AND NOT EXISTS (SELECT 1 FROM knowledge.claim_evidence evidence WHERE evidence.claim_id=claim.claim_id AND evidence.chunk_id IS NOT NULL AND nullif(trim(evidence.quote),'') IS NOT NULL)) AS bad_claims,
          (SELECT count(*)::int FROM knowledge.event event
           WHERE event.verification_status IN ('corroborated','verified')
             AND NOT EXISTS (SELECT 1 FROM knowledge.event_evidence evidence WHERE evidence.event_id=event.event_id AND evidence.chunk_id IS NOT NULL AND nullif(trim(evidence.quote),'') IS NOT NULL)) AS bad_events,
          (SELECT count(*)::int FROM knowledge.event WHERE verification_status='unverified') AS unverified_events
      `);
      assert.equal(result.rows[0]!.bad_claims, 0);
      assert.equal(result.rows[0]!.bad_events, 0);
      // Migration must not auto-upgrade the known legacy event backlog.
      assert.ok(result.rows[0]!.unverified_events >= 3041);
    } finally {
      await pool.end();
    }
  });
});
