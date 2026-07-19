import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planRelationMeasurements } from '../src/analytics/relation-measurement.ts';

const AS_OF = '2026-07-19T00:00:00.000Z';

const measurement = (overrides: Record<string, unknown> = {}) => ({
  subjectEntityId: 1,
  objectEntityId: 2,
  measurementKind: 'correlation' as const,
  windowStart: '2026-06-01T00:00:00.000Z',
  windowEnd: '2026-07-01T00:00:00.000Z',
  value: 0.42,
  modelConfig: { estimator: 'pearson', minObservations: 20 },
  inputWatermark: { pricesThrough: '2026-07-01T00:00:00.000Z' },
  ...overrides,
});

describe('B7 market validation measurements — PIT and non-structural contract', () => {
  it('accepts a window fully before asOf with bound model config', () => {
    const { accepted, rejected } = planRelationMeasurements([measurement()], { asOf: AS_OF });
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 0);
    assert.deepEqual(accepted[0]!.modelConfig, { estimator: 'pearson', minObservations: 20 });
  });

  it('rejects a window that extends beyond asOf (lookahead)', () => {
    const { accepted, rejected } = planRelationMeasurements(
      [measurement({ windowEnd: '2026-08-01T00:00:00.000Z' })],
      { asOf: AS_OF },
    );
    assert.equal(accepted.length, 0);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]!.reason, 'window_exceeds_as_of');
  });

  it('rejects a measurement without model config (no unexplained numbers)', () => {
    const { rejected } = planRelationMeasurements([measurement({ modelConfig: null })], {
      asOf: AS_OF,
    });
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]!.reason, 'missing_model_config');
  });

  it('rejects inverted or degenerate windows', () => {
    const { rejected } = planRelationMeasurements(
      [
        measurement({
          windowStart: '2026-07-01T00:00:00.000Z',
          windowEnd: '2026-06-01T00:00:00.000Z',
        }),
      ],
      { asOf: AS_OF },
    );
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]!.reason, 'invalid_window');
  });

  it('only allows the approved measurement kinds', () => {
    assert.throws(
      () =>
        planRelationMeasurements([measurement({ measurementKind: 'granger_causality' })], {
          asOf: AS_OF,
        }),
      /measurementKind/i,
    );
  });

  it('measurement plans never carry relation-ledger write fields (non-structural)', () => {
    const { accepted } = planRelationMeasurements([measurement()], { asOf: AS_OF });
    for (const row of accepted) {
      assert.ok(!('revisionStatus' in row));
      assert.ok(!('payloadHash' in row));
      assert.ok(!('targetRevisionStatus' in row));
    }
  });

  it('event study requires pre-specified window metadata in model config', () => {
    const { rejected } = planRelationMeasurements(
      [
        measurement({
          measurementKind: 'event_study',
          modelConfig: { estimator: 'car' },
        }),
      ],
      { asOf: AS_OF },
    );
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]!.reason, 'event_study_missing_prespecified_window');

    const { accepted } = planRelationMeasurements(
      [
        measurement({
          measurementKind: 'event_study',
          modelConfig: {
            estimator: 'car',
            eventWindow: [-1, 3],
            estimationWindow: [-120, -20],
            benchmark: 'market-model',
          },
        }),
      ],
      { asOf: AS_OF },
    );
    assert.equal(accepted.length, 1);
  });

  it('event study rejects degenerate window shapes (empty/inverted/non-numeric/post-event estimation)', () => {
    const cases = [
      { eventWindow: [], estimationWindow: [-120, -20], benchmark: 'market-model' },
      { eventWindow: [3, -1], estimationWindow: [-120, -20], benchmark: 'market-model' },
      { eventWindow: ['-1', '3'], estimationWindow: [-120, -20], benchmark: 'market-model' },
      // Estimation window ending after the event contaminates the estimate.
      { eventWindow: [-1, 3], estimationWindow: [-20, 5], benchmark: 'market-model' },
      { eventWindow: [-1, 3], estimationWindow: [-120, -20], benchmark: '  ' },
    ];
    for (const config of cases) {
      const { rejected } = planRelationMeasurements(
        [
          measurement({
            measurementKind: 'event_study',
            modelConfig: { estimator: 'car', ...config },
          }),
        ],
        { asOf: AS_OF },
      );
      assert.equal(rejected.length, 1, `should reject ${JSON.stringify(config)}`);
      assert.equal(rejected[0]!.reason, 'event_study_missing_prespecified_window');
    }
  });
});
