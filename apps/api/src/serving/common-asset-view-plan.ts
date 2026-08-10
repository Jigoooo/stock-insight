// K6 — the pure half of the common asset view builder.
//
// Given everything the store could find about one asset, decide what each of
// canonical/06 §2's twelve blocks says and what state it is in. No I/O, no clock:
// the packet digest has to be reproducible from the same inputs, or REQ-REL-001's
// "compatible release" check compares two numbers that were never comparable.
//
// The states are defined in migration 099. The short version, because it is the
// thing most easily got wrong here:
//
//   not_produced       a producer exists and emitted nothing → repair the producer
//   no_eligible_source no source this contract may read     → build a new producer
//   unverified_only    a source exists, nothing passed verification → build the
//                      verification path
//
// These are not synonyms for "empty". Four blocks are empty today for three
// different reasons with three different owners, and flattening them would hide
// that from whoever picks up K7.

import { findRelationBuilderPolicy } from '../relations/relation-policy.ts';
import { canonicalDigest } from '../shared/canonical-json.ts';

export const COMMON_ASSET_VIEW_BLOCK_KEYS = [
  'identity_economic_claim',
  'business_sector_context',
  'comparable_financial_facts',
  'recent_events_surprise',
  'expectation_priced_in',
  'exposure_impact',
  'valuation_market_implied',
  'market_reaction_tradability',
  'multi_horizon_thesis',
  'catalysts_risks_counter_evidence',
  'coverage_freshness_uncertainty',
  'derivation_release_manifest',
] as const;

export type CommonAssetViewBlockKey = (typeof COMMON_ASSET_VIEW_BLOCK_KEYS)[number];

export type CommonAssetViewBlockState =
  | 'available'
  | 'partial'
  | 'unverified_only'
  | 'not_produced'
  | 'no_eligible_source';

export type CommonAssetViewBlock = {
  blockNo: number;
  blockKey: CommonAssetViewBlockKey;
  blockState: CommonAssetViewBlockState;
  stateReason: string;
  payload: Record<string, unknown>;
  payloadDigest: string;
  evidenceCount: number;
};

export type CommonAssetViewPlan = {
  viewKey: string;
  subjectEntityId: number;
  asOfDate: string;
  blocks: CommonAssetViewBlock[];
  packetDigest: string;
};

/**
 * A relation as the graph actually stores it. `revisionStatus` and `predicate` are
 * both load-bearing: the strong economic predicates all sit at
 * `quarantined_unverified` with no policy row, so a projection that dropped either
 * column would render a quarantined candidate as an established fact.
 */
export type RelationFact = {
  predicate: string;
  relationKind: string;
  revisionStatus: string;
  objectEntityId: number;
  confidence: number | null;
  evidenceCount: number;
};

export type NumericFactSummary = {
  metricKey: string;
  comparabilityGroupKey: string | null;
  unit: string | null;
  peerCount: number;
  observationCount: number;
};

export type AssetSourceFacts = {
  subjectEntityId: number;
  asOfDate: string;
  identity: {
    entityKey: string;
    displayName: string;
    tickers: string[];
  } | null;
  economicClaim: { claimKey: string; statement: string } | null;
  taxonomy: { nodeKey: string; label: string; taxonomyReleaseId: string }[];
  playbook: { playbookKey: string; assignedAt: string } | null;
  numericFacts: NumericFactSummary[];
  recentEvents: { eventKey: string; knownAt: string; title: string | null }[];
  surprises: { surpriseRevisionId: number; magnitude: number | null }[];
  expectations: { expectationRevisionId: number; metricKey: string }[];
  relations: RelationFact[];
  impactSummaries: { impactKey: string; horizon: string | null; sign: string | null }[];
  valuations: { valuationRevisionId: number }[];
  marketConfirmation: { asOf: string; direction: string | null; strength: number | null } | null;
  scenarios: { scenarioSetId: number }[];
  forwardAssertions: {
    assertionKey: string;
    predicateKey: string;
    modality: string;
    verificationState: string;
  }[];
  coverage: { datasetKey: string; state: string; observedAt: string }[];
  /**
   * Lists the store capped, keyed by the field it capped. Travels into the affected
   * block's payload so a reader sees "40 of 213" rather than a tidy 40 that looks
   * like everything. A silent cap reads as completeness to the next person.
   */
  truncation: Record<string, { kept: number; total: number }>;
  derivationIds: string[];
  releaseId: string;
  semanticSnapshotId: string;
};

