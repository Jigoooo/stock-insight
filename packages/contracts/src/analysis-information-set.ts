import { z } from 'zod';

/**
 * Analysis Information Set (v2-final canonical kernel §1).
 *
 * Every report, forecast, recommendation and backtest declares exactly which
 * information it was allowed to see. The set is the machine-checkable form of
 * "what could we legitimately have known when this was computed".
 *
 * WHY THIS IS NOT `temporal.ts`. That module is the *read surface* contract:
 * two clocks (`validAt` / `knownAt`) plus a three-value `informationSet` hint,
 * shipped and consumed by web routes today. This module is the *derivation*
 * contract: four independent cutoffs, a mode, an embargo, a semantic snapshot
 * pin. They share a name and nothing else. Widening `temporal.ts` to carry
 * these fields would break every existing caller for no gain, so the two stay
 * separate and `informationSetFromTemporalQuery` is the single documented
 * bridge between them.
 *
 * The four cutoffs are independent because the time constitution
 * (canonical/00 §5) says the axes are independent:
 *   valid/event time  — when it became true in the world
 *   published_at      — when a source announced it
 *   available_at      — when we could legally reach it
 *   known_at          — when we collected and verified it
 * Collapsing them loses the ability to say "this was true then, but we could
 * not have known it".
 *
 * Requirements closed here:
 *   REQ-KERN-001  ex-ante derivation referencing post-cutoff market outcome is a hard fail
 *   REQ-KERN-002  retrospective results never overwrite past recommendation records
 *   REQ-PIT-001   ex-ante analysis cannot use artifacts from after the cutoff
 *   REQ-PIT-003   `now()` is never the business cutoff — a cutoff is always explicit
 *   REQ-PIT-004   every material read carries an information set
 */

const dateTimeSchema = z.string().datetime();

/**
 * EX_ANTE       reconstructing a decision as it could have been made then
 * LIVE          deciding now, with everything currently known
 * EX_POST       measuring what actually happened, outcomes admitted
 * RETROSPECTIVE re-analysis with hindsight, explicitly labelled as such
 */
export const analysisModeSchema = z.enum(['EX_ANTE', 'LIVE', 'EX_POST', 'RETROSPECTIVE']);
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

/**
 * Mirrors contracts/analysis-information-set.schema.json field for field.
 * `additionalProperties: false` in the frozen schema becomes `.strict()`.
 */
export const analysisInformationSetSchema = z
  .object({
    informationSetId: z.string().min(1),
    mode: analysisModeSchema,
    validCutoff: dateTimeSchema,
    sourceAvailableCutoff: dateTimeSchema,
    systemKnownCutoff: dateTimeSchema,
    marketObservationCutoff: dateTimeSchema,
    outcomeEmbargoUntil: dateTimeSchema.nullable().default(null),
    marketCalendar: z.string().nullable().default(null),
    timezone: z.string().default('UTC'),
    semanticSnapshotId: z.string().min(1),
    allowedInformationClasses: z.array(z.string()).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    // REQ-KERN-001 / REQ-PIT-001. An ex-ante set that admits market observation
    // from after the decision point is the leak the whole kernel exists to stop:
    // the analysis would be "predicting" a move it was shown. LIVE has the same
    // property for the same reason — it decides at validCutoff.
    if (
      (value.mode === 'EX_ANTE' || value.mode === 'LIVE') &&
      value.marketObservationCutoff > value.validCutoff
    ) {
      context.addIssue({
        code: 'custom',
        message: `${value.mode} information set admits market observation after validCutoff (REQ-KERN-001)`,
        path: ['marketObservationCutoff'],
      });
    }

    // The system cannot have known something before it was reachable. This is
    // the available_at <= known_at edge of the time constitution, and a set
    // that inverts it is describing an impossible collection.
    if (value.systemKnownCutoff < value.sourceAvailableCutoff) {
      context.addIssue({
        code: 'custom',
        message: 'systemKnownCutoff precedes sourceAvailableCutoff (impossible collection order)',
        path: ['systemKnownCutoff'],
      });
    }

    // An ex-ante run must not read anything the system only learned later.
    // EX_POST and RETROSPECTIVE are allowed to, that is what they are for.
    if (value.mode === 'EX_ANTE' && value.systemKnownCutoff > value.validCutoff) {
      context.addIssue({
        code: 'custom',
        message:
          'EX_ANTE information set admits knowledge acquired after validCutoff (REQ-PIT-001)',
        path: ['systemKnownCutoff'],
      });
    }

    // REQ-KERN-002. An embargo that has already lifted at the decision point
    // embargoes nothing; it would silently admit the outcome it is meant to hide.
    if (
      value.outcomeEmbargoUntil !== null &&
      value.mode === 'EX_ANTE' &&
      value.outcomeEmbargoUntil < value.validCutoff
    ) {
      context.addIssue({
        code: 'custom',
        message: 'outcomeEmbargoUntil precedes validCutoff — the embargo admits the outcome',
        path: ['outcomeEmbargoUntil'],
      });
    }

    if (value.allowedInformationClasses.length !== new Set(value.allowedInformationClasses).size) {
      context.addIssue({
        code: 'custom',
        message: 'allowedInformationClasses contains duplicates',
        path: ['allowedInformationClasses'],
      });
    }
  });

