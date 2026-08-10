import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMMON_ASSET_VIEW_BLOCK_KEYS,
  planCommonAssetView,
  relationSignalTier,
  type AssetSourceFacts,
} from '../src/serving/common-asset-view-plan.ts';
import {
  censusOf,
  parseCommonAssetViewArgs,
  releaseDigestOf,
} from '../src/serving/run-common-asset-view.ts';

/** An asset with nothing behind it, so each test can add exactly the one source it is about. */
function bareFacts(overrides: Partial<AssetSourceFacts> = {}): AssetSourceFacts {
  return {
    subjectEntityId: 42,
    asOfDate: '2026-08-10',
    identity: null,
    economicClaim: null,
    taxonomy: [],
    playbook: null,
    numericFacts: [],
    recentEvents: [],
    surprises: [],
    expectations: [],
    relations: [],
    impactSummaries: [],
    valuations: [],
    marketConfirmation: null,
    scenarios: [],
    forwardAssertions: [],
    coverage: [],
    derivationIds: [],
    truncation: {},
    releaseId: 'common-asset-view:2026-08-10',
    semanticSnapshotId: 'snapshot-1',
    ...overrides,
  };
}

const blockOf = (facts: AssetSourceFacts, key: string) =>
  planCommonAssetView(facts).blocks.find((block) => block.blockKey === key);

