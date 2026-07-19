import { createHash } from 'node:crypto';

const RELATION_KINDS = new Set(['structural', 'inferred', 'statistical']);

// B7 — reproducible graph snapshot planner (master plan §8 B7).
// A snapshot pins the exact accepted relation-revision set visible at
// (asOf, knownAt). The digest is a deterministic SHA-256 over the ORDERED
// revision membership, so replaying the same cutoffs reproduces the same
// digest byte-for-byte. The degree ledger measures TOTAL cross-predicate
// degree per entity — the B6 carry-over that per-hub builder caps cannot see.

export type SnapshotEdgeInput = {
  relationRevisionId: number;
  relationIdentityId: number;
  revisionStatus: string;
  validFrom: string;
  validTo: string | null;
  knownFrom: string;
  subjectEntityId: number;
  objectEntityId: number;
  predicate: string;
  relationKind: string;
  confidence: number;
};

export type SnapshotDegree = {
  entityId: number;
  totalDegree: number;
  degreeByPredicate: Record<string, number>;
  superhubFlag: boolean;
};

export type SnapshotPlanOptions = {
  asOf: string;
  knownAt: string;
  builderVersion: string;
  /** Entities whose total cross-predicate degree exceeds this are flagged. */
  superhubDegreeThreshold: number;
};

export type GraphSnapshotPlan = Readonly<{
  header: Readonly<{
    asOf: string;
    knownAt: string;
    builderVersion: string;
    snapshotDigest: string;
    edgeCount: number;
    entityCount: number;
  }>;
  edges: ReadonlyArray<Readonly<SnapshotEdgeInput>>;
  degrees: ReadonlyArray<Readonly<SnapshotDegree>>;
}>;

export type SnapshotQueryExecutor = {
  query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }>;
};

export const SNAPSHOT_EDGE_SELECTOR_SQL = `
SELECT
  revision.relation_revision_id AS "relationRevisionId",
  revision.relation_identity_id AS "relationIdentityId",
  revision.revision_status AS "revisionStatus",
  revision.valid_from AS "validFrom",
  revision.valid_to AS "validTo",
  revision.known_from AS "knownFrom",
  identity_row.subject_entity_id AS "subjectEntityId",
  identity_row.object_entity_id AS "objectEntityId",
  identity_row.predicate AS "predicate",
  revision.relation_kind AS "relationKind",
  revision.confidence AS "confidence"
FROM knowledge.relation_revision revision
JOIN knowledge.relation_identity identity_row
  ON identity_row.relation_identity_id = revision.relation_identity_id
WHERE revision.revision_status = 'accepted'
  AND revision.valid_from <= $1::timestamptz
  AND (revision.valid_to IS NULL OR revision.valid_to > $1::timestamptz)
  AND revision.known_from <= $2::timestamptz
  AND NOT EXISTS (
    SELECT 1
    FROM knowledge.relation_revision newer
    WHERE newer.relation_identity_id = revision.relation_identity_id
      AND newer.revision_no > revision.revision_no
      AND newer.revision_status = 'accepted'
      AND newer.valid_from <= $1::timestamptz
      AND (newer.valid_to IS NULL OR newer.valid_to > $1::timestamptz)
      AND newer.known_from <= $2::timestamptz
  )
ORDER BY revision.relation_revision_id
`;

function assertValidEdge(edgeInput: SnapshotEdgeInput): void {
  if (!Number.isSafeInteger(edgeInput.relationRevisionId) || edgeInput.relationRevisionId <= 0) {
    throw new Error('relationRevisionId must be a positive integer');
  }
  if (!Number.isSafeInteger(edgeInput.relationIdentityId) || edgeInput.relationIdentityId <= 0) {
    throw new Error('relationIdentityId must be a positive integer');
  }
  if (edgeInput.revisionStatus !== 'accepted') {
    throw new Error('graph snapshot edges must have accepted revision status');
  }

  const validFromMs = new Date(edgeInput.validFrom).getTime();
  const knownFromMs = new Date(edgeInput.knownFrom).getTime();
  if (Number.isNaN(validFromMs)) throw new Error('validFrom must be a valid timestamp');
  if (Number.isNaN(knownFromMs)) throw new Error('knownFrom must be a valid timestamp');
  if (edgeInput.validTo !== null) {
    const validToMs = new Date(edgeInput.validTo).getTime();
    if (Number.isNaN(validToMs)) throw new Error('validTo must be a valid timestamp');
    if (validToMs <= validFromMs) throw new Error('validTo must be after validFrom');
  }
  if (!Number.isSafeInteger(edgeInput.subjectEntityId) || edgeInput.subjectEntityId <= 0) {
    throw new Error('subjectEntityId must be a positive integer');
  }
  if (!Number.isSafeInteger(edgeInput.objectEntityId) || edgeInput.objectEntityId <= 0) {
    throw new Error('objectEntityId must be a positive integer');
  }
  if (
    !Number.isFinite(edgeInput.confidence) ||
    Object.is(edgeInput.confidence, -0) ||
    edgeInput.confidence < 0 ||
    edgeInput.confidence > 1
  ) {
    throw new Error('confidence must be within [0,1]');
  }
  if (!edgeInput.predicate.trim()) throw new Error('predicate is required');
  if (!RELATION_KINDS.has(edgeInput.relationKind)) {
    throw new Error('relationKind must be structural, inferred, or statistical');
  }
}

