import { z } from 'zod';

/**
 * Truth visual language (enhancement plan P3-4, §21.3, §S2).
 *
 * A deterministic mapping from an epistemic class to how a relation / claim is
 * rendered. The visual language is load-bearing: it is how a reader tells a fact
 * from an estimate from a forecast without reading fine print. Hard rules:
 *   - a fact is a solid line; a hypothesis is dashed.
 *   - a causal claim is identified by an explicit label, never by style alone.
 *   - an estimate carries a distinct badge so it is never confused with a fact.
 *   - a forecast is drawn as a distribution, not a point.
 *   - a candidate relation is hidden by default and only appears in research mode.
 * This is a pure contract layer; the renderer consumes the spec.
 */

export const epistemicClassSchema = z.enum([
  'fact',
  'estimate',
  'causal',
  'hypothesis',
  'forecast',
  'candidate',
]);

export type EpistemicClass = z.infer<typeof epistemicClassSchema>;

export const truthRenderSpecSchema = z
  .object({
    epistemicClass: epistemicClassSchema,
    lineStyle: z.enum(['solid', 'dashed', 'dotted']),
    badge: z.enum(['none', 'estimate', 'causal', 'hypothesis', 'forecast', 'candidate']),
    requiresCausalLabel: z.boolean(),
    distribution: z.boolean(),
    defaultVisible: z.boolean(),
    candidateOnly: z.boolean(),
    legendKey: z.string().min(1),
  })
  .superRefine((value, context) => {
    const expected = RENDER_SPECS[value.epistemicClass];
    for (const field of [
      'lineStyle',
      'badge',
      'requiresCausalLabel',
      'distribution',
      'defaultVisible',
      'candidateOnly',
      'legendKey',
    ] as const) {
      if (value[field] !== expected[field]) {
        context.addIssue({
          code: 'custom',
          message: `${value.epistemicClass} render spec contradicts canonical ${field}`,
          path: [field],
        });
      }
    }
  });

export type TruthRenderSpec = z.infer<typeof truthRenderSpecSchema>;

// The canonical, frozen mapping. Each class is visually distinct.
const RENDER_SPECS: Record<EpistemicClass, TruthRenderSpec> = {
  fact: {
    epistemicClass: 'fact',
    lineStyle: 'solid',
    badge: 'none',
    requiresCausalLabel: false,
    distribution: false,
    defaultVisible: true,
    candidateOnly: false,
    legendKey: 'truth.fact',
  },
  estimate: {
    epistemicClass: 'estimate',
    lineStyle: 'solid',
    badge: 'estimate',
    requiresCausalLabel: false,
    distribution: false,
    defaultVisible: true,
    candidateOnly: false,
    legendKey: 'truth.estimate',
  },
  causal: {
    epistemicClass: 'causal',
    lineStyle: 'solid',
    badge: 'causal',
    // §21.3: causality is only ever asserted through an explicit label.
    requiresCausalLabel: true,
    distribution: false,
    defaultVisible: true,
    candidateOnly: false,
    legendKey: 'truth.causal',
  },
  hypothesis: {
    epistemicClass: 'hypothesis',
    lineStyle: 'dashed',
    badge: 'hypothesis',
    requiresCausalLabel: false,
    distribution: false,
    defaultVisible: true,
    candidateOnly: false,
    legendKey: 'truth.hypothesis',
  },
  forecast: {
    epistemicClass: 'forecast',
    lineStyle: 'dotted',
    badge: 'forecast',
    requiresCausalLabel: false,
    // A forecast is a distribution, never a false-precise point.
    distribution: true,
    defaultVisible: true,
    candidateOnly: false,
    legendKey: 'truth.forecast',
  },
  candidate: {
    epistemicClass: 'candidate',
    lineStyle: 'dashed',
    badge: 'candidate',
    requiresCausalLabel: false,
    distribution: false,
    // §S2: candidate relations are hidden by default; research mode only.
    defaultVisible: false,
    candidateOnly: true,
    legendKey: 'truth.candidate',
  },
};

for (const spec of Object.values(RENDER_SPECS)) Object.freeze(spec);
Object.freeze(RENDER_SPECS);

export function renderSpecForClass(epistemicClass: EpistemicClass): TruthRenderSpec {
  // Parse first so an unknown class throws rather than silently defaulting to a
  // visible style (fail-closed).
  const parsed = epistemicClassSchema.parse(epistemicClass);
  return RENDER_SPECS[parsed];
}

export type EdgeRenderInput = {
  epistemicClass: EpistemicClass;
  researchMode: boolean;
};

export type EdgeRenderResolution = {
  visible: boolean;
  spec: TruthRenderSpec;
};

/**
 * Resolve whether an edge is drawn and how, given the current mode. A candidate
 * edge is invisible outside research mode; everything else follows its class
 * default. The spec is always returned so a caller can render a legend even when
 * the edge itself is hidden.
 */
export function resolveEdgeRenderSpec(input: EdgeRenderInput): EdgeRenderResolution {
  const spec = renderSpecForClass(input.epistemicClass);
  const visible = spec.candidateOnly ? input.researchMode : spec.defaultVisible;
  return { visible, spec };
}

/* ------------------------------------------------------------------------- *
 * Truth classes (v2-final canonical 00 §4) — REQ-SEM-010
 *
 * The six epistemic classes above are a *rendering* vocabulary and stay exactly
 * as they were. The fourteen truth classes below are the *canonical* vocabulary
 * frozen in contracts/truth-classes.json, and REQ-SEM-010 requires them to be
 * visually distinguishable in the UI.
 *
 * They are NOT the same axis and are not merged:
 *   - `candidate` is a lifecycle state, not a truth class. A candidate RELATION
 *     and an accepted RELATION are the same class at different acceptance
 *     stages, which is why it stays on the epistemic axis.
 *   - Nine truth classes (SOURCE, ASSERTION, EVENT, RELATION, EXPOSURE,
 *     NARRATIVE, RECOMMENDATION, PERSONAL_DECISION, OUTCOME) had no epistemic
 *     class at all — they were unrenderable before this.
 * ------------------------------------------------------------------------- */

