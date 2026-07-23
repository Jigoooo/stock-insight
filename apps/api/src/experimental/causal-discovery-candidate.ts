export type CausalDiscoveryCandidateResult =
  | Readonly<{
      status: 'ok';
      method: 'pcmci_plus';
      dataCutoff: string;
      modelVersion: string;
      candidates: readonly Readonly<{
        causeEntityId: number;
        effectEntityId: number;
        lag: number;
        association: number;
        adjustedPValue: number;
        stability: number;
        score: number;
        rank: number;
      }>[];
      claimClass: 'statistical_association';
      causalLanguageAllowed: false;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_CAUSAL_DISCOVERY_INPUT';
      claimClass: 'statistical_association';
      causalLanguageAllowed: false;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: CausalDiscoveryCandidateResult = {
  status: 'abstained',
  reason: 'INVALID_CAUSAL_DISCOVERY_INPUT',
  claimClass: 'statistical_association',
  causalLanguageAllowed: false,
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

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
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

export function compileCausalDiscoveryCandidates(input: unknown): CausalDiscoveryCandidateResult {
  try {
    const record = asRecord(input);
    if (record === null) return abstained;
    const diagnostics = asRecord(record.diagnostics);
    const artifact = asRecord(record.artifact);
    const cutoff = parseUtcTimestamp(record.dataCutoff);
    const analyzedCutoff = parseUtcTimestamp(artifact?.analyzedCutoff);
    if (
      record.method !== 'pcmci_plus' ||
      !Number.isFinite(cutoff) ||
      !Number.isSafeInteger(record.sampleSize) ||
      (record.sampleSize as number) < 50 ||
      (record.sampleSize as number) > 10_000_000 ||
      !Number.isSafeInteger(record.maxLag) ||
      (record.maxLag as number) < 1 ||
      (record.maxLag as number) > 100 ||
      typeof record.alpha !== 'number' ||
      !Number.isFinite(record.alpha) ||
      record.alpha <= 0 ||
      record.alpha >= 0.5 ||
      !isProbability(record.minimumStability) ||
      diagnostics === null ||
      diagnostics.noLookahead !== true ||
      diagnostics.stationarityChecked !== true ||
      diagnostics.multipleTestingCorrection !== 'fdr_bh' ||
      !isProbability(diagnostics.missingnessRate) ||
      diagnostics.missingnessRate > 0.2 ||
      artifact === null ||
      typeof artifact.modelVersion !== 'string' ||
      artifact.modelVersion.trim().length === 0 ||
      !isDigest(artifact.programDigest) ||
      !isDigest(artifact.inputSnapshotDigest) ||
      !Number.isFinite(analyzedCutoff) ||
      analyzedCutoff > cutoff ||
      !Array.isArray(record.candidates) ||
      record.candidates.length > 100_000
    ) {
      return abstained;
    }

    const keys = new Set<string>();
    const candidates: Array<{
      causeEntityId: number;
      effectEntityId: number;
      lag: number;
      association: number;
      adjustedPValue: number;
      stability: number;
      score: number;
    }> = [];
    for (const value of record.candidates) {
      const candidate = asRecord(value);
      if (
        candidate === null ||
        !isPositiveId(candidate.causeEntityId) ||
        !isPositiveId(candidate.effectEntityId) ||
        candidate.causeEntityId === candidate.effectEntityId ||
        !Number.isSafeInteger(candidate.lag) ||
        (candidate.lag as number) < 1 ||
        (candidate.lag as number) > (record.maxLag as number) ||
        typeof candidate.association !== 'number' ||
        !Number.isFinite(candidate.association) ||
        Math.abs(candidate.association) > 1 ||
        !isProbability(candidate.adjustedPValue) ||
        !isProbability(candidate.stability)
      ) {
        return abstained;
      }
      const key = `${candidate.causeEntityId}:${candidate.effectEntityId}:${candidate.lag}`;
      if (keys.has(key)) return abstained;
      keys.add(key);
      if (
        candidate.adjustedPValue > (record.alpha as number) ||
        candidate.stability < (record.minimumStability as number)
      ) {
        continue;
      }
      const score =
        Math.abs(candidate.association) * candidate.stability * (1 - candidate.adjustedPValue);
      if (!isProbability(score)) return abstained;
      candidates.push({
        causeEntityId: candidate.causeEntityId,
        effectEntityId: candidate.effectEntityId,
        lag: candidate.lag as number,
        association: candidate.association,
        adjustedPValue: candidate.adjustedPValue,
        stability: candidate.stability,
        score,
      });
    }

    const ranked = candidates
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.causeEntityId - right.causeEntityId ||
          left.effectEntityId - right.effectEntityId ||
          left.lag - right.lag,
      )
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

    return {
      status: 'ok',
      method: 'pcmci_plus',
      dataCutoff: record.dataCutoff as string,
      modelVersion: artifact.modelVersion as string,
      candidates: ranked,
      claimClass: 'statistical_association',
      causalLanguageAllowed: false,
      candidateOnly: true,
      acceptedFactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
