import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

import { transitionVerification } from '../src/knowledge/verification-store.ts';

const databaseUrl = process.env.STOCK_INSIGHT_KNOWLEDGE_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_KNOWLEDGE_TEST_DB_URL is required';

describe('B4 verification state machine', () => {
  it('rejects direct verified and one-document verified; accepts two-document path with audit', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const key = `b4-event-${Date.now()}`;
    try {
      const chunks = await client.query(`
        SELECT chunk.chunk_id,chunk.document_id,chunk.content
        FROM knowledge.document_chunk chunk
        ORDER BY chunk.document_id LIMIT 3
      `);
      assert.equal(chunks.rows.length, 3);
      const event = await client.query(`
        INSERT INTO knowledge.event (
          event_type,occurred_at,verification_status,dedupe_key,summary_text,metadata
        ) VALUES ('product_launch',now(),'unverified',$1,'B4 verification fixture','{}')
        RETURNING event_id
      `,[key]);
      const eventId = event.rows[0]!.event_id;
      await assert.rejects(
        () => client.query(`
          INSERT INTO knowledge.event_evidence (event_id,document_id,chunk_id,quote,evidence_role)
          VALUES ($1,$2,$3,$4,'support')
        `,[eventId,chunks.rows[0]!.document_id,chunks.rows[1]!.chunk_id,String(chunks.rows[1]!.content).slice(0,200)]),
        /anchored in its document chunk|foreign key/,
      );
      await assert.rejects(
        () => client.query(`
          INSERT INTO knowledge.event_evidence (event_id,document_id,chunk_id,quote,evidence_role)
          VALUES ($1,$2,$3,'fabricated quote','support')
        `,[eventId,chunks.rows[0]!.document_id,chunks.rows[0]!.chunk_id]),
        /anchored in its document chunk/,
      );
      await client.query(`
        INSERT INTO knowledge.event_evidence (event_id,document_id,chunk_id,quote,evidence_role)
        VALUES ($1,$2,$3,$4,'support')
      `,[eventId,chunks.rows[0]!.document_id,chunks.rows[0]!.chunk_id,String(chunks.rows[0]!.content).slice(0,200)]);

      await client.query('BEGIN');
      await assert.rejects(
        () => transitionVerification(client,{subject:'event',subjectId:eventId,toStatus:'verified',actor:'b4-test',reason:'direct transition must fail'}),
        /invalid verification transition/,
      );
      await client.query('ROLLBACK');

      assert.equal(await transitionVerification(client,{subject:'event',subjectId:eventId,toStatus:'corroborated',actor:'b4-test',reason:'one anchored source'}),true);

      await client.query('BEGIN');
      await assert.rejects(
        () => transitionVerification(client,{subject:'event',subjectId:eventId,toStatus:'verified',actor:'b4-test',reason:'one source is insufficient'}),
        /requires 2 distinct evidence documents/,
      );
      await client.query('ROLLBACK');

      await client.query(`
        INSERT INTO knowledge.event_evidence (event_id,document_id,chunk_id,quote,evidence_role)
        VALUES ($1,$2,$3,$4,'support')
      `,[eventId,chunks.rows[1]!.document_id,chunks.rows[1]!.chunk_id,String(chunks.rows[1]!.content).slice(0,200)]);
      assert.equal(await transitionVerification(client,{subject:'event',subjectId:eventId,toStatus:'verified',actor:'b4-test',reason:'two distinct anchored sources'}),true);

      await client.query(`
        INSERT INTO knowledge.event_evidence (event_id,document_id,chunk_id,quote,evidence_role)
        VALUES ($1,$2,$3,$4,'contradict')
      `,[eventId,chunks.rows[2]!.document_id,chunks.rows[2]!.chunk_id,String(chunks.rows[2]!.content).slice(0,200)]);
      const downgraded = await client.query(
        'SELECT verification_status FROM knowledge.event WHERE event_id=$1',[eventId],
      );
      assert.equal(downgraded.rows[0]!.verification_status,'contradicted');
      await assert.rejects(
        () => client.query('DELETE FROM knowledge.event_evidence WHERE event_id=$1',[eventId]),
        /append-only/,
      );

      const audit = await client.query(`
        SELECT from_status,to_status,distinct_documents
        FROM knowledge.verification_transition
        WHERE subject_type='event' AND subject_id=$1 ORDER BY verification_transition_id
      `,[eventId]);
      assert.deepEqual(audit.rows.map((row)=>`${row.from_status}->${row.to_status}:${row.distinct_documents}`),[
        'unverified->corroborated:1','corroborated->verified:2','verified->contradicted:2',
      ]);
    } finally {
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release();
      await pool.end();
    }
  });

  it('requires actor and reason before any transition request', async () => {
    const fakeClient = {} as pg.PoolClient;
    await assert.rejects(
      () => transitionVerification(fakeClient,{subject:'claim',subjectId:1,toStatus:'corroborated',actor:'',reason:''}),
      /actor and reason/,
    );
  });
});