export const truthClassSchema = z.enum([
  'SOURCE',
  'ASSERTION',
  'FACT',
  'EVENT',
  'RELATION',
  'EXPOSURE',
  'STATISTICAL_ESTIMATE',
  'CAUSAL_ESTIMATE',
  'FORECAST',
  'HYPOTHESIS',
  'NARRATIVE',
  'RECOMMENDATION',
  'PERSONAL_DECISION',
  'OUTCOME',
]);

export type TruthClass = z.infer<typeof truthClassSchema>;

export const truthClassRenderSpecSchema = z
  .object({
    truthClass: truthClassSchema,
    lineStyle: z.enum(['solid', 'dashed', 'dotted']),
    badge: z.string().min(1),
    /** Causality is asserted through an explicit label, never through style. */
    requiresCausalLabel: z.boolean(),
    /** Drawn as a distribution rather than a false-precise point. */
    distribution: z.boolean(),
    /**
     * REQ-SEM-003 / REQ-REC-001: user-private state must never be rendered into
     * a common surface. A renderer that ignores this leaks a portfolio into the
     * shared asset view.
     */
    privateScope: z.boolean(),
    legendKey: z.string().min(1),
  })
  .strict();

export type TruthClassRenderSpec = z.infer<typeof truthClassRenderSpecSchema>;

const TRUTH_CLASS_RENDER_SPECS: Record<TruthClass, TruthClassRenderSpec> = {
  // Ground truth: the artifact itself and what it claimed. ASSERTION is
  // deliberately not styled as FACT — "reported but denied" is an assertion,
  // and canonical/02 §4 (REQ-KERN-030) forbids collapsing the two.
  SOURCE: s('SOURCE', 'solid', 'source'),
  ASSERTION: s('ASSERTION', 'dashed', 'assertion'),
  FACT: s('FACT', 'solid', 'none'),
  EVENT: s('EVENT', 'solid', 'event'),

  // Structure and sensitivity. RELATION is existence; EXPOSURE is magnitude.
  // REQ-WORLD-010 keeps them apart, so they must not look alike.
  RELATION: s('RELATION', 'solid', 'relation'),
  EXPOSURE: s('EXPOSURE', 'solid', 'exposure'),

  // Inference. Observational and causal estimates are different claims at very
  // different prices; only the causal one carries the label requirement.
  STATISTICAL_ESTIMATE: s('STATISTICAL_ESTIMATE', 'solid', 'estimate'),
  CAUSAL_ESTIMATE: s('CAUSAL_ESTIMATE', 'solid', 'causal', { requiresCausalLabel: true }),
  FORECAST: s('FORECAST', 'dotted', 'forecast', { distribution: true }),
  HYPOTHESIS: s('HYPOTHESIS', 'dashed', 'hypothesis'),

  // Attention is not economic truth. semantic-type-rules.json forbids
  // NARRATIVE → FACT outright, so it is dashed and badged to keep a popular
  // story from reading as an established one.
  NARRATIVE: s('NARRATIVE', 'dashed', 'narrative'),

  // Decisions. PERSONAL_DECISION is the only private-scope class.
  RECOMMENDATION: s('RECOMMENDATION', 'solid', 'recommendation'),
  PERSONAL_DECISION: s('PERSONAL_DECISION', 'solid', 'decision', { privateScope: true }),
  OUTCOME: s('OUTCOME', 'solid', 'outcome'),
};

function s(
  truthClass: TruthClass,
  lineStyle: 'solid' | 'dashed' | 'dotted',
  badge: string,
  overrides: Partial<
    Pick<TruthClassRenderSpec, 'requiresCausalLabel' | 'distribution' | 'privateScope'>
  > = {},
): TruthClassRenderSpec {
  return {
    truthClass,
    lineStyle,
    badge,
    requiresCausalLabel: overrides.requiresCausalLabel ?? false,
    distribution: overrides.distribution ?? false,
    privateScope: overrides.privateScope ?? false,
    legendKey: `truth.class.${truthClass.toLowerCase()}`,
  };
}

for (const spec of Object.values(TRUTH_CLASS_RENDER_SPECS)) Object.freeze(spec);
Object.freeze(TRUTH_CLASS_RENDER_SPECS);

/** Fail-closed: an unknown class throws rather than defaulting to a fact style. */
export function renderSpecForTruthClass(truthClass: TruthClass): TruthClassRenderSpec {
  return TRUTH_CLASS_RENDER_SPECS[truthClassSchema.parse(truthClass)];
}

/**
 * Where the two vocabularies overlap. Five truth classes have an epistemic
 * equivalent; the other nine return null because they never had one. `candidate`
 * has no truth class in the other direction — it is an acceptance stage.
 *
 * Provided so a surface already rendering epistemic classes can adopt truth
 * classes incrementally instead of switching in one step.
 */
export function epistemicClassForTruthClass(truthClass: TruthClass): EpistemicClass | null {
  switch (truthClassSchema.parse(truthClass)) {
    case 'FACT':
      return 'fact';
    case 'STATISTICAL_ESTIMATE':
      return 'estimate';
    case 'CAUSAL_ESTIMATE':
      return 'causal';
    case 'HYPOTHESIS':
      return 'hypothesis';
    case 'FORECAST':
      return 'forecast';
    default:
      return null;
  }
}
