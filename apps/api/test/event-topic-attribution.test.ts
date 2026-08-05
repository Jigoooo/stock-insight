import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decideTopic } from '../src/ingest/run-event-topic-attribution.ts';

/**
 * Attaches a macro-natured event to the topic it is about, for the events no
 * company name appears in.
 *
 * Measured on production 2026-08-05 before migration 068: 125 unattributed
 * events match the topic vocabulary, 5 match more than one topic, and the
 * remaining 120 split into rates 17 · energy 17 · fx 3 · growth 1 (topics whose
 * series carry edges, so a path can form) and market 39 · trade 39 ·
 * inflation 4 (attributable, but the topic has no edged series yet).
 */
describe('event topic attribution', () => {
  it('attaches when exactly one topic matches and the topic entity exists', () => {
    const decision = decideTopic({
      topic: 'rates',
      term: '금리',
      topic_matches: 1,
      topic_entity_id: 900,
      topic_has_series: true,
    });

    assert.deepEqual(decision, {
      attach: true,
      topic: 'rates',
      term: '금리',
      topicEntityId: 900,
    });
  });

  it('refuses when the text is about more than one topic', () => {
    // An article about both tariffs and the won is not an article about one of
    // them. Same rule the company job applies to two company names — choosing
    // would be the invention these jobs exist to avoid.
    const decision = decideTopic({
      topic: 'trade',
      term: '관세',
      topic_matches: 2,
      topic_entity_id: 900,
      topic_has_series: true,
    });

    assert.deepEqual(decision, { attach: false, reason: 'ambiguous' });
  });

  it('separates a pending migration from an ambiguity', () => {
    // Before migration 068 every one of the 120 attachable events lands here.
    // Folding it into `ambiguous` would report a schema state as a data quality
    // problem and send the next reader to look at the vocabulary.
    const decision = decideTopic({
      topic: 'energy',
      term: '유가',
      topic_matches: 1,
      topic_entity_id: null,
      topic_has_series: true,
    });

    assert.deepEqual(decision, { attach: false, reason: 'topic_entity_missing' });
  });

  it('checks ambiguity before the entity, so a pending migration cannot mask a guess', () => {
    // If the order were reversed, an ambiguous event with a missing entity would
    // be reported as "migration pending" and would silently start attaching once
    // 068 landed.
    const decision = decideTopic({
      topic: 'trade',
      term: '관세',
      topic_matches: 3,
      topic_entity_id: null,
      topic_has_series: true,
    });

    assert.deepEqual(decision, { attach: false, reason: 'ambiguous' });
  });

  it('tells a permanent dead end apart from a pending migration', () => {
    // market and trade are in the vocabulary but have no macro series under
    // them, so no topic node exists and none should. Measured 2026-08-05: trade
    // has no daily FRED series representing tariffs (BOPGSTB is monthly, NETEXP
    // quarterly, both under the 60-observation minimum), and every stock
    // correlates with an index, so market would be beta.
    //
    // 78 of the 125 matched events land here. Reporting them as
    // 'topic_entity_missing' would say a migration is pending forever.
    const decision = decideTopic({
      topic: 'trade',
      term: '관세',
      topic_matches: 1,
      topic_entity_id: null,
      topic_has_series: false,
    });

    assert.deepEqual(decision, { attach: false, reason: 'topic_has_no_series' });
  });

  it('accepts the counts as strings, which is how pg returns them', () => {
    const decision = decideTopic({
      topic: 'fx',
      term: '환율',
      topic_matches: '1' as unknown as number,
      topic_entity_id: '901' as unknown as number,
      topic_has_series: true,
    });

    assert.equal(decision.attach, true);
    assert.equal(decision.attach && decision.topicEntityId, 901);
  });
});
