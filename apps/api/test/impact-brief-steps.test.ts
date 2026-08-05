import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { impactBriefPathSchema, impactBriefStepSchema } from '@stock-insight/contracts';

/**
 * An impact path used to reach the product as "2 hops, 0.43" and nothing else.
 *
 * Every step already carried a graph_snapshot_edge foreign key — the reason for
 * the hop was recorded and simply never reached a contract. So the graph work of
 * 2026-08-05 (macro co-movement, topic entities, retraction, basket confidence)
 * could move a score but could not change a single word the user reads.
 */
describe('impact brief steps', () => {
  it('names relations without claiming causation', () => {
    const relations = impactBriefStepSchema.shape.relation.options;

    // MACRO_COMOVEMENT measures that a stock and a macro series moved together
    // over a stated window — nothing about one driving the other. The label has
    // to stop where the measurement stops, which is why the predicate is not
    // called AFFECTS either.
    assert.ok(relations.includes('moves_with'));
    for (const causal of ['affects', 'causes', 'drives', 'impacts', 'exposed_to']) {
      assert.ok(
        !relations.includes(causal as never),
        `'${causal}' claims a direction no relation here measured`,
      );
    }
  });

  it('accepts a path whose pack predates the field', () => {
    // Packs are immutable once sealed, so older ones carry no steps. Null means
    // "this pack is older", which is different from "this path had no steps" —
    // a path always has at least one.
    const older = {
      impactPathV2Id: 1,
      triggerEventId: 2,
      sourceEntityId: 3,
      eventType: 'earnings',
      sourceName: '삼성전자',
      sourceEntityKey: 'KR:005930',
      hopCount: 2,
      pathScore: 0.43,
      note: 'industrial linkage strength; never a price prediction',
      steps: null,
    };
    assert.doesNotThrow(() => impactBriefPathSchema.parse(older));

    assert.throws(
      () => impactBriefPathSchema.parse({ ...older, steps: [] }),
      'an empty step list is not a valid path — it would render as a reason-free hop',
    );
  });

  it('carries where each hop lands, which is what makes a 2-hop path readable', () => {
    const path = impactBriefPathSchema.parse({
      impactPathV2Id: 1,
      triggerEventId: 2,
      sourceEntityId: 3,
      eventType: 'macro_shock',
      sourceName: 'topic:rates',
      sourceEntityKey: null,
      hopCount: 2,
      pathScore: 0.46,
      note: 'industrial linkage strength; never a price prediction',
      steps: [
        { relation: 'indicated_by', toName: 'fred:DGS10', toEntityKey: null },
        {
          relation: 'moves_with',
          toName: 'iShares 20+ Year Treasury Bond ETF',
          toEntityKey: 'US:TLT',
        },
      ],
    });

    // The middle of the chain is the part a hop count cannot express.
    assert.equal(path.steps?.[0]?.toName, 'fred:DGS10');
    assert.equal(path.steps?.length, path.hopCount);
  });

  it('refuses to ship a predicate whose product wording nobody chose', async () => {
    // A new predicate reaching impact paths is a decision about what to CALL it.
    // A generic fallback would ship that decision unmade, so the publisher throws
    // instead — and every predicate that actually walks paths must be mapped.
    const source = await readFile(
      new URL('../src/analytics/run-v2-analytics-publish.ts', import.meta.url),
      'utf8',
    );

    assert.match(source, /has no product wording; add it to STEP_RELATION_BY_PREDICATE/);
    // Measured on snapshot 27: these five are the predicates impact paths
    // actually walk. An unmapped one would take down the publish, so they are
    // pinned here rather than discovered in production.
    for (const predicate of [
      'SAME_ETF_BASKET',
      'PRODUCT_SIMILARITY',
      'CLASSIFIED_AS',
      'MACRO_COMOVEMENT',
      'MEASURED_BY',
    ]) {
      assert.match(
        source,
        new RegExp(`${predicate}: '`),
        `${predicate} walks impact paths in production and needs a word`,
      );
    }
  });
});
