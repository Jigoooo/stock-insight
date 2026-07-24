import { z } from 'zod';

/**
 * GraphRAG retrieval router (enhancement plan P2-11, §15.1-§15.4, §S2).
 *
 * A deterministic, dependency-free router that classifies a natural-language
 * query into one of six retrieval intents, picks the graph it should traverse
 * (entity vs. event dual graph), and declares the evidence / executable-program
 * requirements the answer must satisfy. It also compiles free text into atomic
 * statements, refusing any sentence that fuses a fact with an inference (§S2).
 *
 * This is a contract + planning layer. It never talks to a database; a caller
 * uses the returned plan to pick the right read model and to enforce the
 * evidence gates at answer time.
 */

export const retrievalIntentSchema = z.enum([
  'factual',
  'numeric',
  'relation',
  'global',
  'impact',
  'contradiction',
]);

export type RetrievalIntent = z.infer<typeof retrievalIntentSchema>;

export const retrievalPlanSchema = z.object({
  intent: retrievalIntentSchema,
  // §15.3 dual graph: entity-centric vs. event-centric traversal.
  graphTarget: z.enum(['entity', 'event']),
  // Every answer must attach evidence; there is no evidence-free retrieval path.
  requiresEvidence: z.literal(true),
  // §15.2: numeric answers must be produced by a replayable program + inputs.
  requiresExecutableProgram: z.boolean(),
  // §15.4 specialized routes.
  geoScoped: z.boolean(),
  portfolioScoped: z.boolean(),
});

export type RetrievalPlan = z.infer<typeof retrievalPlanSchema>;

// ── intent classification ─────────────────────────────────────────────────────
// Order matters: the most specific signals are tested first so that, e.g., an
// impact question about a number is routed as `impact` (which itself demands a
// program) rather than a bare `numeric` lookup.

const CONTRADICTION_SIGNALS = [
  '모순',
  '상충',
  '충돌',
  '반박',
  'contradict',
  'conflict',
  'inconsistent',
];
const IMPACT_SIGNALS = [
  '영향',
  '충격',
  '여파',
  '미치는',
  '노출',
  'impact',
  'affect',
  'exposure',
  'shock',
];
const RELATION_SIGNALS = [
  '관계',
  '공급',
  '경쟁',
  '연결',
  '협력',
  '고객사',
  '공급사',
  'relation',
  'supplier',
  'customer',
  'competitor',
  'connected',
];
const NUMERIC_SIGNALS = [
  '얼마',
  '몇',
  '퍼센트',
  '%',
  '비율',
  '금액',
  '매출',
  '영업이익',
  '규모',
  'how much',
  'how many',
  'percent',
  'ratio',
  'revenue',
];
const GLOBAL_SIGNALS = [
  '전반',
  '큰 그림',
  '요약',
  '개요',
  '동향',
  '전체',
  'overview',
  'summary',
  'big picture',
  'landscape',
  'overall',
];

const GEO_SIGNALS = [
  '항',
  '지역',
  '국가',
  '관할',
  '폐쇄',
  '재난',
  '제재',
  'port',
  'region',
  'jurisdiction',
  'closure',
  'disaster',
  'sanction',
];
const PORTFOLIO_SIGNALS = [
  '내 포트폴리오',
  '포트폴리오',
  '내 종목',
  '보유',
  'my portfolio',
  'my holdings',
  'holding',
];

const includesAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

export function classifyRetrievalIntent(query: string): RetrievalIntent {
  const q = query.toLowerCase();
  // Contradiction is the most specific dialectic intent.
  if (includesAny(q, CONTRADICTION_SIGNALS)) {
    return 'contradiction';
  }
  // Impact (a directional effect claim) outranks a bare numeric lookup.
  if (includesAny(q, IMPACT_SIGNALS)) {
    return 'impact';
  }
  if (includesAny(q, RELATION_SIGNALS)) {
    return 'relation';
  }
  if (includesAny(q, NUMERIC_SIGNALS)) {
    return 'numeric';
  }
  if (includesAny(q, GLOBAL_SIGNALS)) {
    return 'global';
  }
  // Default: a specific fact lookup about an entity.
  return 'factual';
}

// Entity-centric vs. event-centric graph selection (§15.3).
const EVENT_GRAPH_INTENTS: ReadonlySet<RetrievalIntent> = new Set([
  'impact',
  'contradiction',
  'global',
]);

export function routeRetrievalQuery(query: string): RetrievalPlan {
  const intent = classifyRetrievalIntent(query);
  const q = query.toLowerCase();
  return retrievalPlanSchema.parse({
    intent,
    graphTarget: EVENT_GRAPH_INTENTS.has(intent) ? 'event' : 'entity',
    requiresEvidence: true,
    // Numeric AND impact answers surface figures, so both must be replayable.
    requiresExecutableProgram: intent === 'numeric' || intent === 'impact',
    geoScoped: includesAny(q, GEO_SIGNALS),
    portfolioScoped: includesAny(q, PORTFOLIO_SIGNALS),
  });
}

// ── atomic statement compiler (§S2) ───────────────────────────────────────────

export const atomicStatementSchema = z.object({
  text: z.string().min(1),
  kind: z.enum(['fact', 'inference']),
});

export type AtomicStatement = z.infer<typeof atomicStatementSchema>;

export type CompileResult =
  | { ok: true; statements: AtomicStatement[] }
  | { ok: false; reason: string };

// Connectives that fuse a premise with a conclusion inside one sentence. A
// sentence carrying both a factual clause and one of these inferential pivots is
// a mixed statement and must be split upstream, not stored as a single claim.
const INFERENTIAL_PIVOTS = [
  '때문에',
  '따라서',
  '그러므로',
  '이므로',
  '으로 인해',
  '결과적으로',
  'therefore',
  'thus',
  'because',
  'hence',
  'so that',
];

// Markers that a clause is itself an inference/forecast rather than a fact.
const INFERENTIAL_PREDICATES = [
  '것이다',
  '전망',
  '예상',
  '될 것',
  '상승할',
  '하락할',
  'will ',
  'expected',
  'likely',
  'forecast',
];

const isInference = (sentence: string): boolean =>
  INFERENTIAL_PREDICATES.some((marker) => sentence.includes(marker));

const hasInferentialPivot = (sentence: string): boolean =>
  INFERENTIAL_PIVOTS.some((pivot) => sentence.includes(pivot));

export function compileAtomicStatements(input: string): CompileResult {
  const sentences = input
    .split(/(?<=[.!?。])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return { ok: false, reason: '빈 입력: 원자 문장을 만들 수 없습니다.' };
  }

  const statements: AtomicStatement[] = [];
  for (const sentence of sentences) {
    // §S2: a sentence may not fuse a fact with an inference. A causal/consequential
    // pivot combined with an inferential predicate is a mixed statement.
    if (hasInferentialPivot(sentence) && isInference(sentence)) {
      return {
        ok: false,
        reason: `한 문장에 사실과 추론이 혼합되어 있습니다(§S2): "${sentence}". 사실 절과 추론 절을 분리하세요. (mixed fact/inference)`,
      };
    }
    statements.push({
      text: sentence,
      kind: isInference(sentence) ? 'inference' : 'fact',
    });
  }
  return { ok: true, statements };
}
