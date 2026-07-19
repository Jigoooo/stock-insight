import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

import { appendRelationRevision, RELATION_PIT_SQL } from '../src/knowledge/relation-ledger.ts';

const databaseUrl = process.env.STOCK_INSIGHT_RELATION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_RELATION_TEST_DB_URL is required';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('B5 relation revision evidence gate and PIT', () => {
  it('rejects unbound contracts/provisional ontology and accepts only bound identity evidence', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      const selected = await client.query(`
        WITH latest AS (
          SELECT DISTINCT ON (relation_identity_id) *
          FROM knowledge.relation_revision
          ORDER BY relation_identity_id,revision_no DESC
        )
        SELECT latest.relation_identity_id,latest.relation_kind,latest.confidence,
               latest.valid_from,latest.revision_no,latest.payload_hash,
               approved.predicate_ontology_revision_id AS approved_ontology_id,
               approved.known_from AS approved_known_from,
               provisional.predicate_ontology_revision_id AS provisional_ontology_id
        FROM latest
        JOIN knowledge.relation_identity identity USING(relation_identity_id)
        JOIN knowledge.predicate_ontology_revision approved
          ON approved.predicate=identity.predicate AND approved.policy_status='approved'
        JOIN knowledge.predicate_ontology_revision provisional
          ON provisional.predicate=identity.predicate AND provisional.policy_status='provisional_review_required'
        WHERE identity.predicate='ISSUED_BY' AND latest.revision_status='accepted'
        ORDER BY latest.relation_identity_id LIMIT 1
      `);
      const row = selected.rows[0]!;
      const contract = await client.query(
        'SELECT min(source_contract_revision_id) AS id FROM ingestion.source_contract_revision',
      );
      const badPayloadHash = sha(`unbound:${row.relation_identity_id}`);
      const revisionValidFrom = new Date().toISOString();
      const beforeApproval = new Date(new Date(row.approved_known_from).getTime()-1).toISOString();
      const historical = await client.query(RELATION_PIT_SQL,[beforeApproval,revisionValidFrom]);
      const historicalIdentity = historical.rows.find(
        (candidate) => candidate.relation_identity_id === row.relation_identity_id,
      );
      assert.equal(historicalIdentity?.revision_status,'quarantined_unverified');
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO knowledge.relation_evidence_ledger (
          relation_identity_id,evidence_kind,source_contract_revision_id,
          evidence_text,evidence_hash,relation_payload_hash,metadata
        ) VALUES ($1,'source_contract',$2,'unrelated contract',$3,$4,'{"fixture":true}')
      `, [row.relation_identity_id, contract.rows[0]!.id, sha(`contract:${row.relation_identity_id}`), badPayloadHash]);

      await client.query('SAVEPOINT unbound_contract');
      await assert.rejects(
        () => appendRelationRevision(client, {
          relationIdentityId: row.relation_identity_id,
          predicateOntologyRevisionId: row.approved_ontology_id,
          relationKind: row.relation_kind,
          confidence: row.confidence,
          revisionStatus: 'accepted',
          validFrom: revisionValidFrom,
          payloadHash: badPayloadHash,
          metadata: { fixture: true },
        }),
        /qualifying evidence bound to payload hash/,
      );
      await client.query('ROLLBACK TO SAVEPOINT unbound_contract');

      await client.query('SAVEPOINT provisional_ontology');
      await assert.rejects(
        () => appendRelationRevision(client, {
          relationIdentityId: row.relation_identity_id,
          predicateOntologyRevisionId: row.provisional_ontology_id,
          relationKind: row.relation_kind,
          confidence: row.confidence,
          revisionStatus: 'accepted',
          validFrom: revisionValidFrom,
          payloadHash: row.payload_hash,
          metadata: { fixture: true },
        }),
        /matching approved predicate ontology/,
      );
      await client.query('ROLLBACK TO SAVEPOINT provisional_ontology');

      const qualifying = await client.query(`
        SELECT count(*)::int AS n
        FROM knowledge.relation_evidence_ledger evidence
        JOIN knowledge.relation_identity identity
          ON identity.relation_identity_id=evidence.relation_identity_id
        WHERE evidence.relation_identity_id=$1
          AND evidence.relation_payload_hash=$2
          AND (evidence.valid_from IS NULL OR evidence.valid_from<=$3::timestamptz)
          AND (evidence.valid_to IS NULL OR evidence.valid_to>$3::timestamptz)
          AND evidence.evidence_kind='identity_mapping'
          AND identity.predicate='ISSUED_BY'
          AND EXISTS (
            SELECT 1 FROM core.security_issuer_identity mapping
            WHERE mapping.security_issuer_identity_id=evidence.security_issuer_identity_id
              AND mapping.security_entity_id=identity.subject_entity_id
              AND mapping.issuer_entity_id=identity.object_entity_id
          )
      `, [row.relation_identity_id, row.payload_hash, revisionValidFrom]);
      assert.equal(qualifying.rows[0]!.n, 1);

      const accepted = await appendRelationRevision(client, {
        relationIdentityId: row.relation_identity_id,
        predicateOntologyRevisionId: row.approved_ontology_id,
        relationKind: row.relation_kind,
        confidence: row.confidence,
        revisionStatus: 'accepted',
        validFrom: revisionValidFrom,
        payloadHash: row.payload_hash,
        metadata: { fixture: true },
      });
      assert.equal(accepted.revisionNo, row.revision_no + 1);
      const created = await client.query(
        'SELECT known_from FROM knowledge.relation_revision WHERE relation_revision_id=$1',
        [accepted.relationRevisionId],
      );
      const knownFrom = new Date(created.rows[0]!.known_from);
      const beforeRows = await client.query(RELATION_PIT_SQL, [
        new Date(knownFrom.getTime() - 1).toISOString(),
        new Date().toISOString(),
      ]);
      const afterRows = await client.query(RELATION_PIT_SQL, [
        new Date(knownFrom.getTime() + 1).toISOString(),
        new Date().toISOString(),
      ]);
      assert.equal(
        beforeRows.rows.find((item) => item.relation_identity_id === row.relation_identity_id)!.revision_no,
        row.revision_no,
      );
      assert.equal(
        afterRows.rows.find((item) => item.relation_identity_id === row.relation_identity_id)!.revision_no,
        row.revision_no + 1,
      );

      await client.query('SAVEPOINT immutable_check');
      await assert.rejects(
        () => client.query(
          'UPDATE knowledge.relation_revision SET confidence=0 WHERE relation_revision_id=$1',
          [accepted.relationRevisionId],
        ),
        /append-only/,
      );
      await client.query('ROLLBACK TO SAVEPOINT immutable_check');
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});