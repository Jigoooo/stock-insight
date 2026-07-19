import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import type { RelationCandidateDraft } from '../src/relations/builder-core.ts';
import { persistRelationCandidates } from '../src/relations/relation-candidate-store.ts';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

const draft = (overrides: Partial<RelationCandidateDraft> = {}): RelationCandidateDraft => {
  const payloadHash = sha('payload');
  return {
    predicate: 'CLASSIFIED_AS',
    subjectEntityId: 101,
    objectEntityId: 501,
    relationKind: 'structural',
    validFrom: '2026-07-01T00:00:00.000Z',
    payloadHash,
    evidence: [
      {
        sourceRevisionId: 9001,
        relationPayloadHash: payloadHash,
        evidenceText: 'evidence text',
        evidenceHash: sha('evidence'),
        validFrom: '2026-07-01T00:00:00.000Z',
      },
    ],
    policyDecision: { decision: 'accepted', reasons: [] },
    targetRevisionStatus: 'accepted',
    metadata: { builder: 'official-sector-v1' },
    ...overrides,
  };
};

type Call = { sql: string; params: readonly unknown[] };

function makeClient(
  previousRevision: Record<string, unknown> | null = null,
  bigintStrings = false,
) {
  const calls: Call[] = [];
  const client = {
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      if (/INSERT INTO knowledge\.relation_identity/i.test(sql)) {
        return { rowCount: 1, rows: [{ relation_identity_id: bigintStrings ? '71' : 71 }] };
      }
      if (/SELECT relation_identity_id/i.test(sql)) {
        return { rowCount: 1, rows: [{ relation_identity_id: 71 }] };
      }
      if (
        /SELECT relation_revision_id,revision_no/i.test(sql) &&
        /knowledge\.relation_revision/i.test(sql)
      ) {
        return previousRevision === null
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [previousRevision] };
      }
      if (/INSERT INTO knowledge\.relation_revision/i.test(sql)) {
        return { rowCount: 1, rows: [{ relation_revision_id: bigintStrings ? '81' : 81 }] };
      }
      if (/INSERT INTO knowledge\.relation_evidence_ledger/i.test(sql)) {
        return { rowCount: 1, rows: [{ relation_evidence_ledger_id: 91 }] };
      }
      if (/predicate_ontology_revision/i.test(sql)) {
        return { rowCount: 1, rows: [{ predicate_ontology_revision_id: 61 }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  return { client, calls };
}

describe('B6 relation candidate persister', () => {
  it('normalizes node-postgres BIGINT strings at the persistence boundary', async () => {
    const { client } = makeClient(null, true);
    const result = await persistRelationCandidates(client as never, [draft()], {
      predicateOntologyRevisionIds: { CLASSIFIED_AS: 61 },
      confidence: 1,
    });
    assert.equal(result.persisted[0]!.relationIdentityId, 71);
    assert.equal(result.persisted[0]!.relationRevisionId, 81);
    assert.equal(typeof result.persisted[0]!.relationIdentityId, 'number');
    assert.equal(typeof result.persisted[0]!.relationRevisionId, 'number');
  });

  it('writes evidence BEFORE the revision so the accepted guard can see it', async () => {
    const { client, calls } = makeClient();
    const result = await persistRelationCandidates(client as never, [draft()], {
      predicateOntologyRevisionIds: { CLASSIFIED_AS: 61 },
      confidence: 1,
    });
    assert.equal(result.persisted.length, 1);
    assert.equal(result.persisted[0]!.revisionStatus, 'accepted');
    const evidenceIndex = calls.findIndex((c) =>
      /INSERT INTO knowledge\.relation_evidence_ledger/i.test(c.sql),
    );
    const revisionIndex = calls.findIndex((c) =>
      /INSERT INTO knowledge\.relation_revision/i.test(c.sql),
    );
    assert.ok(evidenceIndex >= 0 && revisionIndex >= 0);
    assert.ok(evidenceIndex < revisionIndex, 'evidence must be written before the revision row');
  });

  it('a rejected candidate is never persisted as any revision', async () => {
    const { client, calls } = makeClient();
    const rejected = draft({
      predicate: 'NEWS_COMENTION',
      policyDecision: { decision: 'rejected', reasons: ['predicate_not_promotable'] },
      targetRevisionStatus: 'quarantined_unverified',
      relationKind: 'statistical',
    });
    const result = await persistRelationCandidates(client as never, [rejected], {
      predicateOntologyRevisionIds: { NEWS_COMENTION: 62 },
      confidence: 0.5,
    });
    // Quarantined-unverified revision IS written (auditable), but never accepted.
    assert.equal(result.persisted.length, 1);
    assert.equal(result.persisted[0]!.revisionStatus, 'quarantined_unverified');
    const revisionInsert = calls.find((c) =>
      /INSERT INTO knowledge\.relation_revision/i.test(c.sql),
    );
    assert.ok(revisionInsert);
    assert.ok(revisionInsert.params.includes('quarantined_unverified'));
    assert.ok(!revisionInsert.params.includes('accepted'));
  });

  it('refuses to persist accepted status when the policy decision disagrees (defense in depth)', async () => {
    const { client } = makeClient();
    const inconsistent = draft({
      policyDecision: {
        decision: 'quarantined_unverified',
        reasons: ['insufficient_source_revisions'],
      },
      targetRevisionStatus: 'accepted',
    });
    await assert.rejects(
      () =>
        persistRelationCandidates(client as never, [inconsistent], {
          predicateOntologyRevisionIds: { CLASSIFIED_AS: 61 },
          confidence: 1,
        }),
      /inconsistent/i,
    );
  });

  it('fails closed when the predicate has no approved ontology revision id', async () => {
    const { client } = makeClient();
    await assert.rejects(
      () =>
        persistRelationCandidates(client as never, [draft()], {
          predicateOntologyRevisionIds: {},
          confidence: 1,
        }),
      /ontology revision/i,
    );
  });

  it('replays an unchanged latest revision instead of appending duplicate history', async () => {
    const candidate = draft();
    const { client, calls } = makeClient({
      relation_revision_id: '80',
      revision_no: '3',
      predicate_ontology_revision_id: '61',
      relation_kind: 'structural',
      confidence: 1,
      revision_status: 'accepted',
      valid_from: candidate.validFrom,
      valid_to: null,
      payload_hash: candidate.payloadHash,
    });
    const result = await persistRelationCandidates(client as never, [candidate], {
      predicateOntologyRevisionIds: { CLASSIFIED_AS: 61 },
      confidence: 1,
    });
    assert.equal(result.persisted[0]!.outcome, 'replayed');
    assert.equal(result.persisted[0]!.relationRevisionId, 80);
    assert.equal(result.persisted[0]!.revisionNo, 3);
    assert.ok(calls.some((call) => /relation_evidence_ledger/i.test(call.sql)));
    assert.ok(!calls.some((call) => /INSERT INTO knowledge\.relation_revision/i.test(call.sql)));
  });

  it('persists exact model-config evidence before an accepted statistical revision', async () => {
    const modelConfig = { model: 'tfidf-cosine-v1', threshold: 0.04, degreeCap: 12 };
    const candidate = draft({
      predicate: 'PRODUCT_SIMILARITY',
      relationKind: 'statistical',
      modelConfig,
      metadata: { builder: 'product-similarity-v1', similarityScore: 0.72 },
    });
    const { client, calls } = makeClient();
    await persistRelationCandidates(client as never, [candidate], {
      predicateOntologyRevisionIds: { PRODUCT_SIMILARITY: 62 },
      confidence: (row) => Number(row.metadata['similarityScore']),
    });
    const modelEvidenceIndex = calls.findIndex(
      (call) =>
        /INSERT INTO knowledge\.relation_evidence_ledger/i.test(call.sql) &&
        /model_config/i.test(call.sql),
    );
    const revisionIndex = calls.findIndex((call) =>
      /INSERT INTO knowledge\.relation_revision/i.test(call.sql),
    );
    assert.ok(modelEvidenceIndex >= 0);
    assert.ok(modelEvidenceIndex < revisionIndex);
    const serialized = calls[modelEvidenceIndex]!.params.find(
      (value) => typeof value === 'string' && value.includes('tfidf-cosine-v1'),
    );
    assert.equal(typeof serialized, 'string');
    assert.deepEqual(JSON.parse(serialized as string), modelConfig);
    assert.ok(calls[revisionIndex]!.params.includes(0.72));
  });
});
