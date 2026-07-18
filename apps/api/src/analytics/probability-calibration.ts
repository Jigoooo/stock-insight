export type ProbabilityObservation = {
  probability: number;
  outcome: boolean;
};

export type CalibrationBin = {
  lower: number;
  upper: number;
  sample_n: number;
  avg_probability: number;
  event_rate: number;
};

export type ProbabilityMetrics = {
  sample_n: number;
  brier_score: number | null;
  log_loss: number | null;
  expected_calibration_error: number | null;
  calibration_bins: CalibrationBin[];
};

const EPSILON = 1e-6;

function round(value: number, places = 6): number {
  return Number(value.toFixed(places));
}

export function computeProbabilityMetrics(
  observations: ProbabilityObservation[],
  binCount = 10,
): ProbabilityMetrics {
  if (!Number.isInteger(binCount) || binCount < 2 || binCount > 100) {
    throw new Error('binCount must be an integer between 2 and 100');
  }
  for (const observation of observations) {
    if (!Number.isFinite(observation.probability) || observation.probability < 0 || observation.probability > 1) {
      throw new Error(`probability out of range: ${observation.probability}`);
    }
  }
  if (observations.length === 0) {
    return {
      sample_n: 0,
      brier_score: null,
      log_loss: null,
      expected_calibration_error: null,
      calibration_bins: [],
    };
  }

  let squaredError = 0;
  let logLoss = 0;
  const bins = Array.from({ length: binCount }, () => [] as ProbabilityObservation[]);
  for (const observation of observations) {
    const actual = observation.outcome ? 1 : 0;
    squaredError += (observation.probability - actual) ** 2;
    const bounded = Math.min(1 - EPSILON, Math.max(EPSILON, observation.probability));
    logLoss += -(actual * Math.log(bounded) + (1 - actual) * Math.log(1 - bounded));
    const index = Math.min(binCount - 1, Math.floor(observation.probability * binCount));
    bins[index]!.push(observation);
  }

  const calibrationBins: CalibrationBin[] = [];
  let ece = 0;
  for (let index = 0; index < bins.length; index += 1) {
    const rows = bins[index]!;
    if (rows.length === 0) continue;
    const avgProbability = rows.reduce((sum, row) => sum + row.probability, 0) / rows.length;
    const eventRate = rows.filter((row) => row.outcome).length / rows.length;
    ece += (rows.length / observations.length) * Math.abs(avgProbability - eventRate);
    calibrationBins.push({
      lower: round(index / binCount, 3),
      upper: round((index + 1) / binCount, 3),
      sample_n: rows.length,
      avg_probability: round(avgProbability),
      event_rate: round(eventRate),
    });
  }

  return {
    sample_n: observations.length,
    brier_score: round(squaredError / observations.length),
    log_loss: round(logLoss / observations.length),
    expected_calibration_error: round(ece),
    calibration_bins: calibrationBins,
  };
}

export type ExpandingForecast = {
  id: number;
  market: string;
  horizonDays: number;
  confidenceLabel: string;
  issuedAt: Date;
  knownAt: Date;
  targetHit: boolean;
};

export type ExpandingProbability = ExpandingForecast & {
  probability: number;
  priorSampleN: number;
};

/**
 * PIT-safe expanding-window baseline.
 * A forecast receives the hit rate of outcomes from the SAME segment whose
 * knownAt <= issuedAt. The current outcome and future outcomes are impossible
 * to see. No synthetic priors are added; groups with < minPriorN are omitted.
 */
export function expandingLabelProbabilities(
  forecasts: ExpandingForecast[],
  minPriorN = 30,
): ExpandingProbability[] {
  if (!Number.isInteger(minPriorN) || minPriorN < 1) throw new Error('minPriorN must be positive');
  const bySegment = new Map<string, ExpandingForecast[]>();
  const keyOf = (row: ExpandingForecast) => `${row.market}\0${row.horizonDays}\0${row.confidenceLabel}`;
  for (const row of forecasts) {
    const key = keyOf(row);
    const values = bySegment.get(key) ?? [];
    values.push(row);
    bySegment.set(key, values);
  }

  const output: ExpandingProbability[] = [];
  for (const rows of bySegment.values()) {
    const known = [...rows].sort((a, b) => a.knownAt.getTime() - b.knownAt.getTime());
    const issued = [...rows].sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
    let cursor = 0;
    let priorN = 0;
    let priorHits = 0;
    for (const row of issued) {
      while (cursor < known.length && known[cursor]!.knownAt.getTime() <= row.issuedAt.getTime()) {
        const prior = known[cursor]!;
        // Defensive self-exclusion if an invalid source has knownAt <= its own issuedAt.
        if (prior.id !== row.id) {
          priorN += 1;
          if (prior.targetHit) priorHits += 1;
        }
        cursor += 1;
      }
      if (priorN >= minPriorN) {
        output.push({ ...row, probability: priorHits / priorN, priorSampleN: priorN });
      }
    }
  }
  return output;
}
