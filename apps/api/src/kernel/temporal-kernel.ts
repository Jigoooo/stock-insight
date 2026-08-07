import type { AnalysisInformationSet } from '@stock-insight/contracts/analysis-information-set';

/**
 * Temporal Query Kernel — v2-final canonical/02 §2.
 *
 * REQ-PIT-004: every material read goes through the kernel. The point is not
 * abstraction for its own sake — it is that a cutoff cannot be forgotten. Today
 * PIT logic is spread across hand-written SQL (RELATION_PIT_SQL, the
 * v_*_pit_v1 views, the analytics publishers), each of which decides its own
 * boundary. The kernel makes the boundary an argument the caller must supply,
 * sourced from an information set rather than from now().
 *
 * SCOPE. This is for new callers only. Existing PIT SQL is not rewritten here —
 * apps/api/src/analytics/run-v2-graph-publish.ts alone is 121KB and moving it is
 * K7's job, tracked as the two recorded exceptions in run-pit-now-audit.ts.
 * Introducing the kernel and migrating every caller in one change would couple a
 * contract change to a large refactor, and if the result broke there would be no
 * way to tell which half did it.
 *
 * WHAT THIS DOES NOT DO. It does not execute queries and does not own a
 * connection. It resolves an information set into the bound parameters a PIT
 * query needs and names the seven operations canonical/02 §2 fixes, so that a
 * reader can see which axis a query is standing on. Execution stays with the
 * caller's executor, matching how every read model in this repo already works.
 */

/** The seven operations canonical/02 §2 names. */
export const PIT_OPERATIONS = [
  'PIT_SELECT',
  'PIT_JOIN',
  'PIT_UNIVERSE',
  'PIT_PRICE',
  'PIT_EXPECTATION',
  'PIT_ENTITY_STATE',
  'PIT_RELATION',
] as const;

export type PitOperation = (typeof PIT_OPERATIONS)[number];

/**
 * Which cutoff each operation stands on.
 *
 * This table is the substance of the kernel. Getting it wrong is the leak:
 * PIT_PRICE bound to systemKnownCutoff rather than marketObservationCutoff would
 * let an ex-ante run see prices it could not have seen, which is exactly
 * REQ-KERN-001. Writing it once, here, is why a caller cannot get it wrong.
 */
const OPERATION_AXIS: Record<PitOperation, keyof PitCutoffs> = {
  // Facts and assertions: what the system had legitimately collected.
  PIT_SELECT: 'systemKnownCutoff',
  PIT_JOIN: 'systemKnownCutoff',
  // Universe membership is about what existed in the world, not what we knew of
  // it — REQ-PIT-002 asks for the universe as it then stood.
  PIT_UNIVERSE: 'validCutoff',
  // Market observation is the one axis an ex-ante run must be blind to.
  PIT_PRICE: 'marketObservationCutoff',
  // An expectation is a published artifact; its bound is availability.
  PIT_EXPECTATION: 'sourceAvailableCutoff',
  PIT_ENTITY_STATE: 'validCutoff',
  PIT_RELATION: 'systemKnownCutoff',
};

export type PitCutoffs = {
  validCutoff: string;
  sourceAvailableCutoff: string;
  systemKnownCutoff: string;
  marketObservationCutoff: string;
};

export type PitQueryContext = {
  informationSetId: string;
  semanticSnapshotId: string;
  mode: AnalysisInformationSet['mode'];
  cutoffs: PitCutoffs;
  marketCalendar: string | null;
  timezone: string;
};

/**
 * Builds the query context from an information set.
 *
 * Deliberately the only way to make a context: there is no overload taking loose
 * timestamps, because that overload is how a caller ends up passing `new Date()`
 * and reintroducing REQ-PIT-003 through the front door.
 */
export function pitContextFromInformationSet(set: AnalysisInformationSet): PitQueryContext {
  return {
    informationSetId: set.informationSetId,
    semanticSnapshotId: set.semanticSnapshotId,
    mode: set.mode,
    cutoffs: {
      validCutoff: set.validCutoff,
      sourceAvailableCutoff: set.sourceAvailableCutoff,
      systemKnownCutoff: set.systemKnownCutoff,
      marketObservationCutoff: set.marketObservationCutoff,
    },
    marketCalendar: set.marketCalendar,
    timezone: set.timezone,
  };
}

/** The cutoff an operation stands on, as a bindable ISO timestamp. */
export function cutoffForOperation(context: PitQueryContext, operation: PitOperation): string {
  const axis = OPERATION_AXIS[operation];
  if (axis === undefined) throw new Error(`Unknown PIT operation: ${String(operation)}`);
  return context.cutoffs[axis];
}

/** Which axis an operation stands on. Exported so a trace can record it. */
export function axisForOperation(operation: PitOperation): keyof PitCutoffs {
  const axis = OPERATION_AXIS[operation];
  if (axis === undefined) throw new Error(`Unknown PIT operation: ${String(operation)}`);
  return axis;
}

export type PitQueryTrace = {
  operation: PitOperation;
  axis: keyof PitCutoffs;
  cutoff: string;
  informationSetId: string;
  semanticSnapshotId: string;
};

/**
 * REQ-KERN-010 requires the selected revisions and the query trace to be stored
 * in the run manifest. A trace records which axis a read stood on, so an audit can
 * answer "why did this query see that row" without re-deriving it from SQL.
 */
export function traceForOperation(
  context: PitQueryContext,
  operation: PitOperation,
): PitQueryTrace {
  const axis = axisForOperation(operation);
  return {
    operation,
    axis,
    cutoff: context.cutoffs[axis],
    informationSetId: context.informationSetId,
    semanticSnapshotId: context.semanticSnapshotId,
  };
}

export type PitBinding = {
  /** The bound cutoff, to be passed as a query parameter. */
  cutoff: string;
  trace: PitQueryTrace;
};

/**
 * Binds one operation for one query.
 *
 * Returns the cutoff and its trace together so a caller physically cannot record
 * one without the other — a trace that disagrees with the value actually bound
 * would be worse than no trace, because it would be believed.
 */
export function bindPitOperation(context: PitQueryContext, operation: PitOperation): PitBinding {
  return {
    cutoff: cutoffForOperation(context, operation),
    trace: traceForOperation(context, operation),
  };
}

/**
 * Rejects a context that would leak, independently of the schema that produced it.
 *
 * The contract and the database both enforce these already. This is the third
 * check, at the point of use, because a context can be assembled in memory from
 * parts — and the whole reason the kernel exists is that "the boundary was right
 * when the row was written" is not the same claim as "the boundary is right in
 * this query".
 */
export function assertPitContextSound(context: PitQueryContext): void {
  const { cutoffs, mode } = context;
  if (
    (mode === 'EX_ANTE' || mode === 'LIVE') &&
    cutoffs.marketObservationCutoff > cutoffs.validCutoff
  ) {
    throw new Error(
      `PIT context for ${mode} admits market observation after validCutoff (REQ-KERN-001)`,
    );
  }
  if (cutoffs.systemKnownCutoff < cutoffs.sourceAvailableCutoff) {
    throw new Error('PIT context knows before it can reach (impossible collection order)');
  }
  if (mode === 'EX_ANTE' && cutoffs.systemKnownCutoff > cutoffs.validCutoff) {
    throw new Error('PIT context for EX_ANTE admits knowledge after validCutoff (REQ-PIT-001)');
  }
}
