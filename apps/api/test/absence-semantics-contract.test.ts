import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  getRelationBuilderPolicy,
  RELATION_BUILDER_POLICIES,
} from '../src/relations/relation-policy.ts';
import { assertRetractable } from '../src/relations/relation-retraction.ts';

/**
 * `absenceSemantics` must decide behaviour, not describe an intention.
 *
 * Measured 2026-08-05, hours after retraction shipped: MACRO_COMOVEMENT and
 * PRODUCT_SIMILARITY declared `unknown_not_disclosed` while the code retracted
 * them, MEASURED_BY declared `closed_world` and was never retracted, and nothing
 * read the field to decide anything. A reader of the policy would have concluded
 * the exact opposite of what the code did — in both directions.
 *
 * The contradiction formed silently because no test tied the declaration to the
 * behaviour. That is what this file is for.
 */
describe('absence semantics is the retraction switch', () => {
  it('refuses to retract a predicate that does not claim a closed world', () => {
    // SUPPLIES is the case the policy header was written about: an undisclosed
    // supply relation stays unknown, so its absence can never be a verdict.
    assert.equal(getRelationBuilderPolicy('SUPPLIES').absenceSemantics, 'unknown_not_disclosed');
    assert.throws(() => assertRetractable('SUPPLIES'), /must not be retracted/);

    // And the message has to say what to do about it, not just refuse.
    assert.throws(() => assertRetractable('SUPPLIES'), /the policy is wrong — decide which/);
  });

  it('allows exactly the predicates that declare a closed world', () => {
    for (const policy of RELATION_BUILDER_POLICIES) {
      if (policy.absenceSemantics === 'closed_world') {
        assert.doesNotThrow(() => assertRetractable(policy.predicate), policy.predicate);
      } else {
        assert.throws(() => assertRetractable(policy.predicate), policy.predicate);
      }
    }
  });

  /**
   * Which file is answerable for each closed-world predicate's retraction.
   *
   * This used to be a single hardcoded path — run-v2-graph-publish — because for a
   * while every builder lived inside the publisher. SAME_INDUSTRY is derived by its own
   * job instead, and the helpers in relation-retraction.ts are importable from
   * anywhere, so the contract is "a named owner calls retraction for this predicate",
   * not "the publisher does". The map has to be updated deliberately, which is the
   * point: a new closed_world predicate with no owner fails the next assertion rather
   * than quietly inheriting a promise nobody keeps.
   */
  const RETRACTION_OWNERS: Record<string, string> = {
    MACRO_COMOVEMENT: '../src/analytics/run-v2-graph-publish.ts',
    MEASURED_BY: '../src/analytics/run-v2-graph-publish.ts',
    PRODUCT_SIMILARITY: '../src/analytics/run-v2-graph-publish.ts',
    SAME_ETF_BASKET: '../src/analytics/run-v2-graph-publish.ts',
    SAME_INDUSTRY: '../src/relations/run-same-industry-relations.ts',
  };

  it('names an owner for every closed_world predicate and no others', () => {
    const declared = RELATION_BUILDER_POLICIES.filter(
      (policy) => policy.absenceSemantics === 'closed_world',
    )
      .map((policy) => policy.predicate)
      .sort();
    // Both directions. A predicate that starts declaring closed_world without an owner
    // fails here, and an owner left behind after a predicate reverts to
    // unknown_not_disclosed fails here too — that stale entry would otherwise keep
    // asserting a retraction the policy no longer permits.
    assert.deepEqual(declared, Object.keys(RETRACTION_OWNERS).sort());
  });

  it('has retraction wired for every closed_world predicate', async () => {
    // The other direction from the switch, and the one that let MEASURED_BY promise a
    // retraction it did not have. Declaring closed_world without wiring retraction
    // leaves an edge standing after the source stopped listing it.
    for (const [predicate, ownerPath] of Object.entries(RETRACTION_OWNERS)) {
      const owner = await readFile(new URL(ownerPath, import.meta.url), 'utf8');
      assert.match(
        owner,
        new RegExp(`'${predicate}'`),
        `${predicate} declares closed_world, so ${ownerPath} must name it`,
      );
      // Naming the predicate is not wiring it. The owner has to reach one of the two
      // retraction entry points — grepping for the predicate alone would pass on a
      // file that merely mentions it in a comment.
      assert.match(
        owner,
        /retractEdges(NotIn)?\(/,
        `${ownerPath} names ${predicate} but never calls a retraction entry point`,
      );
    }
  });

  it('keeps the policy header honest about closed_world being in use', async () => {
    // The header said absence semantics were "never closed-world absence". That
    // stopped being true the moment retraction shipped.
    const policy = await readFile(
      new URL('../src/relations/relation-policy.ts', import.meta.url),
      'utf8',
    );
    const header = policy.slice(0, policy.indexOf('export type RelationClass'));
    assert.doesNotMatch(
      header,
      /never closed-world absence/,
      'the header must not claim closed_world is unused while three predicates declare it',
    );
  });
});
