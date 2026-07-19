import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  appendSourceRevisionRelationEvidence,
  RELATION_PIT_SQL,
} from '../src/knowledge/relation-ledger.ts';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('B6 source-revision relation evidence store', () => {
  it('writes an exact source revision binding and exposes the same evidence class to PIT reads', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const client = {
      async query(sql: string, params: readonly unknown[] = []) {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [{ relation_evidence_ledger_id: 91 }] };
      },
    };
    const payloadHash = sha('relation-payload');
    const evidenceHash = sha('source-revision-evidence');

    const inserted = await appendSourceRevisionRelationEvidence(client, {
      relationIdentityId: 12,
      sourceRevisionId: 34,
      relationPayloadHash: payloadHash,
      evidenceText: 'SEC filing source revision 34',
      evidenceHash,
      sourceWeight: 0.95,
      validFrom: '2026-01-01T00:00:00.000Z',
      metadata: { builder: 'official-sector-v1' },
    });

    assert.equal(inserted, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.sql, /evidence_kind,source_revision_id/);
    assert.match(calls[0]!.sql, /'source_revision'/);
    assert.deepEqual(calls[0]!.params.slice(0, 4), [
      12,
      34,
      payloadHash,
      'SEC filing source revision 34',
    ]);
    assert.match(RELATION_PIT_SQL, /evidence\.evidence_kind='source_revision'/);
    assert.match(RELATION_PIT_SQL, /source_revision\.available_at<=\$1::timestamptz/);
  });
});
