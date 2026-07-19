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

function makeClient() {
  const calls: Call[] = [];
  const client = {
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      if (/INSERT INTO knowledge\.relation_identity/i.test(sql)) {
        return { rowCount: 1, rows: [{ relation_identity_id: 71 }] };
      }
      if (/SELECT relation_identity_id/i.test(sql)) {
        return { rowCount: 1, rows: [{ relation_identity_id: 71 }] };
      }
      if (/SELECT relation_revision_id,revision_no FROM knowledge\.relation_revision/i.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO knowledge\.relation_revision/i.test(sql)) {
        return { rowCount: 1, rows: [{ relation_revision_id: 81 }] };
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
});
