import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

const databaseUrl=process.env.STOCK_INSIGHT_RELATION_TEST_DB_URL;
const skipReason=databaseUrl?false:'STOCK_INSIGHT_RELATION_TEST_DB_URL is required';

describe('B5 relation ledger backfill and public stop-line',()=>{
  it('preserves all legacy relations but only evidence-backed identities are accepted/public', {skip:skipReason}, async()=>{
    assert.ok(databaseUrl);
    const pool=new pg.Pool({connectionString:databaseUrl,max:1});
    try{
      const result=await pool.query(`
        SELECT
          (SELECT count(*)::int FROM knowledge.relation) AS legacy,
          (SELECT count(*)::int FROM knowledge.relation_identity) AS identities,
          (SELECT count(*)::int FROM knowledge.relation_revision WHERE revision_no=1) AS baseline_revisions,
          (SELECT count(*)::int FROM knowledge.relation_revision WHERE revision_no=1 AND revision_status='accepted') AS accepted,
          (SELECT count(*)::int FROM knowledge.relation_revision WHERE revision_no=1 AND revision_status='quarantined_unverified') AS quarantined,
          (SELECT count(*)::int FROM knowledge.relation_revision revision
           WHERE revision.revision_status='accepted' AND NOT EXISTS(
             SELECT 1 FROM knowledge.relation_evidence_ledger evidence
             WHERE evidence.relation_identity_id=revision.relation_identity_id
           )) AS accepted_without_evidence,
          (SELECT count(*)::int FROM serving.relation_current_v1) AS public_relations,
          (SELECT count(*)::int FROM serving.relation_current_v1 WHERE predicate<>'ISSUED_BY') AS unexpected_public
      `);
      assert.equal(result.rows[0]!.legacy,3566);
      assert.equal(result.rows[0]!.identities,result.rows[0]!.legacy);
      assert.equal(result.rows[0]!.baseline_revisions,result.rows[0]!.legacy);
      assert.equal(result.rows[0]!.accepted,254);
      assert.equal(result.rows[0]!.quarantined,3312);
      assert.equal(result.rows[0]!.accepted_without_evidence,0);
      assert.equal(result.rows[0]!.public_relations,254);
      assert.equal(result.rows[0]!.unexpected_public,0);
    }finally{await pool.end();}
  });

  it('keeps legacy predicates provisional except the evidence-backed ISSUED_BY policy', {skip:skipReason}, async()=>{
    assert.ok(databaseUrl);
    const pool=new pg.Pool({connectionString:databaseUrl,max:1});
    try{
      const result=await pool.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER(WHERE policy_status='provisional_review_required')::int AS provisional,
               count(*) FILTER(WHERE policy_status='approved' AND predicate='ISSUED_BY')::int AS approved_issued_by,
               count(*) FILTER(WHERE policy_status='approved' AND predicate<>'ISSUED_BY')::int AS unexpected_approved
        FROM knowledge.predicate_ontology_revision
      `);
      assert.ok(result.rows[0]!.total>0);
      assert.equal(result.rows[0]!.provisional,result.rows[0]!.total-1);
      assert.equal(result.rows[0]!.approved_issued_by,1);
      assert.equal(result.rows[0]!.unexpected_approved,0);
    }finally{await pool.end();}
  });
});
