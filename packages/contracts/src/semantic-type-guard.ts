import { z } from 'zod';

/**
 * The class vocabulary is declared here rather than imported from
 * `truth-visual-language.ts`. Modules in this package do not import each other:
 * `tsc` rejects a `.ts` import specifier (TS5097) while Node's ESM loader
 * requires one, and the disagreement propagates into every consumer's tsconfig.
 * Each module therefore declares what it needs and a parity test asserts it
 * against `contracts/truth-classes.json`, so a divergence fails a test instead of
 * shipping.
 */
const truthClassSchema = z.enum([
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

type TruthClass = z.infer<typeof truthClassSchema>;

export { truthClassSchema };
export type { TruthClass };

/**
 * Semantic type guard — v2-final canonical/00 §3, `contracts/semantic-type-rules.json`.
 *
 * The constitution fixes which truth class may feed which. The direction matters
 * because the forbidden edges are the ones that quietly destroy the epistemics:
 *
 *   RECOMMENDATION → FACT       a decision becoming its own evidence
 *   PERSONAL_DECISION → FACT    a user's action mutating common truth
 *   FORECAST → ASSERTION        a prediction overwriting what was said
 *   NARRATIVE → FACT            attention promoted to economic truth
 *
 * None of these look wrong at the call site. They look like "use what we have".
 * That is why the rule is a table rather than a review convention.
 *
 * Closes REQ-SEM-001 (the dependency graph is acyclic), REQ-SEM-002 (a lower
 * truth class is not modified by a higher-level inference) and the input half of
 * REQ-KERN-040 (every derivation input passes the semantic type rules).
 *
 * WHY THE RULES ARE INLINE RATHER THAN READ FROM THE FROZEN JSON. This module is
 * imported by browser-facing code, which has no filesystem. The parity test reads
 * the JSON and asserts these tables match it, so drift fails a test rather than
 * shipping.
 */

/** Allowed `[from, to]` edges. Anything not listed is not allowed. */
const ALLOWED_DIRECTIONS: readonly (readonly [TruthClass, TruthClass])[] = [
  ['SOURCE', 'ASSERTION'],
  ['ASSERTION', 'FACT'],
  ['ASSERTION', 'EVENT'],
  ['FACT', 'EXPOSURE'],
  ['EVENT', 'EXPOSURE'],
  ['RELATION', 'EXPOSURE'],
  ['EXPOSURE', 'STATISTICAL_ESTIMATE'],
  ['EXPOSURE', 'CAUSAL_ESTIMATE'],
  ['FACT', 'STATISTICAL_ESTIMATE'],
  ['FACT', 'FORECAST'],
  ['EVENT', 'FORECAST'],
  ['STATISTICAL_ESTIMATE', 'FORECAST'],
  ['CAUSAL_ESTIMATE', 'FORECAST'],
  ['FORECAST', 'RECOMMENDATION'],
  ['FACT', 'RECOMMENDATION'],
  ['EXPOSURE', 'RECOMMENDATION'],
  ['RECOMMENDATION', 'PERSONAL_DECISION'],
  ['FORECAST', 'OUTCOME'],
  ['RECOMMENDATION', 'OUTCOME'],
];

/**
 * Explicitly forbidden edges, each with the reason from the freeze. These are a
 * subset of "not allowed", carried separately so a violation can say *why*
 * instead of only "not in the table" — the reason is what stops someone adding
 * the edge to make an error go away.
 */
const FORBIDDEN_DIRECTIONS: readonly {
  from: TruthClass;
  to: TruthClass;
  reason: string;
}[] = [
  {
    from: 'RECOMMENDATION',
    to: 'FACT',
    reason: 'decision output cannot become truth evidence',
  },
  {
    from: 'PERSONAL_DECISION',
    to: 'FACT',
    reason: 'private action cannot mutate common truth',
  },
  {
    from: 'FORECAST',
    to: 'ASSERTION',
    reason: 'forecast cannot overwrite historical assertion',
  },
  { from: 'NARRATIVE', to: 'FACT', reason: 'attention is not economic truth' },
];

const allowedKeys = new Set(ALLOWED_DIRECTIONS.map(([from, to]) => `${from}>${to}`));
const forbiddenByKey = new Map(
  FORBIDDEN_DIRECTIONS.map((rule) => [`${rule.from}>${rule.to}`, rule.reason]),
);

export const semanticTypeViolationSchema = z.object({
  from: truthClassSchema,
  to: truthClassSchema,
  /**
   * `forbidden` is a named prohibition with a reason; `not_allowed` is simply
   * absent from the table. Both reject, but only the first can explain itself,
   * and the distinction tells a reviewer whether they hit a wall or a gap.
   */
  kind: z.enum(['forbidden', 'not_allowed']),
  reason: z.string().min(1),
});

export type SemanticTypeViolation = z.infer<typeof semanticTypeViolationSchema>;

/** True when `from` may legitimately feed `to`. */
export function isAllowedTransition(from: TruthClass, to: TruthClass): boolean {
  return allowedKeys.has(`${from}>${to}`);
}

/** Returns the violation for an edge, or null when it is allowed. */
export function checkTransition(from: TruthClass, to: TruthClass): SemanticTypeViolation | null {
  const parsedFrom = truthClassSchema.parse(from);
  const parsedTo = truthClassSchema.parse(to);
  const key = `${parsedFrom}>${parsedTo}`;
  if (allowedKeys.has(key)) return null;

  const forbiddenReason = forbiddenByKey.get(key);
  if (forbiddenReason !== undefined) {
    return { from: parsedFrom, to: parsedTo, kind: 'forbidden', reason: forbiddenReason };
  }
  return {
    from: parsedFrom,
    to: parsedTo,
    kind: 'not_allowed',
    reason: `${parsedFrom} is not an admitted input to ${parsedTo} (canonical/00 §3)`,
  };
}

/**
 * Checks every input of one derivation against its output class.
 *
 * Returns all violations rather than the first, because a derivation with three
 * bad inputs is a different problem from one with a single mistake, and fixing
 * them one error message at a time hides that.
 */
export function checkDerivationInputs(
  outputClass: TruthClass,
  inputClasses: readonly TruthClass[],
): SemanticTypeViolation[] {
  const violations: SemanticTypeViolation[] = [];
  for (const inputClass of inputClasses) {
    const violation = checkTransition(inputClass, outputClass);
    if (violation !== null) violations.push(violation);
  }
  return violations;
}

export type DerivationEdge = { from: string; to: string };

/**
 * Finds a cycle in a derivation DAG, or returns null.
 *
 * REQ-SEM-001 and REQ-KERN-040 both require acyclicity, and the type table alone
 * does not give it: FACT → FORECAST → OUTCOME are all allowed transitions, so a
 * concrete graph can still close a loop through nodes of different classes. This
 * operates on derivation ids, not classes, for that reason.
 *
 * Iterative rather than recursive — a derivation chain over a real corpus is
 * deep enough to blow the stack, and a guard that crashes on the graphs it exists
 * to check is not a guard.
 */
export function findDerivationCycle(edges: readonly DerivationEdge[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from);
    if (list === undefined) adjacency.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }

  const UNVISITED = 0;
  const IN_PROGRESS = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const root of adjacency.keys()) {
    if ((state.get(root) ?? UNVISITED) !== UNVISITED) continue;

    const stack: { node: string; nextIndex: number }[] = [{ node: root, nextIndex: 0 }];
    state.set(root, IN_PROGRESS);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbours = adjacency.get(frame.node) ?? [];

      if (frame.nextIndex >= neighbours.length) {
        state.set(frame.node, DONE);
        stack.pop();
        continue;
      }

      const next = neighbours[frame.nextIndex]!;
      frame.nextIndex += 1;
      const nextState = state.get(next) ?? UNVISITED;

      if (nextState === IN_PROGRESS) {
        // Walk the parent chain back to `next` to report the actual loop rather
        // than just "a cycle exists".
        const cycle = [next];
        let cursor = frame.node;
        while (cursor !== next) {
          cycle.push(cursor);
          const previous = parent.get(cursor);
          if (previous === undefined) break;
          cursor = previous;
        }
        cycle.push(next);
        return cycle.reverse();
      }

      if (nextState === UNVISITED) {
        parent.set(next, frame.node);
        state.set(next, IN_PROGRESS);
        stack.push({ node: next, nextIndex: 0 });
      }
    }
  }

  return null;
}

/** The tables, exported so the parity test can compare them to the frozen JSON. */
export const SEMANTIC_TYPE_RULES = {
  allowedDirections: ALLOWED_DIRECTIONS,
  forbiddenDirections: FORBIDDEN_DIRECTIONS,
} as const;
