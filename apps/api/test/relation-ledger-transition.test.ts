import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

import {
  appendRelationEvidence,
  appendRelationRevision,
  RELATION_PIT_SQL,
} from '../src/knowledge/relation-ledger.ts';

const databaseUrl = process.env.STOCK_INSIGHT_RELATION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_RELATION_TEST_DB_URL is required';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('B5 relation revision evidence gate and PIT', () => {
  it(
    'rejects unbound contracts/provisional ontology and accepts only bound identity evidence',
    { skip: skipReason },
    async () => {
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
        const beforeApproval = new Date(
          new Date(row.approved_known_from).getTime() - 1,
        ).toISOString();
        const historical = await client.query(RELATION_PIT_SQL, [
          beforeApproval,
          revisionValidFrom,
        ]);
        const historicalIdentity = historical.rows.find(
          (candidate) => candidate.relation_identity_id === row.relation_identity_id,
        );
        assert.notEqual(historicalIdentity?.revision_status, 'accepted');
        await client.query('BEGIN');
        await client.query(
          `
        INSERT INTO knowledge.relation_evidence_ledger (
          relation_identity_id,evidence_kind,source_contract_revision_id,
          evidence_text,evidence_hash,relation_payload_hash,metadata
        ) VALUES ($1,'source_contract',$2,'unrelated contract',$3,$4,'{"fixture":true}')
      `,
          [
            row.relation_identity_id,
            contract.rows[0]!.id,
            sha(`contract:${row.relation_identity_id}`),
            badPayloadHash,
          ],
        );

        await client.query('SAVEPOINT unbound_contract');
        await assert.rejects(
          () =>
            appendRelationRevision(client, {
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
          () =>
            appendRelationRevision(client, {
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

        const qualifying = await client.query(
          `
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
      `,
          [row.relation_identity_id, row.payload_hash, revisionValidFrom],
        );
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
          beforeRows.rows.find((item) => item.relation_identity_id === row.relation_identity_id)!
            .revision_no,
          row.revision_no,
        );
        assert.equal(
          afterRows.rows.find((item) => item.relation_identity_id === row.relation_identity_id)!
            .revision_no,
          row.revision_no + 1,
        );

        await client.query('SAVEPOINT immutable_check');
        await assert.rejects(
          () =>
            client.query(
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
    },
  );

  it(
    'preserves the accepted past while quarantining the relation after claim retraction',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const entities = await client.query(
          'SELECT entity_id FROM core.entity ORDER BY entity_id LIMIT 2',
        );
        assert.equal(entities.rows.length, 2);
        const subjectId = entities.rows[0]!.entity_id;
        const objectId = entities.rows[1]!.entity_id;
        const suffix = `${Date.now()}-${Math.random()}`;
        const predicate = `B5_TEST_${suffix}`;
        const ontology = await client.query(
          `
        INSERT INTO knowledge.predicate_ontology_revision (
          predicate,revision_no,relation_class,directional,policy_status,effective_from,known_from,description
        ) VALUES ($1,1,'association',true,'approved','-infinity'::timestamptz,now(),'PIT fixture')
        RETURNING predicate_ontology_revision_id
      `,
          [predicate],
        );
        const identity = await client.query(
          `
        INSERT INTO knowledge.relation_identity (
          subject_entity_id,predicate,object_entity_id,identity_hash
        ) VALUES ($1,$2,$3,$4) RETURNING relation_identity_id
      `,
          [subjectId, predicate, objectId, sha(`identity:${suffix}`)],
        );
        const relationIdentityId = identity.rows[0]!.relation_identity_id;
        const claim = await client.query(
          `
        INSERT INTO knowledge.claim (
          subject_entity_id,predicate,object_entity_id,claim_type,observed_at,
          extraction_run_id,metadata
        ) VALUES ($1,$2,$3,'asserted_fact',now(),$4,'{"fixture":true}')
        RETURNING claim_id
      `,
          [subjectId, predicate, objectId, `b5-pit-${suffix}`],
        );
        const claimId = claim.rows[0]!.claim_id;
        const evidenceDocs = await client.query(`
        SELECT DISTINCT ON (document.document_id)
               document.document_id,chunk.chunk_id,left(chunk.content,400) AS quote
        FROM knowledge.document document
        JOIN knowledge.document_chunk chunk USING(document_id)
        ORDER BY document.document_id,chunk.chunk_index
        LIMIT 2
      `);
        assert.equal(evidenceDocs.rows.length, 2);
        for (const doc of evidenceDocs.rows) {
          await client.query(
            `
          INSERT INTO knowledge.claim_evidence (claim_id,document_id,chunk_id,quote)
          VALUES ($1,$2,$3,$4)
        `,
            [claimId, doc.document_id, doc.chunk_id, doc.quote],
          );
        }
        await client.query(
          `
        UPDATE knowledge.claim
        SET verification_status='corroborated',
            metadata=metadata||'{"verification_reason":"PIT fixture","verification_actor":"test"}'::jsonb
        WHERE claim_id=$1
      `,
          [claimId],
        );
        await client.query(
          `
        UPDATE knowledge.claim
        SET verification_status='verified',
            metadata=metadata||'{"verification_reason":"PIT fixture","verification_actor":"test"}'::jsonb
        WHERE claim_id=$1
      `,
          [claimId],
        );
        const payloadHash = sha(`payload:${suffix}`);
        await appendRelationEvidence(client, {
          relationIdentityId,
          claimId,
          relationPayloadHash: payloadHash,
          evidenceText: 'verified claim fixture',
          evidenceHash: sha(`evidence:${suffix}`),
          sourceWeight: 1,
        });
        const revision = await appendRelationRevision(client, {
          relationIdentityId,
          predicateOntologyRevisionId: ontology.rows[0]!.predicate_ontology_revision_id,
          relationKind: 'association',
          confidence: 1,
          revisionStatus: 'accepted',
          validFrom: new Date().toISOString(),
          payloadHash,
          metadata: { fixture: true },
        });
        const created = await client.query(
          'SELECT known_from,valid_from FROM knowledge.relation_revision WHERE relation_revision_id=$1',
          [revision.relationRevisionId],
        );
        await client.query('SELECT pg_sleep(0.01)');
        await client.query(
          `
        UPDATE knowledge.claim
        SET verification_status='retracted',
            metadata=metadata||'{"verification_reason":"PIT fixture retraction","verification_actor":"test"}'::jsonb
        WHERE claim_id=$1
      `,
          [claimId],
        );
        const transition = await client.query(
          `
        SELECT transitioned_at FROM knowledge.verification_transition
        WHERE subject_type='claim' AND subject_id=$1
        ORDER BY verification_transition_id DESC LIMIT 1
      `,
          [claimId],
        );
        const knownMs = new Date(created.rows[0]!.known_from).getTime();
        const transitionMs = new Date(transition.rows[0]!.transitioned_at).getTime();
        assert.ok(transitionMs > knownMs);
        const validAt = new Date(created.rows[0]!.valid_from).toISOString();
        const before = await client.query(RELATION_PIT_SQL, [
          new Date(Math.floor((knownMs + transitionMs) / 2)).toISOString(),
          validAt,
        ]);
        const after = await client.query(RELATION_PIT_SQL, [
          new Date(transitionMs + 1).toISOString(),
          validAt,
        ]);
        assert.equal(
          before.rows.find((row) => row.relation_identity_id === relationIdentityId)!
            .revision_status,
          'accepted',
        );
        assert.equal(
          after.rows.find((row) => row.relation_identity_id === relationIdentityId)!
            .revision_status,
          'quarantined_unverified',
        );
        await client.query('ROLLBACK');
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
  );
});
