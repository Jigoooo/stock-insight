export type TokenUnlockEvaluationResult =
  | Readonly<{
      status: 'ok';
      tokenEntityKey: string;
      unlockAt: string;
      coefficients: Readonly<{
        unlockAmount: number;
        circulatingSupply: number;
        totalSupply: number;
        percentageOfTotalSupply: number;
        amountUnit: string;
      }>;
      unlockToCirculatingRatio: number;
      unlockToTotalRatio: number;
      priceImpactClaimAllowed: false;
      readOnly: true;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_TOKEN_UNLOCK_INPUT';
      priceImpactClaimAllowed: false;
      readOnly: true;
      orderExecutable: false;
    }>;

const abstained: TokenUnlockEvaluationResult = {
  status: 'abstained',
  reason: 'INVALID_TOKEN_UNLOCK_INPUT',
  priceImpactClaimAllowed: false,
  readOnly: true,
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

export function evaluateTokenUnlock(input: unknown): TokenUnlockEvaluationResult {
  try {
    const record = asRecord(input);
    const unlockAt = parseUtcTimestamp(record?.unlockAt);
    const availableAt = parseUtcTimestamp(record?.availableAt);
    const knownAt = parseUtcTimestamp(record?.knownAt);
    if (
      record === null ||
      typeof record.tokenEntityKey !== 'string' ||
      !/^crypto:(?:token|stablecoin):/.test(record.tokenEntityKey) ||
      typeof record.amountUnit !== 'string' ||
      !/^[A-Z0-9._-]{1,32}$/.test(record.amountUnit) ||
      !finite(record.unlockAmount) ||
      record.unlockAmount <= 0 ||
      !finite(record.circulatingSupply) ||
      record.circulatingSupply <= 0 ||
      !finite(record.totalSupply) ||
      record.totalSupply <= 0 ||
      record.circulatingSupply > record.totalSupply ||
      record.unlockAmount > record.totalSupply ||
      !finite(record.percentageOfTotalSupply) ||
      record.percentageOfTotalSupply <= 0 ||
      record.percentageOfTotalSupply > 1 ||
      !Number.isFinite(unlockAt) ||
      !Number.isFinite(availableAt) ||
      !Number.isFinite(knownAt) ||
      knownAt < availableAt
    ) {
      return abstained;
    }
    const unlockToTotalRatio = record.unlockAmount / record.totalSupply;
    const unlockToCirculatingRatio = record.unlockAmount / record.circulatingSupply;
    const tolerance = Math.max(1e-12, Math.abs(unlockToTotalRatio) * 1e-9);
    if (
      !Number.isFinite(unlockToTotalRatio) ||
      !Number.isFinite(unlockToCirculatingRatio) ||
      Math.abs(unlockToTotalRatio - record.percentageOfTotalSupply) > tolerance
    ) {
      return abstained;
    }
    return {
      status: 'ok',
      tokenEntityKey: record.tokenEntityKey,
      unlockAt: record.unlockAt as string,
      coefficients: {
        unlockAmount: record.unlockAmount,
        circulatingSupply: record.circulatingSupply,
        totalSupply: record.totalSupply,
        percentageOfTotalSupply: record.percentageOfTotalSupply,
        amountUnit: record.amountUnit,
      },
      unlockToCirculatingRatio,
      unlockToTotalRatio,
      priceImpactClaimAllowed: false,
      readOnly: true,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
