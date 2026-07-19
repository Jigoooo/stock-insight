import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

const databaseUrl = process.env.STOCK_INSIGHT_KNOWLEDGE_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_KNOWLEDGE_TEST_DB_URL is required';

describe('B0 report truth publication race guard', () => {
  it('rejects unverified facts and removes the latest pointer after retraction', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const suffix = String(Date.now());
    try {
      await client.query('BEGIN');
      const event = await client.query(`
        SELECT event_id FROM knowledge.event
        WHERE verification_status='unverified'
        ORDER BY event_id LIMIT 1
      `);
      const eventId = event.rows[0]!.event_id;
      const docs = await client.query(`
        SELECT document.document_id, chunk.chunk_id, left(chunk.content,400) AS quote
        FROM knowledge.document document
        JOIN knowledge.document_chunk chunk ON chunk.document_id=document.document_id
        ORDER BY document.document_id LIMIT 3
      `);
      assert.ok(docs.rows.length >= 2);

      const payload = {
        title: 'truth-race-fixture',
        sections: [{
          section_key: 'facts',
          blocks: [{ block_id: 'fact-1', block_type: 'fact', text: 'fixture', citation_ids: ['cit-1'] }],
        }],
      };
      const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const report = await client.query(`
        INSERT INTO content.report (
          report_run_id,report_type,scope_entity_id,audience_key,title,summary,
          report_payload,status,quality_score,content_hash
        )
        SELECT report_run_id,$1,NULL,'global','truth-race-fixture','fixture',
               $2::jsonb,'draft',1.0,$3
        FROM content.report_run ORDER BY report_run_id LIMIT 1
        RETURNING report_id
      `, [`b0-truth-race-${suffix}`, JSON.stringify(payload), hash]);
      const reportId = report.rows[0]!.report_id;
      await client.query(`
        INSERT INTO content.report_evidence (
          report_id,section_key,evidence_type,evidence_id,citation_order
        ) VALUES ($1,'facts','event',$2,1)
      `, [reportId, eventId]);

      await client.query('SAVEPOINT unverified_publish');
      await assert.rejects(
        () => client.query(`UPDATE content.report SET status='published',published_at=now() WHERE report_id=$1`, [reportId]),
        /currently verified event evidence/,
      );
      await client.query('ROLLBACK TO SAVEPOINT unverified_publish');

      for (const doc of docs.rows.slice(0, 2)) {
        await client.query(`
          INSERT INTO knowledge.event_evidence (
            event_id,document_id,chunk_id,quote,evidence_role,source_weight
          ) VALUES ($1,$2,$3,$4,'support',1.0)
          ON CONFLICT (event_id,document_id) DO NOTHING
        `, [eventId, doc.document_id, doc.chunk_id, doc.quote]);
      }
      await client.query(`
        UPDATE knowledge.event
        SET verification_status='corroborated',
            metadata=metadata||'{"verification_reason":"race fixture","verification_actor":"test"}'::jsonb
        WHERE event_id=$1
      `, [eventId]);
      await client.query(`
        UPDATE knowledge.event
        SET verification_status='verified',
            metadata=metadata||'{"verification_reason":"race fixture","verification_actor":"test"}'::jsonb
        WHERE event_id=$1
      `, [eventId]);
      await client.query(
        `UPDATE content.report SET status='published',published_at=now() WHERE report_id=$1`,
        [reportId],
      );
      await client.query(`
        INSERT INTO serving.latest_report_pointer (report_type,scope_key,report_id,switched_at)
        VALUES ($1,$2,$3,now())
      `, [`b0-truth-race-${suffix}`, `scope-${suffix}`, reportId]);

      await client.query(`
        UPDATE knowledge.event
        SET verification_status='retracted',
            metadata=metadata||'{"verification_reason":"race fixture retraction","verification_actor":"test"}'::jsonb
        WHERE event_id=$1
      `, [eventId]);
      const pointer = await client.query(
        'SELECT count(*)::int AS n FROM serving.latest_report_pointer WHERE report_id=$1',
        [reportId],
      );
      assert.equal(pointer.rows[0]!.n, 0);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
