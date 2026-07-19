// B7 — market validation measurement planner (master plan §4.6, §8 B7).
// FEVD / correlation / partial correlation / lead-lag / event-study results
// VALIDATE or WEIGHT structural relations; they never create canonical edges.
// PIT: a window may not extend beyond asOf (no lookahead), and every value
// must bind the exact model configuration that produced it. Event studies
// must pre-specify their event/estimation windows and benchmark.

export const MEASUREMENT_KINDS = [
  'correlation',
  'partial_correlation',
  'lead_lag',
  'fevd',
  'event_study',
] as const;

export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export type RelationMeasurementInput = {
  subjectEntityId: number;
  objectEntityId: number;
  measurementKind: MeasurementKind;
  windowStart: string;
  windowEnd: string;
  value: number;
  modelConfig: Record<string, unknown> | null;
  inputWatermark: Record<string, unknown>;
};

export type AcceptedMeasurement = {
  subjectEntityId: number;
  objectEntityId: number;
  measurementKind: MeasurementKind;
  windowStart: string;
  windowEnd: string;
  value: number;
  modelConfig: Record<string, unknown>;
  inputWatermark: Record<string, unknown>;
};

export type RejectedMeasurement = {
  input: RelationMeasurementInput;
  reason:
    | 'window_exceeds_as_of'
    | 'invalid_window'
    | 'missing_model_config'
    | 'event_study_missing_prespecified_window';
};

export type MeasurementPlan = {
  accepted: AcceptedMeasurement[];
  rejected: RejectedMeasurement[];
};

export function planRelationMeasurements(
  inputs: readonly RelationMeasurementInput[],
  options: { asOf: string },
): MeasurementPlan {
  const asOfMs = new Date(options.asOf).getTime();
  if (Number.isNaN(asOfMs)) throw new Error('asOf must be a valid timestamp');

  const accepted: AcceptedMeasurement[] = [];
  const rejected: RejectedMeasurement[] = [];

  for (const input of inputs) {
    if (!MEASUREMENT_KINDS.includes(input.measurementKind)) {
      throw new Error(`unknown measurementKind: ${input.measurementKind}`);
    }
    if (!Number.isFinite(input.value)) throw new Error('value must be finite');

    const startMs = new Date(input.windowStart).getTime();
    const endMs = new Date(input.windowEnd).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      rejected.push({ input, reason: 'invalid_window' });
      continue;
    }
    // PIT: no lookahead beyond the analysis cutoff.
    if (endMs > asOfMs) {
      rejected.push({ input, reason: 'window_exceeds_as_of' });
      continue;
    }
    if (input.modelConfig === null || Object.keys(input.modelConfig).length === 0) {
      rejected.push({ input, reason: 'missing_model_config' });
      continue;
    }
    if (input.measurementKind === 'event_study') {
      const config = input.modelConfig;
      const isBoundedNumericWindow = (value: unknown, label: 'event' | 'estimation'): boolean => {
        if (!Array.isArray(value) || value.length !== 2) return false;
        const [start, end] = value;
        if (typeof start !== 'number' || typeof end !== 'number') return false;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return false;
        // Event-time offsets are relative days around the event; an event
        // window ending after the analysis cutoff would be caught by the
        // absolute windowEnd gate above, but the ESTIMATION window must also
        // strictly precede the event (no in-window contamination).
        if (label === 'estimation' && end > 0) return false;
        return true;
      };
      const hasPrespecifiedDesign =
        isBoundedNumericWindow(config['eventWindow'], 'event') &&
        isBoundedNumericWindow(config['estimationWindow'], 'estimation') &&
        typeof config['benchmark'] === 'string' &&
        (config['benchmark'] as string).trim().length > 0;
      if (!hasPrespecifiedDesign) {
        rejected.push({ input, reason: 'event_study_missing_prespecified_window' });
        continue;
      }
    }

    accepted.push({
      subjectEntityId: input.subjectEntityId,
      objectEntityId: input.objectEntityId,
      measurementKind: input.measurementKind,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      value: input.value,
      modelConfig: input.modelConfig,
      inputWatermark: input.inputWatermark,
    });
  }

  return { accepted, rejected };
}
