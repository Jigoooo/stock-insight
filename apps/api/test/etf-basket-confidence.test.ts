import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEtfBasketCandidates,
  ETF_BASKET_CONFIDENCE,
  etfBasketConfidence,
  type EtfBasketObservation,
} from '../src/relations/builders/etf-overlap.ts';

/**
 * SAME_ETF_BASKET carried a flat 0.800 for every pair.
 *
 * Measured on production 2026-08-05: 2,006 of 2,519 edges (80%) come from
 * baskets of 50+ members — SPY holds 70 — so four edges in five asserted "both
 * are large US caps" while outranking every PRODUCT_SIMILARITY edge (max 0.477)
 * and most MACRO_COMOVEMENT edges. SAME_ETF_BASKET is 46% of the graph, so that
 * one constant decided path ranking, and nobody had chosen it deliberately.
 */
const AS_OF = '2026-08-05T00:00:00.000Z';

function member(etfEntityId: number, memberEntityId: number): EtfBasketObservation {
  return {
    etfEntityId,
    memberEntityId,
    sourceRevisionId: 900 + memberEntityId,
    availableAt: '2026-08-04T00:00:00.000Z',
    validFrom: '2026-08-04T00:00:00.000Z',
  } as EtfBasketObservation;
}

/** n members of one ETF, entity ids 1..n. */
function basket(etfEntityId: number, size: number, offset = 0): EtfBasketObservation[] {
  return Array.from({ length: size }, (_, index) => member(etfEntityId, offset + index + 1));
}

describe('ETF basket confidence', () => {
  it('falls as the basket widens, and an index fund lands far below a sector fund', () => {
    assert.equal(etfBasketConfidence(8), 0.8);
    assert.equal(etfBasketConfidence(9), 0.7);
    assert.equal(etfBasketConfidence(14), 0.431);
    assert.equal(etfBasketConfidence(70), 0.081);

    // The ordering this exists to create: broad-index co-membership must not
    // outrank a measured product similarity (max observed 0.477) or a macro
    // co-movement (0.251 and up).
    assert.ok(etfBasketConfidence(70) < 0.251);
    assert.ok(etfBasketConfidence(8) > 0.477);
  });

  it('keeps the tightest basket at the value it has today', () => {
    // Anchored, not rescaled: the strongest co-membership is unchanged, so this
    // only ever discounts. Nothing gets promoted above where it already was.
    assert.equal(
      etfBasketConfidence(ETF_BASKET_CONFIDENCE.anchorBasketSize),
      ETF_BASKET_CONFIDENCE.anchorConfidence,
    );
    assert.equal(etfBasketConfidence(2), ETF_BASKET_CONFIDENCE.anchorConfidence);
  });

  it('floors instead of deleting — the pair really is in the same basket', () => {
    assert.equal(etfBasketConfidence(100_000), ETF_BASKET_CONFIDENCE.floor);
    assert.ok(etfBasketConfidence(100_000) > 0);
  });

  it('refuses a basket that cannot produce a pair', () => {
    assert.throws(() => etfBasketConfidence(1), /at least 2/);
    assert.throws(() => etfBasketConfidence(8.5), /integer/);
  });

  it('takes the TIGHTEST basket when a pair shares more than one', () => {
    // Two stocks in both a 4-name sector fund and a 12-name broad one. The
    // specific basket is what the pair means; the broad one must not dilute it.
    const observations = [...basket(500, 4), ...basket(501, 12)];
    const { candidates } = buildEtfBasketCandidates(observations, { asOf: AS_OF });

    const shared = candidates.find((row) => row.subjectEntityId === 1 && row.objectEntityId === 2);
    assert.ok(shared, 'entities 1 and 2 are in both baskets');
    assert.equal(shared.metadata['smallestSharedBasketSize'], 4);
    assert.equal(shared.metadata['basketConfidence'], etfBasketConfidence(4));

    // A pair only the wide basket holds keeps the wide basket's discount.
    const wideOnly = candidates.find(
      (row) => row.subjectEntityId === 5 && row.objectEntityId === 6,
    );
    assert.ok(wideOnly, 'entities 5 and 6 are only in the 12-name basket');
    assert.equal(wideOnly.metadata['smallestSharedBasketSize'], 12);
  });
});
