import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEtfBasketCandidates } from '../src/relations/builders/etf-overlap.ts';
import { buildNewsComentionCandidates } from '../src/relations/builders/news-relation.ts';
import { buildOwnershipCandidates } from '../src/relations/builders/ownership.ts';
import { buildProductSimilarityCandidates } from '../src/relations/builders/product-similarity.ts';
import { buildSupplyChainCandidates } from '../src/relations/builders/supply-chain.ts';

const AS_OF = '2026-07-19T00:00:00.000Z';
const BEFORE = '2026-07-01T00:00:00.000Z';
const AFTER = '2026-08-01T00:00:00.000Z';

describe('B6 relation builders — point-in-time source timing', () => {
  it('13F-style holdings are invisible before the filing available_at', () => {
    const { candidates } = buildOwnershipCandidates(
      [
        {
          ownerEntityId: 32,
          ownedEntityId: 42,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 8101,
          availableAt: AFTER,
          validFrom: BEFORE,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(candidates.length, 0);
  });

  it('COMMON_OWNER pairs only form from filings both available at asOf', () => {
    const { candidates } = buildOwnershipCandidates(
      [
        {
          ownerEntityId: 50,
          ownedEntityId: 61,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 8201,
          availableAt: BEFORE,
          validFrom: BEFORE,
        },
        {
          ownerEntityId: 50,
          ownedEntityId: 62,
          ownershipKind: 'institutional_holding',
          sourceRevisionId: 8202,
          availableAt: AFTER,
          validFrom: BEFORE,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(candidates.filter((c) => c.predicate === 'COMMON_OWNER').length, 0);
    // The on-time holding itself still yields its HELD_BY candidate.
    assert.equal(candidates.filter((c) => c.predicate === 'HELD_BY').length, 1);
  });

  it('supply chain disclosures published after asOf are excluded', () => {
    const { candidates } = buildSupplyChainCandidates(
      [
        {
          supplierEntityId: 11,
          customerEntityId: 22,
          disclosureKind: 'supplier_disclosed',
          sourceRevisionId: 8301,
          availableAt: AFTER,
          validFrom: BEFORE,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(candidates.length, 0);
  });

  it('ETF holdings published after asOf are excluded', () => {
    const { candidates } = buildEtfBasketCandidates(
      [
        {
          etfEntityId: 900,
          memberEntityId: 71,
          sourceRevisionId: 8401,
          availableAt: BEFORE,
          validFrom: BEFORE,
        },
        {
          etfEntityId: 900,
          memberEntityId: 72,
          sourceRevisionId: 8402,
          availableAt: AFTER,
          validFrom: BEFORE,
        },
      ],
      { asOf: AS_OF },
    );
    // Only one member visible → no pair.
    assert.equal(candidates.length, 0);
  });

  it('news articles published after asOf are excluded', () => {
    const { candidates } = buildNewsComentionCandidates(
      [
        {
          subjectEntityId: 81,
          objectEntityId: 82,
          articleSourceRevisionId: 8501,
          syndicationClusterId: 'cluster-x',
          availableAt: AFTER,
          validFrom: BEFORE,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(candidates.length, 0);
  });

  it('product similarity built on a filing not yet available is excluded', () => {
    const { candidates } = buildProductSimilarityCandidates(
      [
        {
          subjectEntityId: 91,
          objectEntityId: 92,
          similarityScore: 0.8,
          modelConfig: { model: 'tnic-cosine-v1' },
          sourceRevisionIds: [8601, 8602],
          availableAt: AFTER,
          validFrom: BEFORE,
        },
      ],
      { asOf: AS_OF },
    );
    assert.equal(candidates.length, 0);
  });

  it('rejects an invalid asOf fail-closed', () => {
    assert.throws(() => buildSupplyChainCandidates([], { asOf: 'not-a-timestamp' }), /asOf/i);
  });
});