describe('common asset view packet shape', () => {
  it('always carries twelve blocks in canonical order', () => {
    const plan = planCommonAssetView(bareFacts());
    assert.equal(plan.blocks.length, 12);
    assert.deepEqual(
      plan.blocks.map((block) => block.blockKey),
      [...COMMON_ASSET_VIEW_BLOCK_KEYS],
    );
    assert.deepEqual(
      plan.blocks.map((block) => block.blockNo),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
  });

  it('carries every block even when an asset has no data at all', () => {
    // IA §4: depth is placement, not deletion. A packet that dropped its empty
    // blocks would make "missing" and "empty" the same word for the reader.
    const plan = planCommonAssetView(bareFacts());
    assert.equal(plan.blocks.filter((block) => block.blockState !== 'available').length, 12);
  });

  it('never reports a state without a reason', () => {
    for (const block of planCommonAssetView(bareFacts()).blocks) {
      assert.ok(block.stateReason.trim().length > 0, `${block.blockKey} has no state reason`);
    }
  });

  it('keys the packet by subject and date so a rebuild replaces rather than duplicates', () => {
    assert.equal(planCommonAssetView(bareFacts()).viewKey, '42@2026-08-10');
  });
});

describe('the four empty blocks are empty for different reasons', () => {
  // The whole point of the state vocabulary. If these ever collapse to one value,
  // K7 inherits "four blocks are empty" instead of four separate pieces of work.
  it('calls a producer that emitted nothing not_produced', () => {
    assert.equal(blockOf(bareFacts(), 'valuation_market_implied')?.blockState, 'not_produced');
  });

  it('calls a block with no contract-eligible source no_eligible_source', () => {
    const block = blockOf(bareFacts(), 'multi_horizon_thesis');
    assert.equal(block?.blockState, 'no_eligible_source');
    // Naming REQ-REC-001 in the reason is what stops someone "fixing" this by
    // joining personalization.thesis_revision, which is the one table that has data.
    assert.match(block?.stateReason ?? '', /REQ-REC-001/);
  });

  it('calls a source whose rows all failed verification unverified_only', () => {
    const block = blockOf(
      bareFacts({
        forwardAssertions: [
          {
            assertionKey: 'a1',
            predicateKey: 'GUIDES',
            modality: 'forecast',
            verificationState: 'extracted',
          },
        ],
      }),
      'catalysts_risks_counter_evidence',
    );
    assert.equal(block?.blockState, 'unverified_only');
  });

  it('promotes that same block to available once anything is verified', () => {
    const block = blockOf(
      bareFacts({
        forwardAssertions: [
          {
            assertionKey: 'a1',
            predicateKey: 'GUIDES',
            modality: 'forecast',
            verificationState: 'verified',
          },
        ],
      }),
      'catalysts_risks_counter_evidence',
    );
    assert.equal(block?.blockState, 'available');
  });

  it('never marks a block available while it holds no evidence', () => {
    // Mirrors the CHECK in migration 099. A row the database would reject must not
    // be plannable, or the failure surfaces as a crash at 05:20 instead of a test.
    for (const block of planCommonAssetView(bareFacts()).blocks) {
      if (block.blockState === 'available') assert.ok(block.evidenceCount > 0, block.blockKey);
      if (block.blockState === 'not_produced' || block.blockState === 'no_eligible_source') {
        assert.equal(block.evidenceCount, 0, block.blockKey);
      }
    }
  });
});

describe('relation signal tiers keep proximity out of the exposure slot', () => {
  it('treats disclosure-backed supply relations as economic', () => {
    assert.equal(relationSignalTier('SUPPLIES'), 'economic');
    assert.equal(relationSignalTier('CUSTOMER_OF'), 'economic');
  });

  it('treats ETF co-membership, common ownership and text similarity as weak', () => {
    // 75% of the accepted graph. REQ-PROD-030 exists because these read as
    // "related companies" to anyone who does not know how they were derived.
    assert.equal(relationSignalTier('SAME_ETF_BASKET'), 'weak');
    assert.equal(relationSignalTier('COMMON_OWNER'), 'weak');
    assert.equal(relationSignalTier('PRODUCT_SIMILARITY'), 'weak');
  });

  it('never lets news co-mention count as anything but weak', () => {
    assert.equal(relationSignalTier('NEWS_COMENTION'), 'weak');
  });

  it('calls a predicate with no policy row unpoliced rather than guessing', () => {
    // These are exactly canonical/01 §5's strong Discovery reasons. They hold no
    // policy row, so they can never reach an accepted revision, and a tier of
    // 'economic' here would let the screen show a candidate as established.
    for (const predicate of ['PEER_OF', 'SUPPLY_CHAIN', 'SAME_THEME', 'EXPOSES', 'AFFECTS']) {
      assert.equal(relationSignalTier(predicate), 'unpoliced', predicate);
    }
  });
});

describe('exposure block', () => {
  const relation = (over: Partial<AssetSourceFacts['relations'][number]>) => ({
    predicate: 'SUPPLIES',
    relationKind: 'structural',
    revisionStatus: 'accepted',
    objectEntityId: 7,
    confidence: 0.9,
    evidenceCount: 2,
    ...over,
  });

  it('is available only when an accepted economic relation exists', () => {
    const block = blockOf(bareFacts({ relations: [relation({})] }), 'exposure_impact');
    assert.equal(block?.blockState, 'available');
  });

  it('refuses to call a quarantined candidate an exposure', () => {
    const block = blockOf(
      bareFacts({
        relations: [relation({ predicate: 'PEER_OF', revisionStatus: 'quarantined_unverified' })],
      }),
      'exposure_impact',
    );
    assert.equal(block?.blockState, 'unverified_only');
  });

  it('refuses to call ETF co-membership an exposure', () => {
    const block = blockOf(
      bareFacts({ relations: [relation({ predicate: 'SAME_ETF_BASKET' })] }),
      'exposure_impact',
    );
    assert.equal(block?.blockState, 'partial');
  });

  it('carries quarantined relations rather than dropping them', () => {
    // The packet labels; the consumer filters. Dropping here would leave a reader
    // unable to tell "no relation" from "no accepted relation" — opposite facts.
    const block = blockOf(
      bareFacts({
        relations: [relation({ predicate: 'PEER_OF', revisionStatus: 'quarantined_unverified' })],
      }),
      'exposure_impact',
    );
    const relations = block?.payload.relations as { revisionStatus: string }[];
    assert.equal(relations.length, 1);
    assert.equal(relations[0]?.revisionStatus, 'quarantined_unverified');
  });
});

describe('comparable facts keep REQ-PROD-021 vocabulary for KPI comparability', () => {
  const metric = (over: Partial<AssetSourceFacts['numericFacts'][number]>) => ({
    metricKey: 'ifrs:Revenue',
    comparabilityGroupKey: 'group-a',
    unit: 'KRW',
    peerCount: 9,
    observationCount: 4,
    ...over,
  });

  it('labels a metric with no comparability group NOT_COMPARABLE', () => {
    const block = blockOf(
      bareFacts({ numericFacts: [metric({ comparabilityGroupKey: null })] }),
      'comparable_financial_facts',
    );
    const metrics = block?.payload.metrics as { comparability: string }[];
    assert.equal(metrics[0]?.comparability, 'NOT_COMPARABLE');
  });

  it('labels a thin peer group INSUFFICIENT_COVERAGE rather than ranking it', () => {
    const block = blockOf(
      bareFacts({ numericFacts: [metric({ peerCount: 1 })] }),
      'comparable_financial_facts',
    );
    const metrics = block?.payload.metrics as { comparability: string }[];
    assert.equal(metrics[0]?.comparability, 'INSUFFICIENT_COVERAGE');
    // The block is still `partial`, not `INSUFFICIENT_COVERAGE`: block state and KPI
    // comparability answer different questions and must not share a word.
    assert.equal(block?.blockState, 'partial');
  });

  it('keeps un-rankable metrics in the payload instead of omitting them', () => {
    const block = blockOf(
      bareFacts({ numericFacts: [metric({}), metric({ metricKey: 'x', peerCount: 0 })] }),
      'comparable_financial_facts',
    );
    assert.ok(block);
    assert.equal((block.payload.metrics as unknown[]).length, 2);
    assert.equal(block.payload.comparableCount, 1);
  });
});

describe('capped lists say they were capped', () => {
  it('puts the cap and the true total in the payload of the block it capped', () => {
    // The store comment promised this and the code did not do it. A cap that reports
    // nothing reads as completeness: 40 metrics looks like all of them.
    const block = blockOf(
      bareFacts({
        numericFacts: [
          {
            metricKey: 'ifrs:Revenue',
            comparabilityGroupKey: 'g',
            unit: 'KRW',
            peerCount: 9,
            observationCount: 1,
          },
        ],
        truncation: { numericFacts: { kept: 40, total: 213 } },
      }),
      'comparable_financial_facts',
    );
    assert.deepEqual(block?.payload.truncated, { field: 'numericFacts', kept: 40, total: 213 });
  });

  it('says nothing when nothing was capped', () => {
    const block = blockOf(
      bareFacts({
        numericFacts: [
          {
            metricKey: 'ifrs:Revenue',
            comparabilityGroupKey: 'g',
            unit: 'KRW',
            peerCount: 9,
            observationCount: 1,
          },
        ],
      }),
      'comparable_financial_facts',
    );
    assert.equal(block?.payload.truncated, undefined);
  });

  it('moves the digest, because a capped packet is not the same packet', () => {
    // A non-empty list, because an empty one cannot be capped: the store records a
    // truncation only when it actually dropped rows, so `relations: []` carrying a
    // cap note is a state the loader can never produce.
    const relations = [
      {
        predicate: 'SUPPLIES',
        relationKind: 'structural',
        revisionStatus: 'accepted',
        objectEntityId: 7,
        confidence: 0.9,
        evidenceCount: 2,
      },
    ];
    const uncapped = bareFacts({ relations });
    const capped = bareFacts({
      relations,
      truncation: { relations: { kept: 60, total: 900 } },
    });
    assert.notEqual(
      planCommonAssetView(uncapped).packetDigest,
      planCommonAssetView(capped).packetDigest,
    );
  });
});

describe('packet digest', () => {
  it('is stable for the same inputs', () => {
    assert.equal(
      planCommonAssetView(bareFacts()).packetDigest,
      planCommonAssetView(bareFacts()).packetDigest,
    );
  });

  it('does not depend on the order sources came back in', () => {
    const a = bareFacts({
      taxonomy: [
        { nodeKey: 'b', label: 'B', taxonomyReleaseId: 'r1' },
        { nodeKey: 'a', label: 'A', taxonomyReleaseId: 'r1' },
      ],
    });
    const b = bareFacts({
      taxonomy: [
        { nodeKey: 'a', label: 'A', taxonomyReleaseId: 'r1' },
        { nodeKey: 'b', label: 'B', taxonomyReleaseId: 'r1' },
      ],
    });
    assert.equal(planCommonAssetView(a).packetDigest, planCommonAssetView(b).packetDigest);
  });

  it('does not move when only the release changes', () => {
    // Caught on live data: three consecutive builds of unchanged sources produced
    // three different digests for all 297 assets, because block 12 carried the
    // release id and the release id is new every run. A digest that always moves
    // cannot answer "did anything actually change", which is the only thing it is
    // for. The release lives on the row, not in the packet.
    const first = bareFacts({ releaseId: 'common-asset-view:2026-08-10:1' });
    const second = bareFacts({ releaseId: 'common-asset-view:2026-08-10:2' });
    assert.equal(planCommonAssetView(first).packetDigest, planCommonAssetView(second).packetDigest);
  });

  it('still moves when the snapshot the packet was read under changes', () => {
    // The snapshot is not the release. Two packets read under different semantic
    // snapshots describe different worlds and must not compare equal.
    const a = bareFacts({ semanticSnapshotId: 'snapshot-1' });
    const b = bareFacts({ semanticSnapshotId: 'snapshot-2' });
    assert.notEqual(planCommonAssetView(a).packetDigest, planCommonAssetView(b).packetDigest);
  });

  it('moves when a block state changes even if its payload did not', () => {
    const extracted = bareFacts({
      forwardAssertions: [
        {
          assertionKey: 'a',
          predicateKey: 'GUIDES',
          modality: 'forecast',
          verificationState: 'extracted',
        },
      ],
    });
    const verified = bareFacts({
      forwardAssertions: [
        {
          assertionKey: 'a',
          predicateKey: 'GUIDES',
          modality: 'forecast',
          verificationState: 'verified',
        },
      ],
    });
    assert.notEqual(
      planCommonAssetView(extracted).packetDigest,
      planCommonAssetView(verified).packetDigest,
    );
  });
});

describe('REQ-REC-001 anti-shortcut', () => {
  it('has no field through which private portfolio data could enter', () => {
    // canonical/10 §2: changing a private portfolio must not change the common
    // asset view. The structural half of that gate is that AssetSourceFacts has no
    // holding, lot, position or user field at all — there is nothing to vary.
    const keys = Object.keys(bareFacts());
    for (const forbidden of ['portfolio', 'holding', 'lot', 'position', 'user', 'thesis']) {
      assert.ok(
        !keys.some((key) => key.toLowerCase().includes(forbidden)),
        `AssetSourceFacts must not carry a ${forbidden} field`,
      );
    }
  });

  it('produces the same digest for two callers whose portfolios differ', () => {
    // The behavioural half. Two builds of the same asset from the same public
    // sources must agree byte for byte no matter who is asking, because nothing
    // about the asker reaches this function.
    const facts = bareFacts({
      identity: { entityKey: 'KR:005930', displayName: 'X', tickers: ['005930'] },
    });
    assert.equal(
      planCommonAssetView(facts).packetDigest,
      planCommonAssetView({ ...facts }).packetDigest,
    );
  });
});

describe('release identity', () => {
  it('produces a release id the manifest CHECK accepts', () => {
    // A rerun mints a new revision that supersedes the last, which is what the
    // append-only manifest is for. Reusing one id per day collides on the primary
    // key and takes the pipeline stage down on the second run of any day.
    assert.match('common-asset-view:2026-08-10:2', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });

  it('digests the release over its packets, not over their order', () => {
    const one = planCommonAssetView(bareFacts({ subjectEntityId: 1 }));
    const two = planCommonAssetView(bareFacts({ subjectEntityId: 2 }));
    assert.equal(releaseDigestOf([one, two]), releaseDigestOf([two, one]));
  });

  it('moves the release digest when any packet in it moves', () => {
    const one = planCommonAssetView(bareFacts({ subjectEntityId: 1 }));
    const changed = planCommonAssetView(
      bareFacts({ subjectEntityId: 1, valuations: [{ valuationRevisionId: 5 }] }),
    );
    assert.notEqual(releaseDigestOf([one]), releaseDigestOf([changed]));
  });
});

describe('census', () => {
  it('counts every block of every asset exactly once', () => {
    const census = censusOf([planCommonAssetView(bareFacts()), planCommonAssetView(bareFacts())]);
    assert.equal(Object.keys(census).length, 12);
    for (const [key, states] of Object.entries(census)) {
      const total = Object.values(states).reduce((sum, count) => sum + count, 0);
      assert.equal(total, 2, key);
    }
  });
});

describe('arguments', () => {
  it('defaults to a dry run on today', () => {
    const args = parseCommonAssetViewArgs([], '2026-08-10');
    assert.equal(args.mode, 'dry-run');
    assert.equal(args.asOfDate, '2026-08-10');
  });

  it('rejects an as-of that is not a real calendar date', () => {
    assert.throws(
      () => parseCommonAssetViewArgs(['--as-of', '2026-02-30'], '2026-08-10'),
      /YYYY-MM-DD/,
    );
    assert.throws(
      () => parseCommonAssetViewArgs(['--as-of', 'yesterday'], '2026-08-10'),
      /YYYY-MM-DD/,
    );
  });

  it('rejects a nonsense limit', () => {
    assert.throws(() => parseCommonAssetViewArgs(['--limit', '0'], '2026-08-10'), /positive/);
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    assert.throws(() => parseCommonAssetViewArgs(['--applyy'], '2026-08-10'), /unknown argument/);
  });
});