export type AnalysisInformationSet = z.infer<typeof analysisInformationSetSchema>;

/**
 * Classes that may never feed an ex-ante derivation, whatever the caller asks
 * for. RECOMMENDATION and PERSONAL_DECISION are outputs of the pipeline, so
 * admitting them as input would make a decision its own evidence
 * (semantic-type-rules.json forbids both edges). OUTCOME is the answer the
 * ex-ante run is supposed to be blind to.
 */
const EX_ANTE_FORBIDDEN_CLASSES: readonly string[] = [
  'OUTCOME',
  'RECOMMENDATION',
  'PERSONAL_DECISION',
];

/**
 * Returns the forbidden classes a set actually requested, empty when clean.
 * Kept separate from the schema so callers can report every violation at once
 * rather than failing on the first.
 */
export function forbiddenInformationClasses(set: AnalysisInformationSet): string[] {
  if (set.mode !== 'EX_ANTE') return [];
  return EX_ANTE_FORBIDDEN_CLASSES.filter((truthClass) =>
    set.allowedInformationClasses.includes(truthClass),
  );
}

/**
 * The one bridge from the read-surface contract to the derivation contract.
 *
 * `temporal.ts` resolves a request into `validAt` / `knownAt`. Promoting that
 * to an information set requires three things the read surface does not carry —
 * a semantic snapshot, an id, and a market observation cutoff — so they are
 * required parameters rather than guessed defaults. Guessing them is how a
 * cutoff silently becomes `now()`, which REQ-PIT-003 forbids.
 *
 * `point_in_time` maps to EX_ANTE because that is what it means: admit nothing
 * learned after the world time being asked about. `as_known` and `latest` map
 * to LIVE — they answer "what do we know now".
 */
export function informationSetFromTemporalQuery(
  resolved: {
    validAt: string;
    knownAt: string;
    informationSet: 'as_known' | 'point_in_time' | 'latest';
  },
  required: {
    informationSetId: string;
    semanticSnapshotId: string;
    marketObservationCutoff?: string;
    allowedInformationClasses?: string[];
    marketCalendar?: string | null;
    timezone?: string;
  },
): AnalysisInformationSet {
  const mode: AnalysisMode = resolved.informationSet === 'point_in_time' ? 'EX_ANTE' : 'LIVE';
  // Both modes are bounded by validAt above, so defaulting the market cutoff to
  // validAt is the only choice that cannot leak. A caller wanting a tighter
  // bound passes one; a looser bound is rejected by the schema.
  const marketObservationCutoff = required.marketObservationCutoff ?? resolved.validAt;

  // EX_ANTE clamps BOTH source and knowledge cutoffs to validAt, not just the
  // knowledge one. `temporal.ts` normally pins knownAt to validAt for
  // point_in_time, but an explicit `knownAt` overrides that pin and can arrive
  // later. Carrying that later value into sourceAvailableCutoff while clamping
  // systemKnownCutoff would invert the two and fail the impossible-collection
  // check with a message about collection order — when the real problem is that
  // the caller asked an ex-ante question with a post-cutoff knowledge bound.
  // Clamping both keeps ex-ante meaning exactly one thing: nothing after validAt.
  const sourceAvailableCutoff = mode === 'EX_ANTE' ? resolved.validAt : resolved.knownAt;
  const systemKnownCutoff = mode === 'EX_ANTE' ? resolved.validAt : resolved.knownAt;

  return analysisInformationSetSchema.parse({
    informationSetId: required.informationSetId,
    mode,
    validCutoff: resolved.validAt,
    sourceAvailableCutoff,
    systemKnownCutoff,
    marketObservationCutoff,
    outcomeEmbargoUntil: null,
    marketCalendar: required.marketCalendar ?? null,
    timezone: required.timezone ?? 'UTC',
    semanticSnapshotId: required.semanticSnapshotId,
    allowedInformationClasses: required.allowedInformationClasses ?? [],
  });
}