/**
 * How much economic weight a relation may be shown with.
 *
 * `REQ-PROD-030` forbids presenting proximity as economic exposure, and the live
 * graph makes that concrete: 75% of accepted relations are ETF co-membership,
 * common ownership or text similarity. Deriving the tier from the policy table
 * rather than a list here means a new predicate cannot quietly arrive as "strong".
 */
export type RelationSignalTier = 'economic' | 'structural' | 'weak' | 'unpoliced';

export function relationSignalTier(predicate: string): RelationSignalTier {
  const policy = findRelationBuilderPolicy(predicate);
  // No policy row means the builder can never produce an accepted revision for it
  // (fail-closed, migration B6). Eight predicates are in this position, including
  // every strong economic reason canonical/01 §5 asks Discovery to show.
  if (!policy) return 'unpoliced';
  if (!policy.promotionEligible) return 'weak';
  switch (policy.relationClass) {
    case 'causal':
    case 'exposure':
      return 'economic';
    case 'identity':
    case 'hierarchy':
      return 'structural';
    default:
      return 'weak';
  }
}

/** Adds the cap note to a payload, and nothing at all when the list was not capped. */
function withTruncation(
  payload: Record<string, unknown>,
  facts: AssetSourceFacts,
  field: string,
): Record<string, unknown> {
  const cap = facts.truncation[field];
  return cap ? { ...payload, truncated: { field, ...cap } } : payload;
}

function block(
  blockNo: number,
  blockKey: CommonAssetViewBlockKey,
  blockState: CommonAssetViewBlockState,
  stateReason: string,
  payload: Record<string, unknown>,
  evidenceCount: number,
): CommonAssetViewBlock {
  return {
    blockNo,
    blockKey,
    blockState,
    stateReason,
    payload,
    payloadDigest: canonicalDigest(payload),
    evidenceCount,
  };
}

function planIdentity(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { identity, economicClaim } = facts;
  if (!identity) {
    return block(
      1,
      'identity_economic_claim',
      'not_produced',
      'core.entity carries no identity row for this subject',
      {},
      0,
    );
  }
  const payload = {
    entityKey: identity.entityKey,
    displayName: identity.displayName,
    tickers: [...identity.tickers].sort(),
    economicClaim: economicClaim ?? null,
  };
  return economicClaim
    ? block(
        1,
        'identity_economic_claim',
        'available',
        'identity and economic claim both resolved',
        payload,
        2,
      )
    : block(
        1,
        'identity_economic_claim',
        'partial',
        'identity resolved, core.economic_claim has no row for this subject',
        payload,
        1,
      );
}

function planBusinessContext(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { taxonomy, playbook } = facts;
  if (taxonomy.length === 0) {
    return block(
      2,
      'business_sector_context',
      'not_produced',
      'core.entity_taxonomy_membership has no row for this subject',
      {},
      0,
    );
  }
  const payload = {
    taxonomy: [...taxonomy].sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)),
    playbook: playbook ?? null,
  };
  return playbook
    ? block(
        2,
        'business_sector_context',
        'available',
        'sector taxonomy and playbook both assigned',
        payload,
        taxonomy.length + 1,
      )
    : block(
        2,
        'business_sector_context',
        'partial',
        'sector taxonomy resolved, no governance.playbook_assignment for this subject',
        payload,
        taxonomy.length,
      );
}

/**
 * Block 3 carries comparability, not just numbers. REQ-PROD-020 wants a rank per
 * dimension with its definition and coverage; REQ-PROD-021 wants the un-rankable
 * ones labelled rather than omitted. Omitting them is what makes a screen look
 * complete while being silently partial, so the label travels in the payload.
 *
 * This is the one place NOT_COMPARABLE / INSUFFICIENT_COVERAGE belong — they are
 * about a KPI's comparability, which is the question REQ-PROD-021 actually asks.
 * The block-level state above answers a different question and uses its own words.
 */
