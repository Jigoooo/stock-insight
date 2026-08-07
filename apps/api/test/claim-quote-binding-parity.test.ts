import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INSERT_CLAIM_EVIDENCE_SQL,
  quoteBindsToDocument,
} from '../src/ingest/run-knowledge-extraction.ts';

/**
 * Validation and binding must ask the same question about a quote.
 *
 * They did not, and it took the knowledge pipeline down from 2026-08-07 01:46.
 * `validateClaim` accepted a quote whose FIRST 40 CHARACTERS appeared in the
 * document; `INSERT_CLAIM_EVIDENCE_SQL` binds only when the WHOLE quote appears in
 * a chunk. A quote verbatim for 40 characters and drifting afterwards passed the
 * first and failed the second — and the binding failure is a `throw`, not a
 * rejection, so a single such claim aborted the transaction and every later run.
 *
 * The tell was that knowledge.claim stopped at claim_id 348 while the error named
 * 349, 350, … — the sequence advanced, the rows rolled back.
 *
 * These cases are the divergence itself, not the symptom. A future edit that
 * relaxes one side has to fail here.
 */
describe('claim quote binding parity', () => {
  const doc = 'Acme raises guidance\nAcme said on Tuesday that it now expects revenue of $4.2B.';

  it('accepts a quote that is present in full', () => {
    assert.equal(quoteBindsToDocument('Acme said on Tuesday', doc), true);
    assert.equal(quoteBindsToDocument('  Acme raises guidance  ', doc), true);
  });

  it('REJECTS a quote that matches only its first 40 characters', () => {
    // 40 chars of truth, then invention. This is the exact shape that broke the
    // pipeline: the old check sliced to 40 and never looked at the rest.
    const head = doc.slice(21, 61);
    assert.equal(head.length, 40);
    const drifting = `${head} and announced a special dividend.`;
    assert.equal(
      doc.includes(drifting.slice(0, 40)),
      true,
      'precondition: the old 40-char check would have accepted this',
    );
    assert.equal(quoteBindsToDocument(drifting, doc), false);
  });

  it('matches case-insensitively, because the SQL lowers both sides', () => {
    assert.equal(quoteBindsToDocument('ACME RAISES GUIDANCE', doc), true);
  });

  it('rejects empty and whitespace-only quotes', () => {
    assert.equal(quoteBindsToDocument(undefined, doc), false);
    assert.equal(quoteBindsToDocument('', doc), false);
    assert.equal(quoteBindsToDocument('   \n  ', doc), false);
  });

  it('truncates at 1000 characters, the same place the SQL parameter does', () => {
    // The binding parameter is `claim.quote.slice(0, 1000)`. A quote longer than
    // that binds on its first 1000 characters, so validation must too — otherwise
    // long quotes fail validation and never reach a binding that would have worked.
    const long = `${'x'.repeat(1200)}`;
    const docWithLong = `title\n${'x'.repeat(1000)}`;
    assert.equal(quoteBindsToDocument(long, docWithLong), true);
  });

  it('the SQL still binds on the full lowered quote', () => {
    // Guards the other direction: if the SQL is ever loosened to a prefix match,
    // the helper above stops describing it and this file stops meaning anything.
    assert.match(INSERT_CLAIM_EVIDENCE_SQL, /position\(lower\(trim\(\$3\)\) in lower\(chunk\.content\)\)/);
    assert.match(INSERT_CLAIM_EVIDENCE_SQL, /chunk\.revision_no=\$4/);
  });
});