/** Canonical edge ordering: by relationRevisionId ascending. */
function sortEdges(edges: readonly SnapshotEdgeInput[]): SnapshotEdgeInput[] {
  return [...edges].sort((a, b) => a.relationRevisionId - b.relationRevisionId);
}

function canonicalFloat32(value: number): string {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeFloatBE(Math.fround(value), 0);
  return bytes.toString('hex');
}

export function computeSnapshotDigest(edges: readonly SnapshotEdgeInput[]): string {
  const seenRevisions = new Set<number>();
  const seenIdentities = new Set<number>();
  for (const edgeInput of edges) {
    assertValidEdge(edgeInput);
    if (seenRevisions.has(edgeInput.relationRevisionId)) {
      throw new Error(`duplicate relation revision in snapshot: ${edgeInput.relationRevisionId}`);
    }
    if (seenIdentities.has(edgeInput.relationIdentityId)) {
      throw new Error(`duplicate relation identity in snapshot: ${edgeInput.relationIdentityId}`);
    }
    seenRevisions.add(edgeInput.relationRevisionId);
    seenIdentities.add(edgeInput.relationIdentityId);
  }
  const canonicalLines = sortEdges(edges).map((row) =>
    [
      row.relationRevisionId,
      row.relationIdentityId,
      row.subjectEntityId,
      Buffer.from(row.predicate, 'utf8').toString('hex'),
      row.objectEntityId,
      Buffer.from(row.relationKind, 'utf8').toString('hex'),
      // Encode the exact DB REAL value: float64 input and its float32 readback
      // hash identically, while adjacent float32 values remain distinguishable.
      canonicalFloat32(row.confidence),
    ].join(':'),
  );
  return createHash('sha256').update(canonicalLines.join('\n')).digest('hex');
}

export function computeSnapshotDegrees(
  edges: readonly SnapshotEdgeInput[],
  options: { superhubDegreeThreshold: number },
): SnapshotDegree[] {
  if (
    !Number.isSafeInteger(options.superhubDegreeThreshold) ||
    options.superhubDegreeThreshold <= 0
  ) {
    throw new Error('superhubDegreeThreshold must be a positive integer');
  }
  const byEntity = new Map<number, Map<string, number>>();
  const bump = (entityId: number, predicate: string): void => {
    const counters = byEntity.get(entityId) ?? new Map<string, number>();
    counters.set(predicate, (counters.get(predicate) ?? 0) + 1);
    byEntity.set(entityId, counters);
  };
  for (const edgeInput of edges) {
    assertValidEdge(edgeInput);
    bump(edgeInput.subjectEntityId, edgeInput.predicate);
    bump(edgeInput.objectEntityId, edgeInput.predicate);
  }
  return [...byEntity.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([entityId, counters]) => {
      const degreeByPredicate = Object.create(null) as Record<string, number>;
      let totalDegree = 0;
      for (const predicate of [...counters.keys()].sort()) {
        const count = counters.get(predicate)!;
        degreeByPredicate[predicate] = count;
        totalDegree += count;
      }
      return {
        entityId,
        totalDegree,
        degreeByPredicate,
        superhubFlag: totalDegree > options.superhubDegreeThreshold,
      };
    });
}