const MINIMUM_PEERS_FOR_RANK = 3;

function planComparableFacts(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { numericFacts } = facts;
  if (numericFacts.length === 0) {
    return block(
      3,
      'comparable_financial_facts',
      'not_produced',
      'world.numeric_fact has no observation for this subject',
      {},
      0,
    );
  }
  const metrics = [...numericFacts]
    .sort((a, b) => a.metricKey.localeCompare(b.metricKey))
    .map((fact) => ({
      metricKey: fact.metricKey,
      unit: fact.unit,
      comparabilityGroupKey: fact.comparabilityGroupKey,
      observationCount: fact.observationCount,
      peerCount: fact.peerCount,
      comparability: !fact.comparabilityGroupKey
        ? 'NOT_COMPARABLE'
        : fact.peerCount < MINIMUM_PEERS_FOR_RANK
          ? 'INSUFFICIENT_COVERAGE'
          : 'COMPARABLE',
    }));
  const comparable = metrics.filter((metric) => metric.comparability === 'COMPARABLE');
  const payload = withTruncation(
    { metrics, comparableCount: comparable.length, minimumPeersForRank: MINIMUM_PEERS_FOR_RANK },
    facts,
    'numericFacts',
  );
  return comparable.length > 0
    ? block(
        3,
        'comparable_financial_facts',
        'available',
        `${comparable.length} of ${metrics.length} metrics rank against peers`,
        payload,
        metrics.length,
      )
    : block(
        3,
        'comparable_financial_facts',
        'partial',
        `${metrics.length} metrics observed, none reaches ${MINIMUM_PEERS_FOR_RANK} peers in its comparability group`,
        payload,
        metrics.length,
      );
}

function planRecentEvents(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { recentEvents, surprises } = facts;
  if (recentEvents.length === 0) {
    return block(
      4,
      'recent_events_surprise',
      'not_produced',
      'knowledge.event has no event for this subject',
      {},
      0,
    );
  }
  const payload = withTruncation(
    {
      events: [...recentEvents].sort((a, b) => b.knownAt.localeCompare(a.knownAt)),
      surprises: [...surprises].sort((a, b) => a.surpriseRevisionId - b.surpriseRevisionId),
    },
    facts,
    'recentEvents',
  );
  return surprises.length > 0
    ? block(
        4,
        'recent_events_surprise',
        'available',
        'events and expectation surprise both present',
        payload,
        recentEvents.length + surprises.length,
      )
    : block(
        4,
        'recent_events_surprise',
        'partial',
        'events present, analytics.surprise_revision has no row for this subject',
        payload,
        recentEvents.length,
      );
}

function planExpectation(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { expectations } = facts;
  if (expectations.length === 0) {
    return block(
      5,
      'expectation_priced_in',
      'not_produced',
      'analytics.expectation_revision has no row for this subject; k4-market-intelligence-writer is its producer',
      {},
      0,
    );
  }
  const payload = {
    expectations: [...expectations].sort(
      (a, b) => a.expectationRevisionId - b.expectationRevisionId,
    ),
  };
  return block(
    5,
    'expectation_priced_in',
    'available',
    'expectation revisions resolved',
    payload,
    expectations.length,
  );
}

/**
 * Block 6 is where IA §4's relation contract lands. Every relation travels with the
 * four columns a reader needs to not lie about it — predicate, kind, revision
 * status, signal tier — and the block never filters quarantined rows out. Filtering
 * would leave the consumer unable to tell "no relation" from "no accepted relation",
 * which are opposite facts about the graph.
 */
