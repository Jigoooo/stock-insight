import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SNAPSHOT_EDGE_SELECTOR_SQL } from '../src/analytics/graph-snapshot.ts';
import { ACCEPTED_IDENTITIES_SQL } from '../src/relations/relation-retraction.ts';

/**
 * Retraction must be able to reach everything the graph serves.
 *
 * Two SQL texts decide which accepted revision is the live one, and for a while they
 * decided it differently. The snapshot hides an acceptance only behind an AFFIRMATIVE
 * later verdict, because 'quarantined_unverified' means "we could not verify it this
 * run" and a transient evidence gap must not delete an established relation. Retraction
 * hid it behind ANY later revision.
 *
 * Neither rule is wrong on its own. The gap is between them: a pair that goes accepted,
 * then quarantines on an evidence gap, then genuinely stops holding is still served by
 * the snapshot and is invisible to retraction, so nothing can ever contradict it.
 *
 * Measured 2026-08-11 the live count was 0. It is written as a test rather than a fix
 * and a note because SAME_INDUSTRY landed the same day and makes the path ordinary
 * rather than exotic — 326 of its 602 pairs quarantine on a normal run, every one of
 * them for thin evidence rather than for ceasing to share a code.
 */
describe('the retraction selector and the snapshot selector agree on what is live', () => {
  /** The clause both use to decide whether a later revision supersedes an acceptance. */
  const SUPERSEDING_STATUSES = /newer\.revision_status IN \('accepted', 'rejected', 'superseded'\)/;

  it('both hide an acceptance behind the same set of later verdicts', () => {
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, SUPERSEDING_STATUSES);
    assert.match(ACCEPTED_IDENTITIES_SQL, SUPERSEDING_STATUSES);
  });

  it('neither treats a later quarantine as superseding', () => {
    // The specific value that must stay out of both lists. Adding it would make an
    // evidence gap delete an established relation; that is the failure the snapshot
    // comment records and it applies identically to retraction.
    for (const sql of [SNAPSHOT_EDGE_SELECTOR_SQL, ACCEPTED_IDENTITIES_SQL]) {
      const newerClause = sql.slice(sql.indexOf('newer.revision_status'));
      assert.doesNotMatch(
        newerClause.slice(0, newerClause.indexOf(')') + 1),
        /quarantined_unverified/,
      );
    }
  });

  it('both require the revision itself to be accepted', () => {
    // The other half. Matching only on the `newer` clause would pass a selector that
    // had stopped filtering the revision under consideration at all.
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, /revision\.revision_status = 'accepted'/);
    assert.match(ACCEPTED_IDENTITIES_SQL, /revision\.revision_status = 'accepted'/);
  });

  it('only the snapshot carries PIT clauses, and that difference is deliberate', () => {
    // The snapshot answers "what did the graph look like at an instant" and takes the
    // cutoff as a parameter. Retraction answers "what is standing right now that this
    // run may contradict" and is always issued as of now. Copying the PIT clauses over
    // would silently make retraction skip any edge whose valid_from is in the future.
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, /revision\.valid_from <= \$1::timestamptz/);
    assert.doesNotMatch(ACCEPTED_IDENTITIES_SQL, /::timestamptz/);
  });
});