function planVerifiedGraphSnapshot(
  edges: readonly SnapshotEdgeInput[],
  options: SnapshotPlanOptions,
): GraphSnapshotPlan {
  const asOfMs = new Date(options.asOf).getTime();
  if (Number.isNaN(asOfMs)) throw new Error('asOf must be a valid timestamp');
  const knownAtMs = new Date(options.knownAt).getTime();
  if (Number.isNaN(knownAtMs)) throw new Error('knownAt must be a valid timestamp');
  if (!options.builderVersion.trim()) throw new Error('builderVersion is required');

  const orderedEdges = Object.freeze(
    sortEdges(edges).map((edgeInput) => Object.freeze({ ...edgeInput })),
  );
  for (const edgeInput of orderedEdges) {
    assertValidEdge(edgeInput);
    if (new Date(edgeInput.knownFrom).getTime() > knownAtMs) {
      throw new Error('edge knownFrom must be at or before snapshot knownAt');
    }
    if (new Date(edgeInput.validFrom).getTime() > asOfMs) {
      throw new Error('edge validFrom must be at or before snapshot asOf');
    }
    if (edgeInput.validTo !== null && new Date(edgeInput.validTo).getTime() <= asOfMs) {
      throw new Error('edge validTo must be after snapshot asOf');
    }
  }

  const snapshotDigest = computeSnapshotDigest(orderedEdges);
  const degrees = Object.freeze(
    computeSnapshotDegrees(orderedEdges, {
      superhubDegreeThreshold: options.superhubDegreeThreshold,
    }).map((degree) =>
      Object.freeze({
        ...degree,
        degreeByPredicate: Object.freeze({ ...degree.degreeByPredicate }),
      }),
    ),
  );
  return Object.freeze({
    header: Object.freeze({
      asOf: options.asOf,
      knownAt: options.knownAt,
      builderVersion: options.builderVersion,
      snapshotDigest,
      edgeCount: orderedEdges.length,
      entityCount: degrees.length,
    }),
    edges: orderedEdges,
    degrees,
  });
}

type SnapshotEdgeDatabaseRow = Record<keyof SnapshotEdgeInput, unknown>;

function normalizeDatabaseEdge(row: SnapshotEdgeDatabaseRow): SnapshotEdgeInput {
  const positiveId = (value: unknown, label: string): number => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) {
      throw new Error(`${label} must be a positive integer`);
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${label} must be a positive integer`);
    }
    return parsed;
  };
  const timestamp = (value: unknown, label: string): string => {
    if (!(value instanceof Date) && typeof value !== 'string') {
      throw new Error(`${label} must be a valid timestamp`);
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
    return date.toISOString();
  };
  const text = (value: unknown, label: string): string => {
    if (typeof value !== 'string') throw new Error(`${label} must be text`);
    return value;
  };
  const confidence = (value: unknown): number => {
    if (
      typeof value !== 'number' &&
      (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))
    ) {
      throw new Error('confidence must be a finite canonical number');
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) throw new Error('confidence must be a finite canonical number');
    return parsed;
  };
  return {
    relationRevisionId: positiveId(row.relationRevisionId, 'relationRevisionId'),
    relationIdentityId: positiveId(row.relationIdentityId, 'relationIdentityId'),
    revisionStatus: text(row.revisionStatus, 'revisionStatus'),
    validFrom: timestamp(row.validFrom, 'validFrom'),
    validTo: row.validTo === null ? null : timestamp(row.validTo, 'validTo'),
    knownFrom: timestamp(row.knownFrom, 'knownFrom'),
    subjectEntityId: positiveId(row.subjectEntityId, 'subjectEntityId'),
    objectEntityId: positiveId(row.objectEntityId, 'objectEntityId'),
    predicate: text(row.predicate, 'predicate'),
    relationKind: text(row.relationKind, 'relationKind'),
    confidence: confidence(row.confidence),
  };
}

function canonicalCutoff(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be RFC3339 with an explicit offset or Z`);
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/i,
  );
  if (!match) throw new Error(`${label} must be RFC3339 with millisecond precision or less`);
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    ,
    offsetHour,
    offsetMinute,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (offsetHour !== undefined && Number(offsetHour) > 23) ||
    (offsetMinute !== undefined && Number(offsetMinute) > 59)
  ) {
    throw new Error(`${label} must be a valid RFC3339 calendar timestamp`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

export async function planGraphSnapshotFromDatabase(
  executor: SnapshotQueryExecutor,
  options: SnapshotPlanOptions,
): Promise<GraphSnapshotPlan> {
  const snapshotOptions = Object.freeze({
    asOf: canonicalCutoff(options.asOf, 'asOf'),
    knownAt: canonicalCutoff(options.knownAt, 'knownAt'),
    builderVersion: options.builderVersion,
    superhubDegreeThreshold: options.superhubDegreeThreshold,
  });

  const result = await executor.query<SnapshotEdgeDatabaseRow>(SNAPSHOT_EDGE_SELECTOR_SQL, [
    snapshotOptions.asOf,
    snapshotOptions.knownAt,
  ]);
  return planVerifiedGraphSnapshot(result.rows.map(normalizeDatabaseEdge), snapshotOptions);
}