function planExposure(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { relations, impactSummaries } = facts;
  const described = [...relations]
    .sort((a, b) => a.predicate.localeCompare(b.predicate) || a.objectEntityId - b.objectEntityId)
    .map((relation) => ({
      predicate: relation.predicate,
      relationKind: relation.relationKind,
      revisionStatus: relation.revisionStatus,
      objectEntityId: relation.objectEntityId,
      confidence: relation.confidence,
      evidenceCount: relation.evidenceCount,
      signalTier: relationSignalTier(relation.predicate),
    }));
  const economic = described.filter(
    (relation) => relation.signalTier === 'economic' && relation.revisionStatus === 'accepted',
  );
  const payload = withTruncation(
    {
      relations: described,
      impactSummaries: [...impactSummaries].sort((a, b) => a.impactKey.localeCompare(b.impactKey)),
      acceptedEconomicCount: economic.length,
    },
    facts,
    'relations',
  );
  const evidence = described.length + impactSummaries.length;
  if (evidence === 0) {
    return block(
      6,
      'exposure_impact',
      'not_produced',
      'no relation and no impact summary for this subject',
      {},
      0,
    );
  }
  if (economic.length > 0) {
    return block(
      6,
      'exposure_impact',
      'available',
      `${economic.length} accepted economic relations`,
      payload,
      evidence,
    );
  }
  // Everything present is either weak, unpoliced or unaccepted. Reporting this as
  // `available` is how a screen ends up calling ETF co-membership an exposure path.
  return described.some((relation) => relation.revisionStatus !== 'accepted')
    ? block(
        6,
        'exposure_impact',
        'unverified_only',
        'relations exist but none is an accepted economic predicate; the strong predicates hold no policy row and cannot be accepted',
        payload,
        evidence,
      )
    : block(
        6,
        'exposure_impact',
        'partial',
        'only weak association relations (ETF, common ownership, similarity) are accepted for this subject',
        payload,
        evidence,
      );
}

function planValuation(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { valuations } = facts;
  if (valuations.length === 0) {
    return block(
      7,
      'valuation_market_implied',
      'not_produced',
      'analytics.valuation_estimate_revision is empty; k4-market-intelligence-writer is its producer and has emitted nothing',
      {},
      0,
    );
  }
  const payload = {
    valuations: [...valuations].sort((a, b) => a.valuationRevisionId - b.valuationRevisionId),
  };
  return block(
    7,
    'valuation_market_implied',
    'available',
    'valuation revisions resolved',
    payload,
    valuations.length,
  );
}

function planMarketReaction(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { marketConfirmation } = facts;
  if (!marketConfirmation) {
    return block(
      8,
      'market_reaction_tradability',
      'not_produced',
      'serving.market_confirmation_v1 has no row for this subject',
      {},
      0,
    );
  }
  return block(
    8,
    'market_reaction_tradability',
    'available',
    'market confirmation resolved',
    { ...marketConfirmation },
    1,
  );
}

/**
 * The one block that cannot be fixed by running a producer harder.
 * `analytics.scenario_set` / `scenario_branch` are empty, and the only populated
 * thesis table in the database is `personalization.thesis_revision`, which
 * REQ-REC-001 forbids this view from reading at all. So the fix is a new,
 * contract-eligible producer — not a rerun.
 */
function planThesis(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { scenarios } = facts;
  if (scenarios.length === 0) {
    return block(
      9,
      'multi_horizon_thesis',
      'no_eligible_source',
      'analytics.scenario_set is empty and personalization.thesis_revision is barred by REQ-REC-001',
      {},
      0,
    );
  }
  const payload = { scenarios: [...scenarios].sort((a, b) => a.scenarioSetId - b.scenarioSetId) };
  return block(
    9,
    'multi_horizon_thesis',
    'available',
    'scenario sets resolved',
    payload,
    scenarios.length,
  );
}

function planCatalysts(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { forwardAssertions } = facts;
  if (forwardAssertions.length === 0) {
    return block(
      10,
      'catalysts_risks_counter_evidence',
      'not_produced',
      'knowledge.assertion carries no forward-looking or contested claim for this subject',
      {},
      0,
    );
  }
  const described = [...forwardAssertions].sort((a, b) =>
    a.assertionKey.localeCompare(b.assertionKey),
  );
  const verified = described.filter((assertion) => assertion.verificationState === 'verified');
  const payload = withTruncation(
    { assertions: described, verifiedCount: verified.length },
    facts,
    'forwardAssertions',
  );
  return verified.length > 0
    ? block(
        10,
        'catalysts_risks_counter_evidence',
        'available',
        `${verified.length} verified forward-looking claims`,
        payload,
        described.length,
      )
    : block(
        10,
        'catalysts_risks_counter_evidence',
        'unverified_only',
        `${described.length} forward-looking claims, all still at verification_state 'extracted'`,
        payload,
        described.length,
      );
}

