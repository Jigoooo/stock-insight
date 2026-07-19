import type { PoolClient } from 'pg';

export type VerificationSubject = 'claim' | 'event';
export type VerificationStatus =
  | 'corroborated'
  | 'verified'
  | 'contradicted'
  | 'retracted';

/**
 * B4 verification transition. Caller owns the transaction. PostgreSQL triggers
 * enforce the transition matrix, evidence cardinality and chunk-quote anchors;
 * this helper cannot bypass those truth gates.
 */
export async function transitionVerification(
  client: PoolClient,
  input: {
    subject: VerificationSubject;
    subjectId: number;
    toStatus: VerificationStatus;
    actor: string;
    reason: string;
  },
): Promise<boolean> {
  if (!input.actor.trim() || !input.reason.trim()) {
    throw new Error('verification actor and reason are required');
  }
  const idColumn = input.subject === 'claim' ? 'claim_id' : 'event_id';
  const table = input.subject === 'claim' ? 'knowledge.claim' : 'knowledge.event';
  // table/id names come only from the closed union above; values stay bound.
  const result = await client.query(
    `UPDATE ${table}
     SET verification_status=$2,
         metadata=metadata || jsonb_build_object(
           'verification_actor',$3::text,
           'verification_reason',$4::text,
           'verification_requested_at',now()::text
         )
     WHERE ${idColumn}=$1 AND verification_status<>$2
     RETURNING ${idColumn}`,
    [input.subjectId, input.toStatus, input.actor, input.reason],
  );
  return (result.rowCount ?? 0) > 0;
}
