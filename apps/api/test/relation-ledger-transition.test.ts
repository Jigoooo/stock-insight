import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe,it } from 'node:test';

import pg from 'pg';

import { appendRelationEvidence,appendRelationRevision,RELATION_PIT_SQL } from '../src/knowledge/relation-ledger.ts';

const databaseUrl=process.env.STOCK_INSIGHT_RELATION_TEST_DB_URL;
const skipReason=databaseUrl?false:'STOCK_INSIGHT_RELATION_TEST_DB_URL is required';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');

describe('B5 relation revision evidence gate and PIT',()=>{
  it('rejects evidence-free acceptance, then admits an evidenced revision without mutating history', {skip:skipReason}, async()=>{
    assert.ok(databaseUrl);
    const pool=new pg.Pool({connectionString:databaseUrl,max:1});
    const client=await pool.connect();
    try{
      const selected=await client.query(`
        SELECT revision.relation_identity_id,revision.relation_kind,revision.confidence,
               revision.valid_from,revision.predicate_ontology_revision_id
        FROM knowledge.relation_revision revision
        WHERE revision.revision_status='quarantined_unverified'
        ORDER BY revision.relation_identity_id LIMIT 1
      `);
      const row=selected.rows[0]!;
      const contract=await client.query(`SELECT min(source_contract_revision_id) AS id FROM ingestion.source_contract_revision`);
      await client.query('BEGIN');
      await client.query('SAVEPOINT no_evidence');
      await assert.rejects(
        ()=>appendRelationRevision(client,{
          relationIdentityId:row.relation_identity_id,
          predicateOntologyRevisionId:row.predicate_ontology_revision_id,
          relationKind:row.relation_kind,confidence:row.confidence,
          revisionStatus:'accepted',validFrom:new Date(row.valid_from).toISOString(),
          payloadHash:sha('accept-without-evidence'),metadata:{fixture:true},
        }),
        /requires immutable relation evidence/,
      );
      await client.query('ROLLBACK TO SAVEPOINT no_evidence');

      assert.equal(await appendRelationEvidence(client,{
        relationIdentityId:row.relation_identity_id,
        sourceContractRevisionId:contract.rows[0]!.id,
        evidenceText:'B5 transactional fixture source-contract evidence',
        evidenceHash:sha(`evidence:${row.relation_identity_id}`),sourceWeight:0.8,
      }),true);
      const accepted=await appendRelationRevision(client,{
        relationIdentityId:row.relation_identity_id,
        predicateOntologyRevisionId:row.predicate_ontology_revision_id,
        relationKind:row.relation_kind,confidence:row.confidence,
        revisionStatus:'accepted',validFrom:new Date(row.valid_from).toISOString(),
        payloadHash:sha('accepted-with-evidence'),metadata:{fixture:true},
      });
      assert.equal(accepted.revisionNo,2);
      const created=await client.query(`SELECT known_from FROM knowledge.relation_revision WHERE relation_revision_id=$1`,[accepted.relationRevisionId]);
      const knownFrom=new Date(created.rows[0]!.known_from);
      const before=new Date(knownFrom.getTime()-1).toISOString();
      const after=new Date(knownFrom.getTime()+1).toISOString();
      const validAt=new Date().toISOString();
      const beforeRows=await client.query(RELATION_PIT_SQL,[before,validAt]);
      const afterRows=await client.query(RELATION_PIT_SQL,[after,validAt]);
      assert.equal(beforeRows.rows.find((item)=>item.relation_identity_id===row.relation_identity_id)!.revision_no,1);
      assert.equal(afterRows.rows.find((item)=>item.relation_identity_id===row.relation_identity_id)!.revision_no,2);

      await client.query('SAVEPOINT immutable_check');
      await assert.rejects(
        ()=>client.query(`UPDATE knowledge.relation_revision SET confidence=0 WHERE relation_revision_id=$1`,[accepted.relationRevisionId]),
        /append-only/,
      );
      await client.query('ROLLBACK TO SAVEPOINT immutable_check');
      await client.query('ROLLBACK');
    }finally{
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release(); await pool.end();
    }
  });
});