function planCoverage(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { coverage } = facts;
  if (coverage.length === 0) {
    return block(
      11,
      'coverage_freshness_uncertainty',
      'not_produced',
      'governance.coverage_ledger has no observation covering this subject',
      {},
      0,
    );
  }
  const observations = [...coverage].sort((a, b) => a.datasetKey.localeCompare(b.datasetKey));
  const healthy = observations.filter((observation) => observation.state === 'ok');
  const payload = { observations, healthyCount: healthy.length };
  return healthy.length === observations.length
    ? block(
        11,
        'coverage_freshness_uncertainty',
        'available',
        'every covering dataset reports ok',
        payload,
        observations.length,
      )
    : block(
        11,
        'coverage_freshness_uncertainty',
        'partial',
        `${observations.length - healthy.length} of ${observations.length} covering datasets are not ok`,
        payload,
        observations.length,
      );
}

/**
 * Block 12 is what makes the other eleven auditable: the derivation ids behind them
 * and the snapshot they were read under (REQ-ARCH-001, REQ-REL-001).
 *
 * THE RELEASE ID IS DELIBERATELY NOT IN HERE. It lives on the row, in
 * serving.common_asset_view.release_id, and it is identical for every packet in a
 * build — zero information about any particular asset. Carrying it in the digested
 * payload made every rebuild look like a content change: three consecutive builds of
 * unchanged sources produced three different packet digests for all 297 assets, and
 * this block was the only one that moved. A digest that always moves cannot answer
 * "did anything actually change", which is the only question it is for.
 */
function planDerivation(facts: AssetSourceFacts): CommonAssetViewBlock {
  const payload = {
    semanticSnapshotId: facts.semanticSnapshotId,
    derivationIds: [...facts.derivationIds].sort(),
  };
  return facts.derivationIds.length > 0
    ? block(
        12,
        'derivation_release_manifest',
        'available',
        'snapshot and derivation ids resolved; the release is on the row',
        payload,
        facts.derivationIds.length,
      )
    : block(
        12,
        'derivation_release_manifest',
        'partial',
        'snapshot resolved, no derivation id was recorded for this subject',
        payload,
        1,
      );
}

export function planCommonAssetView(facts: AssetSourceFacts): CommonAssetViewPlan {
  const blocks = [
    planIdentity(facts),
    planBusinessContext(facts),
    planComparableFacts(facts),
    planRecentEvents(facts),
    planExpectation(facts),
    planExposure(facts),
    planValuation(facts),
    planMarketReaction(facts),
    planThesis(facts),
    planCatalysts(facts),
    planCoverage(facts),
    planDerivation(facts),
  ];

  // Twelve, in canonical/06 §2 order, always. A packet that quietly shipped eleven
  // would make "which block is missing" a question the reader cannot answer.
  if (blocks.length !== COMMON_ASSET_VIEW_BLOCK_KEYS.length) {
    throw new Error(
      `common asset view must carry ${COMMON_ASSET_VIEW_BLOCK_KEYS.length} blocks, planned ${blocks.length}`,
    );
  }
  for (const [index, expected] of COMMON_ASSET_VIEW_BLOCK_KEYS.entries()) {
    const actual = blocks[index];
    if (actual?.blockKey !== expected || actual.blockNo !== index + 1) {
      throw new Error(
        `common asset view block ${index + 1} must be ${expected}, planned ${actual?.blockKey}`,
      );
    }
  }

  return {
    viewKey: `${facts.subjectEntityId}@${facts.asOfDate}`,
    subjectEntityId: facts.subjectEntityId,
    asOfDate: facts.asOfDate,
    blocks,
    // Over the block digests rather than the payloads, so a payload that changes
    // shape without changing content cannot move the packet digest by accident, and
    // a state change without a payload change still moves it.
    packetDigest: canonicalDigest(
      blocks.map((entry) => [entry.blockKey, entry.blockState, entry.payloadDigest]),
    ),
  };
}
