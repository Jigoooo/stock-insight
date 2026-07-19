import type { PoolClient, QueryResultRow } from 'pg';

export type RelationRevisionInput = {
  relationIdentityId: number;
  predicateOntologyRevisionId: number;
  relationKind: string;
  confidence: number;
  revisionStatus: 'accepted' | 'quarantined_unverified' | 'rejected' | 'superseded';
  validFrom: string;
  validTo?: string;
  payloadHash: string;
  metadata?: Record<string,unknown>;
};

export async function appendRelationRevision(
  client: PoolClient,
  input: RelationRevisionInput,
): Promise<{relationRevisionId:number;revisionNo:number}> {
  if (input.confidence<0 || input.confidence>1) throw new Error('confidence must be between 0 and 1');
  if (!/^[a-f0-9]{64}$/i.test(input.payloadHash)) throw new Error('payloadHash must be SHA-256 hex');
  await client.query('SELECT pg_advisory_xact_lock($1)',[input.relationIdentityId]);
  const latest=await client.query<QueryResultRow & {relation_revision_id:number;revision_no:number}>(`
    SELECT relation_revision_id,revision_no FROM knowledge.relation_revision
    WHERE relation_identity_id=$1 ORDER BY revision_no DESC LIMIT 1 FOR UPDATE
  `,[input.relationIdentityId]);
  const previous=latest.rows[0];
  const revisionNo=(previous?.revision_no??0)+1;
  const inserted=await client.query<QueryResultRow & {relation_revision_id:number}>(`
    INSERT INTO knowledge.relation_revision (
      relation_identity_id,revision_no,predicate_ontology_revision_id,
      relation_kind,confidence,revision_status,valid_from,valid_to,known_from,
      supersedes_relation_revision_id,payload_hash,metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11::jsonb)
    RETURNING relation_revision_id
  `,[input.relationIdentityId,revisionNo,input.predicateOntologyRevisionId,input.relationKind,input.confidence,input.revisionStatus,input.validFrom,input.validTo??null,previous?.relation_revision_id??null,input.payloadHash,JSON.stringify(input.metadata??{})]);
  return {relationRevisionId:inserted.rows[0]!.relation_revision_id,revisionNo};
}

export async function appendRelationEvidence(
  client: PoolClient,
  input:{
    relationIdentityId:number;
    claimId:number;
    relationPayloadHash:string;
    evidenceText:string;
    evidenceHash:string;
    sourceWeight?:number;
  },
):Promise<boolean>{
  if (!input.evidenceText.trim()) throw new Error('evidenceText is required');
  if (!/^[a-f0-9]{64}$/i.test(input.evidenceHash)) throw new Error('evidenceHash must be SHA-256 hex');
  if (!/^[a-f0-9]{64}$/i.test(input.relationPayloadHash)) throw new Error('relationPayloadHash must be SHA-256 hex');
  const result=await client.query(`
    INSERT INTO knowledge.relation_evidence_ledger (
      relation_identity_id,evidence_kind,claim_id,relation_payload_hash,
      evidence_text,evidence_hash,source_weight,metadata
    ) VALUES ($1,'claim',$2,$3,$4,$5,$6,'{"writer":"relation-store","policy":"verified-claim-only"}')
    ON CONFLICT (relation_identity_id,evidence_hash) DO NOTHING
    RETURNING relation_evidence_ledger_id
  `,[input.relationIdentityId,input.claimId,input.relationPayloadHash,input.evidenceText,input.evidenceHash,input.sourceWeight??null]);
  return (result.rowCount??0)>0;
}

export const RELATION_PIT_SQL=`
SELECT DISTINCT ON (identity.relation_identity_id)
       identity.relation_identity_id,identity.subject_entity_id,identity.predicate,identity.object_entity_id,
       revision.relation_revision_id,revision.revision_no,
       CASE WHEN revision.revision_status='accepted'
                  AND ontology.policy_status='approved'
                  AND ontology.known_from<=$1::timestamptz
                  AND EXISTS (
                    SELECT 1 FROM knowledge.relation_evidence_ledger evidence
                    WHERE evidence.relation_identity_id=identity.relation_identity_id
                      AND evidence.relation_payload_hash=revision.payload_hash
                      AND evidence.recorded_at<=$1::timestamptz
                      AND (evidence.valid_from IS NULL OR evidence.valid_from<=$2::timestamptz)
                      AND (evidence.valid_to IS NULL OR evidence.valid_to>$2::timestamptz)
                      AND (
                        (evidence.evidence_kind='identity_mapping' AND identity.predicate='ISSUED_BY'
                          AND EXISTS (
                            SELECT 1 FROM core.security_issuer_identity mapping
                            WHERE mapping.security_issuer_identity_id=evidence.security_issuer_identity_id
                              AND mapping.security_entity_id=identity.subject_entity_id
                              AND mapping.issuer_entity_id=identity.object_entity_id
                          ))
                        OR (evidence.evidence_kind='claim' AND EXISTS (
                          SELECT 1 FROM knowledge.claim claim
                          WHERE claim.claim_id=evidence.claim_id
                            AND claim.verification_status='verified'
                            AND claim.subject_entity_id=identity.subject_entity_id
                            AND claim.predicate=identity.predicate
                            AND claim.object_entity_id=identity.object_entity_id
                        ))
                      )
                  )
            THEN 'accepted'
            WHEN revision.revision_status='accepted' THEN 'quarantined_unverified'
            ELSE revision.revision_status END AS revision_status,
       revision.relation_kind,revision.confidence,revision.valid_from,revision.valid_to,
       revision.known_from,revision.metadata
FROM knowledge.relation_identity identity
JOIN knowledge.relation_revision revision USING(relation_identity_id)
JOIN knowledge.predicate_ontology_revision ontology
  ON ontology.predicate_ontology_revision_id=revision.predicate_ontology_revision_id
WHERE revision.known_from<=$1::timestamptz
  AND revision.valid_from<=$2::timestamptz
  AND (revision.valid_to IS NULL OR revision.valid_to>$2::timestamptz)
ORDER BY identity.relation_identity_id,revision.revision_no DESC
`;
