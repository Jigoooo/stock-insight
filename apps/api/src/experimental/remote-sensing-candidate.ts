export type RemoteSensingFacilityKind =
  | 'factory'
  | 'warehouse'
  | 'port'
  | 'power_plant'
  | 'mine'
  | 'data_center'
  | 'other';

export type RemoteSensingCandidateResult =
  | Readonly<{
      status: 'ok';
      providerId: string;
      sceneId: string;
      capturedAt: string;
      knownAt: string;
      rawArtifactDigest: string;
      modelArtifactDigest: string;
      candidates: readonly Readonly<{
        detectionKey: string;
        facilityKind: RemoteSensingFacilityKind;
        longitude: number;
        latitude: number;
        areaSquareMeters: number;
        confidence: number;
        rank: number;
        reviewStatus: 'pending_human_review';
      }>[];
      humanReviewRequired: true;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_REMOTE_SENSING_INPUT';
      humanReviewRequired: true;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: RemoteSensingCandidateResult = {
  status: 'abstained',
  reason: 'INVALID_REMOTE_SENSING_INPUT',
  humanReviewRequired: true,
  candidateOnly: true,
  acceptedFactAllowed: false,
  orderExecutable: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function probability(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function nonempty(value: unknown, maximumLength = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength;
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

const facilityKinds = new Set([
  'factory',
  'warehouse',
  'port',
  'power_plant',
  'mine',
  'data_center',
  'other',
]);

export function compileFacilityCandidates(input: unknown): RemoteSensingCandidateResult {
  try {
    const record = asRecord(input);
    const imagery = asRecord(record?.imagery);
    const license = asRecord(imagery?.license);
    const model = asRecord(record?.model);
    const policy = asRecord(record?.policy);
    const capturedAt = parseUtcTimestamp(imagery?.capturedAt);
    const knownAt = parseUtcTimestamp(imagery?.knownAt);
    const trainedCutoff = parseUtcTimestamp(model?.trainedCutoff);
    if (
      record === null ||
      imagery === null ||
      !nonempty(imagery.providerId) ||
      !nonempty(imagery.sceneId) ||
      !Number.isFinite(capturedAt) ||
      !Number.isFinite(knownAt) ||
      knownAt < capturedAt ||
      imagery.crs !== 'EPSG:4326' ||
      !probability(imagery.cloudCover) ||
      !finite(imagery.groundSampleDistanceMeters) ||
      imagery.groundSampleDistanceMeters <= 0 ||
      !digest(imagery.rawArtifactDigest) ||
      license === null ||
      license.status !== 'approved_research' ||
      license.retentionAllowed !== true ||
      typeof license.redistributionAllowed !== 'boolean' ||
      model === null ||
      !nonempty(model.modelVersion) ||
      !digest(model.modelArtifactDigest) ||
      !Number.isFinite(trainedCutoff) ||
      trainedCutoff > capturedAt ||
      policy === null ||
      !probability(policy.minimumConfidence) ||
      !probability(policy.maximumCloudCover) ||
      !finite(policy.maximumGroundSampleDistanceMeters) ||
      policy.maximumGroundSampleDistanceMeters <= 0 ||
      !Number.isSafeInteger(policy.maximumCandidates) ||
      (policy.maximumCandidates as number) < 1 ||
      (policy.maximumCandidates as number) > 10_000 ||
      imagery.cloudCover > policy.maximumCloudCover ||
      imagery.groundSampleDistanceMeters > policy.maximumGroundSampleDistanceMeters ||
      !Array.isArray(record.detections) ||
      record.detections.length > 100_000
    ) {
      return abstained;
    }

    const keys = new Set<string>();
    const candidates: Array<{
      detectionKey: string;
      facilityKind: RemoteSensingFacilityKind;
      longitude: number;
      latitude: number;
      areaSquareMeters: number;
      confidence: number;
    }> = [];
    for (const value of record.detections) {
      const detection = asRecord(value);
      if (
        detection === null ||
        !nonempty(detection.detectionKey) ||
        keys.has(detection.detectionKey) ||
        typeof detection.facilityKind !== 'string' ||
        !facilityKinds.has(detection.facilityKind) ||
        !finite(detection.longitude) ||
        detection.longitude < -180 ||
        detection.longitude > 180 ||
        !finite(detection.latitude) ||
        detection.latitude < -90 ||
        detection.latitude > 90 ||
        !finite(detection.areaSquareMeters) ||
        detection.areaSquareMeters <= 0 ||
        detection.areaSquareMeters > 10_000_000_000 ||
        !probability(detection.confidence)
      ) {
        return abstained;
      }
      keys.add(detection.detectionKey);
      if (detection.confidence < policy.minimumConfidence) continue;
      candidates.push({
        detectionKey: detection.detectionKey,
        facilityKind: detection.facilityKind as RemoteSensingFacilityKind,
        longitude: detection.longitude,
        latitude: detection.latitude,
        areaSquareMeters: detection.areaSquareMeters,
        confidence: detection.confidence,
      });
    }

    const ranked = candidates
      .sort(
        (left, right) =>
          right.confidence - left.confidence || left.detectionKey.localeCompare(right.detectionKey),
      )
      .slice(0, policy.maximumCandidates as number)
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
        reviewStatus: 'pending_human_review' as const,
      }));

    return {
      status: 'ok',
      providerId: imagery.providerId,
      sceneId: imagery.sceneId,
      capturedAt: imagery.capturedAt as string,
      knownAt: imagery.knownAt as string,
      rawArtifactDigest: imagery.rawArtifactDigest,
      modelArtifactDigest: model.modelArtifactDigest,
      candidates: ranked,
      humanReviewRequired: true,
      candidateOnly: true,
      acceptedFactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
