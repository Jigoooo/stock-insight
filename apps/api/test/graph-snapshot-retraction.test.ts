import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SNAPSHOT_EDGE_SELECTOR_SQL } from '../src/analytics/graph-snapshot.ts';

/**
 * A later verdict has to be able to REMOVE an edge, not just fail to add one.
 *
 * The selector's supersede check read `newer.revision_status = 'accepted'`, so a
 * builder that stopped producing a pair left its last acceptance standing
 * forever and the graph became the union of every run that ever accepted it.
 *
 * Measured on production 2026-08-05: beta adjustment cut MACRO_COMOVEMENT to 23
 * accepted candidates, and snapshot 22 still carried 36 edges — Alphabet 0.263,
 * Meta 0.254, GS 0.291 and C 0.279 against WTI at their PRE-adjustment
 * confidence, alongside the pairs the adjustment newly revealed. Half of what
 * beta adjustment bought ("the spurious ones leave") had not happened.
 *
 * Proven in a disposable clone inside a rolled-back transaction: appending a
 * `rejected` revision to a macro identity leaves the edge present under the old
 * condition (1) and removes it under the new one (0).
 */
describe('snapshot edge retraction', () => {
  const supersedeClause = SNAPSHOT_EDGE_SELECTOR_SQL.slice(
    SNAPSHOT_EDGE_SELECTOR_SQL.indexOf('NOT EXISTS'),
  );

  it('lets a later rejected or superseded verdict retract an accepted edge', () => {
    for (const status of ['accepted', 'rejected', 'superseded']) {
      assert.match(
        supersedeClause,
        new RegExp(`'${status}'`),
        `a newer '${status}' revision must supersede the older accepted one`,
      );
    }
  });

  it('does not let an unverified revision delete an established relation', () => {
    // 'quarantined_unverified' means the evidence gate could not verify the
    // candidate — "we do not know", not "it does not hold". A transient evidence
    // gap must not delete a relation. Production carries 3,312 of these against
    // 24,410 accepted, so treating them as retractions would empty large parts
    // of the graph on one bad ingest.
    const statusList = supersedeClause.match(/revision_status\s+IN\s*\(([^)]*)\)/)?.[1] ?? '';
    assert.ok(statusList, 'the supersede check must select on an explicit status list');
    assert.doesNotMatch(
      statusList,
      /quarantined_unverified/,
      'an unverified newer revision must not retract an accepted one',
    );
  });

  it('still requires the surviving revision itself to be accepted', () => {
    // Retraction changes which revision wins, never what an edge means: only an
    // accepted revision may become an edge.
    assert.match(SNAPSHOT_EDGE_SELECTOR_SQL, /WHERE\s+revision\.revision_status\s*=\s*'accepted'/);
  });
});
