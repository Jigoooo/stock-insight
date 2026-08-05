// B6 — relation builder candidate policy (master plan §4, §8 B6 gate).
// Every builder predicate carries a fail-closed policy row: minimum count of
// DISTINCT immutable source revisions, whether statistical predicates must bind
// a model_config evidence row, a finite superhub degree cap for ETF/universal
// owner style predicates, promotion eligibility (news co-mention is NEVER
// promoted to a structural relation), and absence semantics (undisclosed
// supply chains stay unknown/not_disclosed — never closed-world absence).

export type RelationClass =
  | 'identity'
  | 'causal'
  | 'hierarchy'
  | 'association'
  | 'ownership'
  | 'exposure'
  | 'stage';

export type AbsenceSemantics = 'unknown_not_disclosed' | 'closed_world';

export type RelationBuilderPolicy = {
  predicate: string;
  relationClass: RelationClass;
  /** Minimum DISTINCT ingestion.source_revision ids backing the candidate. */
  minSourceRevisions: number;
  /** Statistical predicates must bind an explicit model_config evidence row. */
  requiresModelConfig: boolean;
  /** Finite per-endpoint degree cap; null = predicate is not superhub-prone. */
  superhubDegreeCap: number | null;
  /** Whether the builder may ever produce an accepted structural revision. */
  promotionEligible: boolean;
  absenceSemantics: AbsenceSemantics;
};

export const RELATION_BUILDER_POLICIES: readonly RelationBuilderPolicy[] = [
  {
    // A macro topic and the FRED series that indicates it: `topic:energy`
    // MEASURED_BY `fred:DCOILWTICO`. Hierarchy, not association — the series is
    // an instrument OF the topic, and the pair is a curated definition rather
    // than a measurement, so it carries no model config and no confidence
    // derived from data.
    //
    // Why the topic node exists at all: knowledge.event.target_entity_id is a
    // SINGLE value, so an event about rates cannot attach to DGS10, DGS2,
    // FEDFUNDS and WALCL at once, and run-event-text-attribution refuses to pick
    // one ("Ambiguity is not resolved by picking one"). Attaching to the topic
    // removes the ambiguity — a topic is always one — and, unlike attaching to a
    // series, it does not get worse as coverage grows.
    //
    // No degree cap. Measured 2026-08-05 on the live snapshot: the widest topic
    // reaches 10 stocks in two hops (energy 10, rates 10, fx 2, growth 1)
    // against MAX_PATHS_PER_EVENT of 20, so a topic cannot crowd the per-event
    // path budget. A cap here would be a number with nothing behind it.
    predicate: 'MEASURED_BY',
    relationClass: 'hierarchy',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: null,
    promotionEligible: true,
    // The mapping table is the whole world for this predicate: a topic with no
    // row has no series, full stop. That is closed_world, not "undisclosed".
    absenceSemantics: 'closed_world',
  },
  {
    predicate: 'CLASSIFIED_AS',
    relationClass: 'hierarchy',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: null,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'PRODUCT_SIMILARITY',
    relationClass: 'association',
    minSourceRevisions: 2,
    requiresModelConfig: true,
    superhubDegreeCap: 50,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    // A macro series and a stock whose daily moves tracked each other over a
    // measured window. Same layer as PRODUCT_SIMILARITY and SAME_ETF_BASKET:
    // statistical, undirected, NOT causal. The name says co-movement and nothing
    // more on purpose — AFFECTS/EXPOSES would claim a direction the measurement
    // does not contain.
    //
    // minSourceRevisions 2: the number comes from two windows, the macro series
    // window and the stock price window, and each is registered as its own
    // immutable revision. One of them alone cannot produce the correlation.
    //
    // superhubDegreeCap 40 is a backstop, not the working limit. 13 series over
    // 330 stocks would make a single series a 330-degree hub, so the model caps
    // itself at 25 stocks per series (macro-comovement-model.ts). The policy cap
    // sits above that: it should never fire, and if it does the model changed
    // without this row being reconsidered. Note the cap REJECTS rather than
    // trims, so a cap below the model's own limit would discard everything.
    predicate: 'MACRO_COMOVEMENT',
    relationClass: 'association',
    minSourceRevisions: 2,
    requiresModelConfig: true,
    superhubDegreeCap: 40,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'SUPPLIES',
    relationClass: 'exposure',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: null,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'CUSTOMER_OF',
    relationClass: 'exposure',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: null,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'OWNS',
    relationClass: 'ownership',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: null,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'HELD_BY',
    relationClass: 'ownership',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: 200,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'COMMON_OWNER',
    relationClass: 'ownership',
    minSourceRevisions: 2,
    requiresModelConfig: false,
    superhubDegreeCap: 100,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'SAME_ETF_BASKET',
    relationClass: 'association',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: 100,
    promotionEligible: true,
    absenceSemantics: 'unknown_not_disclosed',
  },
  {
    predicate: 'NEWS_COMENTION',
    relationClass: 'association',
    minSourceRevisions: 1,
    requiresModelConfig: false,
    superhubDegreeCap: 25,
    promotionEligible: false,
    absenceSemantics: 'unknown_not_disclosed',
  },
];

const POLICY_BY_PREDICATE: ReadonlyMap<string, RelationBuilderPolicy> = new Map(
  RELATION_BUILDER_POLICIES.map((policy) => [policy.predicate, policy]),
);

export function getRelationBuilderPolicy(predicate: string): RelationBuilderPolicy {
  const policy = POLICY_BY_PREDICATE.get(predicate);
  if (!policy) throw new Error(`unknown relation builder predicate: ${predicate}`);
  return policy;
}

export type RelationCandidateInput = {
  predicate: string;
  /** DISTINCT source revision ids gathered by the builder (dedup enforced here). */
  distinctSourceRevisionIds: readonly number[];
  hasModelConfigEvidence: boolean;
  subjectDegree: number;
  objectDegree: number;
};

export type RelationCandidateDecision = {
  decision: 'accepted' | 'quarantined_unverified' | 'rejected';
  reasons: string[];
};

export function evaluateRelationCandidate(
  input: RelationCandidateInput,
): RelationCandidateDecision {
  const policy = getRelationBuilderPolicy(input.predicate);
  const reasons: string[] = [];

  // Hard rejections first — these candidates must never surface as accepted
  // and are not recoverable by more evidence of the same shape.
  if (!policy.promotionEligible) reasons.push('predicate_not_promotable');
  if (
    policy.superhubDegreeCap !== null &&
    (input.subjectDegree > policy.superhubDegreeCap ||
      input.objectDegree > policy.superhubDegreeCap)
  ) {
    reasons.push('superhub_cap_exceeded');
  }
  if (reasons.length > 0) return { decision: 'rejected', reasons };

  // Recoverable deficiencies quarantine the candidate (fail-closed, auditable).
  const distinctRevisions = new Set(input.distinctSourceRevisionIds).size;
  if (distinctRevisions < policy.minSourceRevisions) {
    reasons.push('insufficient_source_revisions');
  }
  if (policy.requiresModelConfig && !input.hasModelConfigEvidence) {
    reasons.push('missing_model_config');
  }
  if (reasons.length > 0) return { decision: 'quarantined_unverified', reasons };

  return { decision: 'accepted', reasons: [] };
}
