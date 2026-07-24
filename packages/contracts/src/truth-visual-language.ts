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
