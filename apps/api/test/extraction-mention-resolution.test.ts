import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveMention } from '../src/ingest/run-knowledge-extraction.ts';

const link = (entity_id: number, canonical_name: string) => ({ entity_id, canonical_name });

/**
 * The source step judged more loosely than the job that cleans up after it.
 *
 * resolveMention returned the FIRST link whose canonical name substring-matched in
 * either direction, with no check for a second candidate, while
 * run-event-text-attribution.ts vetoes a mention that matches more than one entity.
 * Widening the linking surface on 2026-08-06 (+205 documents) puts more entities on
 * each document, so that looseness would have grown with the fix.
 */
describe('mention resolution refuses ambiguity', () => {
  it('resolves a single match', () => {
    const out = resolveMention('삼성전자', [link(1, '삼성전자'), link(2, 'SK하이닉스')]);
    assert.deepEqual(out, { entityId: 1, reason: 'resolved' });
  });

  it('prefers an exact match over a containing one', () => {
    // A document linked to both LG and LG전자 must give "LG전자" to LG전자 rather
    // than refuse: the mention names one of them exactly.
    const out = resolveMention('LG전자', [link(1, 'LG'), link(2, 'LG전자')]);
    assert.deepEqual(out, { entityId: 2, reason: 'resolved' });
  });

  it('refuses when two linked entities both contain the mention', () => {
    // "LG" against LG전자 and LG화학 is a real choice, and picking the first is the
    // invention the attribution jobs already refuse to make.
    const out = resolveMention('LG', [link(1, 'LG전자'), link(2, 'LG화학')]);
    assert.deepEqual(out, { entityId: null, reason: 'ambiguous' });
  });

  it('separates ambiguity from absence', () => {
    // Two different problems with two different fixes: one needs a better mention,
    // the other needs a link that is not there. Counting them together hid both.
    assert.equal(resolveMention('없는회사', [link(1, '삼성전자')]).reason, 'no_match');
    assert.equal(resolveMention('', [link(1, '삼성전자')]).reason, 'no_match');
  });

  it('is case-insensitive but not whitespace-blind', () => {
    assert.equal(resolveMention('  samsung  ', [link(1, 'Samsung')]).entityId, 1);
  });

  it('refuses when a document is linked to the same name twice under two ids', () => {
    // Duplicate identity in the catalog, not in the mention. Guessing here would
    // attach the claim to whichever row was loaded first.
    const out = resolveMention('현대차', [link(1, '현대차'), link(2, '현대차')]);
    assert.deepEqual(out, { entityId: null, reason: 'ambiguous' });
  });
});
