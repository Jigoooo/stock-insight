import { parseCanonicalCryptoKey } from '@stock-insight/contracts/crypto-research';

export type CryptoCoreRelationKind =
  | 'issued_by_company'
  | 'treasury_held_by_company'
  | 'reserve_managed_by_company'
  | 'operated_by_company'
  | 'mined_by_company'
  | 'custodied_by_company'
  | 'revenue_exposure_company'
  | 'cost_exposure_company'
  | 'payment_distribution_company'
  | 'etf_underlying_exposure';

export type CryptoCoreRelationResult =
  | Readonly<{
      status: 'ok';
      relationKey: string;
      cryptoEntityKey: string;
      coreEntityKey: string;
      relationKind: CryptoCoreRelationKind;
      relationState: 'proposed' | 'verified' | 'rejected' | 'superseded';
      economicMagnitude: number | null;
      economicMagnitudeUnit: string | null;
      epistemicConfidence: number | null;
      sourceRevisionId: number;
      evidenceDigest: string;
      availableAt: string;
      knownAt: string;
      readOnly: true;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_CRYPTO_CORE_RELATION';
      readOnly: true;
      orderExecutable: false;
    }>;

const abstained: CryptoCoreRelationResult = {
  status: 'abstained',
  reason: 'INVALID_CRYPTO_CORE_RELATION',
  readOnly: true,
  orderExecutable: false,
};

const relationKinds = new Set<CryptoCoreRelationKind>([
  'issued_by_company',
  'treasury_held_by_company',
  'reserve_managed_by_company',
  'operated_by_company',
  'mined_by_company',
  'custodied_by_company',
  'revenue_exposure_company',
  'cost_exposure_company',
  'payment_distribution_company',
  'etf_underlying_exposure',
]);
const relationStates = new Set(['proposed', 'verified', 'rejected', 'superseded']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

export function compileCryptoCoreRelation(input: unknown): CryptoCoreRelationResult {
  try {
    const record = asRecord(input);
    const availableAt = parseUtcTimestamp(record?.availableAt);
    const knownAt = parseUtcTimestamp(record?.knownAt);
    const magnitude = record?.economicMagnitude;
    const unit = record?.economicMagnitudeUnit;
    const confidence = record?.epistemicConfidence;
    if (
      record === null ||
      typeof record.cryptoEntityKey !== 'string' ||
      parseCanonicalCryptoKey(record.cryptoEntityKey) === null ||
      typeof record.coreEntityKey !== 'string' ||
      !/^(?:COMPANY|STOCK|ETF|FUND|LEGAL_ENTITY):[A-Z0-9._-]+:[A-Z0-9._:-]+$/.test(
        record.coreEntityKey,
      ) ||
      typeof record.relationKind !== 'string' ||
      !relationKinds.has(record.relationKind as CryptoCoreRelationKind) ||
      typeof record.relationState !== 'string' ||
      !relationStates.has(record.relationState) ||
      !Number.isSafeInteger(record.sourceRevisionId) ||
      (record.sourceRevisionId as number) <= 0 ||
      typeof record.evidenceDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.evidenceDigest) ||
      !Number.isFinite(availableAt) ||
      !Number.isFinite(knownAt) ||
      knownAt < availableAt ||
      record.confidenceWeightedMagnitude !== undefined ||
      !(
        (magnitude === null && unit === null) ||
        (typeof magnitude === 'number' &&
          Number.isFinite(magnitude) &&
          magnitude >= 0 &&
          typeof unit === 'string' &&
          /^[A-Z0-9._-]{1,32}$/.test(unit))
      ) ||
      !(
        confidence === null ||
        (typeof confidence === 'number' &&
          Number.isFinite(confidence) &&
          confidence >= 0 &&
          confidence <= 1)
      ) ||
      (record.relationState === 'verified' &&
        (typeof record.reviewerId !== 'string' ||
          record.reviewerId.trim().length === 0 ||
          confidence === null))
    ) {
      return abstained;
    }
    return {
      status: 'ok',
      relationKey: `cross:crypto-core:${record.relationKind}:${record.cryptoEntityKey}:${record.coreEntityKey}`,
      cryptoEntityKey: record.cryptoEntityKey,
      coreEntityKey: record.coreEntityKey,
      relationKind: record.relationKind as CryptoCoreRelationKind,
      relationState: record.relationState as 'proposed' | 'verified' | 'rejected' | 'superseded',
      economicMagnitude: magnitude as number | null,
      economicMagnitudeUnit: unit as string | null,
      epistemicConfidence: confidence as number | null,
      sourceRevisionId: record.sourceRevisionId as number,
      evidenceDigest: record.evidenceDigest,
      availableAt: record.availableAt as string,
      knownAt: record.knownAt as string,
      readOnly: true,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
