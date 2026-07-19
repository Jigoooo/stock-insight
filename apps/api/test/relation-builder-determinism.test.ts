import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEtfBasketCandidates } from '../src/relations/builders/etf-overlap.ts';
import { buildNewsComentionCandidates } from '../src/relations/builders/news-relation.ts';
import { buildOfficialSectorCandidates } from '../src/relations/builders/official-sector.ts';
import { buildOwnershipCandidates } from '../src/relations/builders/ownership.ts';
import { buildSupplyChainCandidates } from '../src/relations/builders/supply-chain.ts';

// Regression class: grouped builders must produce ORDER-INSENSITIVE payload
// hashes even when duplicate observations carry different validFrom values.
// (Found by adversarial probe 2026-07-19: first-observation validFrom made the
// hash depend on input ordering.)

const AS_OF = '2026-07-19T00:00:00.000Z';
const T1 = '2026-06-01T00:00:00.000Z';
const T2 = '2026-07-01T00:00:00.000Z';

describe('B6 relation builders — input-order insensitivity', () => {
  it('official sector: duplicate observations with differing validFrom hash identically in any order', () => {
    const a = {
      subjectEntityId: 1,
      taxonomyEntityId: 2,
      taxonomySystem: 'SIC' as const,
      taxonomyCode: '10',
      classificationStatus: 'source_reported' as const,
      sourceRevisionId: 100,
      availableAt: T1,
      validFrom: T1,
    };
    const b = { ...a, sourceRevisionId: 101, validFrom: T2 };
    const forward = buildOfficialSectorCandidates([a, b], { asOf: AS_OF })[0]!;
    const reversed = buildOfficialSectorCandidates([b, a], { asOf: AS_OF })[0]!;
    assert.equal(forward.payloadHash, reversed.payloadHash);
    assert.equal(forward.validFrom, T1, 'canonical validFrom is the earliest disclosure');
  });

  it('supply chain: duplicate links with differing validFrom hash identically in any order', () => {
    const a = {
      supplierEntityId: 1,
      customerEntityId: 2,
      disclosureKind: 'supplier_disclosed' as const,
      sourceRevisionId: 100,
      availableAt: T1,
      validFrom: T1,
    };
    const b = { ...a, sourceRevisionId: 101, validFrom: T2 };
    const forward = buildSupplyChainCandidates([a, b], { asOf: AS_OF }).candidates;
    const reversed = buildSupplyChainCandidates([b, a], { asOf: AS_OF }).candidates;
    assert.deepEqual(
      forward.map((c) => c.payloadHash),
      reversed.map((c) => c.payloadHash),
    );
    assert.ok(forward.every((c) => c.validFrom === T1));
  });

  it('ownership: COMMON_OWNER pairs hash identically in any input order', () => {
    const rows = [
      {
        ownerEntityId: 5,
        ownedEntityId: 11,
        ownershipKind: 'institutional_holding' as const,
        sourceRevisionId: 100,
        availableAt: T1,
        validFrom: T1,
      },
      {
        ownerEntityId: 5,
        ownedEntityId: 12,
        ownershipKind: 'institutional_holding' as const,
        sourceRevisionId: 101,
        availableAt: T1,
        validFrom: T2,
      },
    ];
    const forward = buildOwnershipCandidates(rows, { asOf: AS_OF }).candidates;
    const reversed = buildOwnershipCandidates([...rows].reverse(), { asOf: AS_OF }).candidates;
    assert.deepEqual(
      forward.map((c) => `${c.predicate}:${c.payloadHash}`).sort(),
      reversed.map((c) => `${c.predicate}:${c.payloadHash}`).sort(),
    );
  });

  it('ownership: OWNS and HELD_BY duplicate observations with differing validFrom hash identically in any order', () => {
    const owns = [
      {
        ownerEntityId: 5,
        ownedEntityId: 11,
        ownershipKind: 'direct' as const,
        sourceRevisionId: 100,
        availableAt: T1,
        validFrom: T1,
      },
      {
        ownerEntityId: 5,
        ownedEntityId: 11,
        ownershipKind: 'direct' as const,
        sourceRevisionId: 101,
        availableAt: T1,
        validFrom: T2,
      },
    ];
    const heldBy = [
      {
        ownerEntityId: 6,
        ownedEntityId: 12,
        ownershipKind: 'institutional_holding' as const,
        sourceRevisionId: 200,
        availableAt: T1,
        validFrom: T2,
      },
      {
        ownerEntityId: 6,
        ownedEntityId: 12,
        ownershipKind: 'institutional_holding' as const,
        sourceRevisionId: 201,
        availableAt: T1,
        validFrom: T1,
      },
    ];
    for (const rows of [owns, heldBy]) {
      const forward = buildOwnershipCandidates(rows, { asOf: AS_OF }).candidates;
      const reversed = buildOwnershipCandidates([...rows].reverse(), { asOf: AS_OF }).candidates;
      assert.equal(forward.length, 1);
      assert.equal(forward[0]!.payloadHash, reversed[0]!.payloadHash);
      assert.equal(forward[0]!.validFrom, T1, 'canonical validFrom is the earliest disclosure');
    }
  });

  it('news: mixed-direction observations with differing validFrom hash identically in any order', () => {
    const rows = [
      {
        subjectEntityId: 2,
        objectEntityId: 1,
        articleSourceRevisionId: 100,
        syndicationClusterId: 'c1',
        availableAt: T1,
        validFrom: T2,
      },
      {
        subjectEntityId: 1,
        objectEntityId: 2,
        articleSourceRevisionId: 101,
        syndicationClusterId: 'c2',
        availableAt: T1,
        validFrom: T1,
      },
    ];
    const forward = buildNewsComentionCandidates(rows, { asOf: AS_OF }).candidates[0]!;
    const reversed = buildNewsComentionCandidates([...rows].reverse(), { asOf: AS_OF })
      .candidates[0]!;
    assert.equal(forward.payloadHash, reversed.payloadHash);
  });

  it('etf: members with differing validFrom hash identically in any order', () => {
    const rows = [
      { etfEntityId: 9, memberEntityId: 1, sourceRevisionId: 100, availableAt: T1, validFrom: T1 },
      { etfEntityId: 9, memberEntityId: 2, sourceRevisionId: 100, availableAt: T1, validFrom: T2 },
    ];
    const forward = buildEtfBasketCandidates(rows, { asOf: AS_OF }).candidates[0]!;
    const reversed = buildEtfBasketCandidates([...rows].reverse(), { asOf: AS_OF }).candidates[0]!;
    assert.equal(forward.payloadHash, reversed.payloadHash);
  });
});
