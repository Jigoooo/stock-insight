export type SequentialConformalResult =
  | Readonly<{
      status: 'ok';
      targetCoverage: number;
      intervals: readonly Readonly<{
        forecastKey: string;
        issuedAt: string;
        lower: number;
        upper: number;
        quantile: number;
        calibrationSize: number;
        covered: boolean | null;
      }>[];
      coverage: Readonly<{
        maturedDue: number;
        finalObserved: number;
        missingOutcome: number;
        covered: number;
        rate: number | null;
      }>;
      finalMiscoverageLevel: number;
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_SEQUENTIAL_CONFORMAL_INPUT';
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: SequentialConformalResult = {
  status: 'abstained',
  reason: 'INVALID_SEQUENTIAL_CONFORMAL_INPUT',
  candidateOnly: true,
  acceptedFactAllowed: false,
  orderExecutable: false,
};

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

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function conformalQuantile(residuals: readonly number[], alpha: number): number {
  const sorted = [...residuals].sort((left, right) => left - right);
  const rank = Math.ceil((sorted.length + 1) * (1 - alpha));
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? Number.NaN;
}

export function runSequentialConformal(input: unknown): SequentialConformalResult {
  try {
    const record = asRecord(input);
    if (record === null) return abstained;
    if (
      !finiteNumber(record.targetCoverage) ||
      record.targetCoverage <= 0 ||
      record.targetCoverage >= 1 ||
      !finiteNumber(record.adaptationRate) ||
      record.adaptationRate <= 0 ||
      record.adaptationRate > 0.5 ||
      !Number.isSafeInteger(record.minimumCalibrationSize) ||
      (record.minimumCalibrationSize as number) < 10 ||
      (record.minimumCalibrationSize as number) > 100_000 ||
      !Array.isArray(record.calibration) ||
      record.calibration.length > 1_000_000 ||
      !Array.isArray(record.forecasts) ||
      record.forecasts.length > 1_000_000
    ) {
      return abstained;
    }

    const calibration: Array<{ absoluteResidual: number; knownAt: number }> = [];
    for (const value of record.calibration) {
      const residual = asRecord(value);
      const knownAt = parseUtcTimestamp(residual?.knownAt);
      if (
        residual === null ||
        !finiteNumber(residual.absoluteResidual) ||
        residual.absoluteResidual < 0 ||
        !Number.isFinite(knownAt)
      ) {
        return abstained;
      }
      calibration.push({ absoluteResidual: residual.absoluteResidual, knownAt });
    }

    const keys = new Set<string>();
    const forecasts: Array<{
      forecastKey: string;
      issuedAtText: string;
      issuedAt: number;
      maturityAt: number;
      pointForecast: number;
      observedValue: number | null;
      outcomeKnownAt: number | null;
    }> = [];
    for (const value of record.forecasts) {
      const forecast = asRecord(value);
      if (forecast === null || typeof forecast.forecastKey !== 'string') return abstained;
      const forecastKey = forecast.forecastKey.trim();
      const issuedAt = parseUtcTimestamp(forecast.issuedAt);
      const maturityAt = parseUtcTimestamp(forecast.maturityAt);
      const hasOutcome = forecast.observedValue !== null && forecast.observedValue !== undefined;
      const outcomeKnownAt = hasOutcome ? parseUtcTimestamp(forecast.outcomeKnownAt) : null;
      if (
        forecastKey.length === 0 ||
        keys.has(forecastKey) ||
        !Number.isFinite(issuedAt) ||
        !Number.isFinite(maturityAt) ||
        maturityAt <= issuedAt ||
        !finiteNumber(forecast.pointForecast) ||
        (hasOutcome &&
          (!finiteNumber(forecast.observedValue) ||
            outcomeKnownAt === null ||
            !Number.isFinite(outcomeKnownAt) ||
            outcomeKnownAt < maturityAt)) ||
        (!hasOutcome && forecast.outcomeKnownAt !== null && forecast.outcomeKnownAt !== undefined)
      ) {
        return abstained;
      }
      keys.add(forecastKey);
      forecasts.push({
        forecastKey,
        issuedAtText: forecast.issuedAt as string,
        issuedAt,
        maturityAt,
        pointForecast: forecast.pointForecast,
        observedValue: hasOutcome ? (forecast.observedValue as number) : null,
        outcomeKnownAt,
      });
    }
    forecasts.sort(
      (left, right) =>
        left.issuedAt - right.issuedAt || left.forecastKey.localeCompare(right.forecastKey),
    );

    let alpha = 1 - record.targetCoverage;
    const resolvedResiduals: Array<{ absoluteResidual: number; knownAt: number }> = [
      ...calibration,
    ];
    const intervals: Array<{
      forecastKey: string;
      issuedAt: string;
      lower: number;
      upper: number;
      quantile: number;
      calibrationSize: number;
      covered: boolean | null;
    }> = [];
    let finalObserved = 0;
    let missingOutcome = 0;
    let coveredCount = 0;

    for (const forecast of forecasts) {
      const availableResiduals = resolvedResiduals
        .filter(({ knownAt }) => knownAt <= forecast.issuedAt)
        .map(({ absoluteResidual }) => absoluteResidual);
      if (availableResiduals.length < (record.minimumCalibrationSize as number)) return abstained;
      const quantile = conformalQuantile(availableResiduals, alpha);
      const lower = forecast.pointForecast - quantile;
      const upper = forecast.pointForecast + quantile;
      if (![quantile, lower, upper].every(Number.isFinite)) return abstained;
      const covered =
        forecast.observedValue === null
          ? null
          : forecast.observedValue >= lower && forecast.observedValue <= upper;
      intervals.push({
        forecastKey: forecast.forecastKey,
        issuedAt: forecast.issuedAtText,
        lower,
        upper,
        quantile,
        calibrationSize: availableResiduals.length,
        covered,
      });
      if (forecast.observedValue === null || forecast.outcomeKnownAt === null) {
        missingOutcome += 1;
        continue;
      }
      finalObserved += 1;
      if (covered) coveredCount += 1;
      resolvedResiduals.push({
        absoluteResidual: Math.abs(forecast.observedValue - forecast.pointForecast),
        knownAt: forecast.outcomeKnownAt,
      });
      alpha = Math.min(
        0.99,
        Math.max(
          0.001,
          alpha +
            (record.adaptationRate as number) *
              (1 - (record.targetCoverage as number) - (covered ? 0 : 1)),
        ),
      );
    }

    return {
      status: 'ok',
      targetCoverage: record.targetCoverage,
      intervals,
      coverage: {
        maturedDue: forecasts.length,
        finalObserved,
        missingOutcome,
        covered: coveredCount,
        rate: finalObserved === 0 ? null : coveredCount / finalObserved,
      },
      finalMiscoverageLevel: alpha,
      candidateOnly: true,
      acceptedFactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
