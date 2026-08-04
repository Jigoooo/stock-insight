import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { residualFailure } from '../src/ingest/run-event-entity-resolution.ts';

// Migration 012 carried the entity link with a LEFT JOIN onto
// core.entity_identifier, so every legacy signal whose identifier did not exist
// yet landed with target_entity_id NULL. The identifiers arrived later and
// nothing re-ran the join — 1,516 events sat unattributed, which is why they
// reached no stock page and why world.event_participant got 100 rows from 923
// events.

const runner = readFileSync(
  new URL('../src/ingest/run-event-entity-resolution.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../../../packages/db-schema/src/migrations/012_knowledge_backfill.ts', import.meta.url),
  'utf8',
);
const backfill = readFileSync(
  new URL(
    '../../../packages/db-schema/src/migrations/064_feed_label_event_targets.ts',
    import.meta.url,
  ),
  'utf8',
);
const attribution = readFileSync(
  new URL('../src/ingest/run-event-text-attribution.ts', import.meta.url),
  'utf8',
);

test('a run that leaves resolvable events behind is a failure', () => {
  // Events with no identifier chain stay unlinked forever and that is correct —
  // they would need entity extraction from news text. What must never remain is
  // an event this pass COULD have resolved.
  assert.equal(
    residualFailure({
      unlinked: 889,
      unlinkedWithDocument: 889,
      resolvable: 0,
      declinedFeedLabel: 0,
    }),
    null,
  );
  assert.match(
    residualFailure({
      unlinked: 2405,
      unlinkedWithDocument: 889,
      resolvable: 1516,
      declinedFeedLabel: 0,
    }) ?? '',
    /left 1516 resolvable events unlinked/,
  );
  // A declined feed label is not a residual failure. The event stays unlinked on
  // purpose, and treating that as a fault would push the pass back toward
  // accepting a feed name as an answer.
  assert.equal(
    residualFailure({
      unlinked: 2385,
      unlinkedWithDocument: 889,
      resolvable: 0,
      declinedFeedLabel: 1478,
    }),
    null,
  );
});

// A collection-feed label is not a company. Measured 2026-08-04, 1,478 events
// pointed at entities of legacy type 'macro' — us_insider_buys,
// us_corporate_events, gl_major_event, crypto_regulation — so "SEC 8-K JOHNSON &
// JOHNSON" claimed to have reached a company when it had reached the name of the
// feed it arrived on. The legacy chain offers nothing better: the signal's
// raw_json is empty, so there is no ticker in the payload either.
//
// This is a contract, not a comment. The previous version of this rule WAS a
// comment and the pass shipped anyway.
test('a feed label is never accepted as an event target', () => {
  assert.match(
    runner,
    /legacy_entity\.entity_type <> 'macro'/,
    'the resolvable set must exclude collection-feed labels',
  );
  assert.match(
    runner,
    /legacy_entity\.entity_type = 'macro'/,
    'declined rows must be selected so the reason can be recorded',
  );
  // Declining silently would leave "why is this unattributed" answerable only by
  // re-walking the legacy chain.
  assert.match(runner, /'declined_reason', 'feed_label_target'/);
  assert.match(runner, /'feed_label'/);
});

test('the backfill records what it replaced, using the one reversal field', () => {
  // Two ways to reverse a target move would mean neither is trustworthy. The
  // text-attribution pass already writes previous_target_entity_id; the backfill
  // writes the same field rather than inventing a second one.
  assert.match(backfill, /previous_target_entity_id/);
  assert.match(backfill, /SET target_entity_id = NULL/);
  assert.match(backfill, /legacy_entity\.entity_type = 'macro'/);
  assert.match(
    attribution,
    /previous_target_entity_id/,
    'the attribution pass must keep using the same reversal field',
  );
});

test('the resolution chain is foreign keys, not text matching', () => {
  // The whole point: no guessing a company from a headline.
  assert.doesNotMatch(runner, /ILIKE|similarity\(|to_tsvector|canonical_name/);
  for (const step of [
    /legacy_signal_id/,
    /public\.market_signals/,
    /public\.entities/,
    /identifier_type = 'INTERNAL_KEY'/,
  ]) {
    assert.match(runner, step, `resolution chain is missing ${step}`);
  }
});

test('it re-applies the migration rule rather than inventing a new one', () => {
  // Same identifier join the backfill used. If these drift apart, this pass would
  // be attributing events by a rule the original import never agreed to.
  for (const source of [runner, migration]) {
    assert.match(source, /identifier_type = 'INTERNAL_KEY'/);
    assert.match(source, /entity_key/);
  }
});

test('it only fills gaps and never rewrites an existing link', () => {
  // Adjudicating an existing attribution is a different decision with a different
  // evidence bar; this pass is not entitled to make it.
  assert.match(runner, /WHERE event\.target_entity_id IS NULL\s*\n?\s*AND event\.metadata/);
  assert.match(runner, /AND event\.target_entity_id IS NULL/);
  assert.doesNotMatch(runner, /DELETE FROM knowledge\.event/);
});

test('it records how it resolved each event', () => {
  // Without provenance on the row, a later reader cannot tell a backfilled link
  // from an extracted one.
  assert.match(runner, /'entity_resolution'/);
  assert.match(runner, /'legacy-signal-identifier-v1'/);
});
