export type GraphRankingMethod = 'pathsim' | 'nbfnet' | 'hgt' | 'tgn';

export type GraphCandidateRankingResult =
  | Readonly<{
      status: 'ok';
      method: GraphRankingMethod;
      graphSnapshotId: number;
      dataCutoff: string;
      modelArtifactDigest: string | null;
      candidates: readonly Readonly<{
        targetEntityId: number;
        score: number;
        rank: number;
      }>[];
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_GRAPH_RANKING_INPUT';
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: GraphCandidateRankingResult = {
  status: 'abstained',
  reason: 'INVALID_GRAPH_RANKING_INPUT',
  candidateOnly: true,
  acceptedFactAllowed: false,
  orderExecutable: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseUtcTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  try {
    return new Date(parsed).toISOString() === value ? parsed : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function rankGraphCandidates(input: unknown): GraphCandidateRankingResult {
  try {
    const record = asRecord(input);
    if (record === null) return abstained;
    const method = record.method;
    const dataCutoffMs = parseUtcTimestamp(record.dataCutoff);
    if (
      !isPositiveId(record.graphSnapshotId) ||
      !isPositiveId(record.seedEntityId) ||
      !Number.isFinite(dataCutoffMs) ||
      !Number.isSafeInteger(record.maxCandidates) ||
      (record.maxCandidates as number) < 1 ||
      (record.maxCandidates as number) > 1_000 ||
      !['pathsim', 'nbfnet', 'hgt', 'tgn'].includes(method as string) ||
      !Array.isArray(record.candidates) ||
      record.candidates.length > 10_000
    ) {
      return abstained;
    }

    const candidates: Array<{ targetEntityId: number; score: number }> = [];
    const targetIds = new Set<number>();
    for (const value of record.candidates) {
      const candidate = asRecord(value);
      if (
        candidate === null ||
        !isPositiveId(candidate.targetEntityId) ||
        candidate.targetEntityId === record.seedEntityId ||
        targetIds.has(candidate.targetEntityId)
      ) {
        return abstained;
      }
      targetIds.add(candidate.targetEntityId);

      let score: number;
      if (method === 'pathsim') {
        if (
          !isNonnegativeInteger(candidate.crossPathCount) ||
          !isNonnegativeInteger(candidate.seedSelfPathCount) ||
          !isNonnegativeInteger(candidate.targetSelfPathCount)
        ) {
          return abstained;
        }
        const denominator = candidate.seedSelfPathCount + candidate.targetSelfPathCount;
        score = denominator === 0 ? 0 : (2 * candidate.crossPathCount) / denominator;
        if (!isProbability(score)) return abstained;
      } else {
        if (!isProbability(candidate.score)) return abstained;
        score = candidate.score;
      }
      candidates.push({ targetEntityId: candidate.targetEntityId, score });
    }

    let modelArtifactDigest: string | null = null;
    if (method !== 'pathsim') {
      const artifact = asRecord(record.modelArtifact);
      if (
        artifact === null ||
        typeof artifact.modelVersion !== 'string' ||
        artifact.modelVersion.trim().length === 0 ||
        !isDigest(artifact.modelArtifactDigest) ||
        !isDigest(artifact.featureSnapshotDigest) ||
        !Number.isFinite(parseUtcTimestamp(artifact.trainedCutoff)) ||
        parseUtcTimestamp(artifact.trainedCutoff) > dataCutoffMs
      ) {
        return abstained;
      }
      modelArtifactDigest = artifact.modelArtifactDigest;
    }

    const ranked = candidates
      .sort((left, right) => right.score - left.score || left.targetEntityId - right.targetEntityId)
      .slice(0, record.maxCandidates as number)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

    return {
      status: 'ok',
      method: method as GraphRankingMethod,
      graphSnapshotId: record.graphSnapshotId,
      dataCutoff: record.dataCutoff as string,
      modelArtifactDigest,
      candidates: ranked,
      candidateOnly: true,
      acceptedFactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
