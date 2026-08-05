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

  it('has retraction wired for every closed_world predicate', async () => {
    // The other direction, and the one that let MEASURED_BY promise a retraction
    // it did not have. Declaring closed_world without wiring retraction leaves an
    // edge standing after the source stopped listing it.
    const publisher = await readFile(
      new URL('../src/analytics/run-v2-graph-publish.ts', import.meta.url),
      'utf8',
    );
    const declared = RELATION_BUILDER_POLICIES.filter(
      (policy) => policy.absenceSemantics === 'closed_world',
    ).map((policy) => policy.predicate);

    // SAME_ETF_BASKET joined on 2026-08-06, once EnumerationScope could express
    // the thing that kept it out: its enumeration is complete per basket, not
    // globally, so retraction needs to name the baskets the run evaluated.
    assert.deepEqual(declared.sort(), [
      'MACRO_COMOVEMENT',
      'MEASURED_BY',
      'PRODUCT_SIMILARITY',
      'SAME_ETF_BASKET',
    ]);

    for (const predicate of declared) {
      assert.match(
        publisher,
        new RegExp(`'${predicate}',`),
        `${predicate} declares closed_world, so the publisher must retract it`,
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
