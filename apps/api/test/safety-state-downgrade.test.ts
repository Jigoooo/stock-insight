import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  planDowngrade,
  type SafetyState,
  type SloCurrentRow,
} from '../src/ops/run-safety-state-downgrade.ts';
import {
  assertRecoveryDirection,
  parseRecoveryArgs,
  recoveryBlockers,
} from '../src/ops/run-safety-state-recovery.ts';

function gauge(overrides: Partial<SloCurrentRow> = {}): SloCurrentRow {
  return {
    sloKey: 'ops.pipeline.wrapper_failure_streak',
    breachSafetyState: 'CAUTION',
    breachConsecutiveRequired: 6,
    consecutiveBreaches: 0,
    observedValue: 0,
    ...overrides,
  };
}

describe('safety state downgrade rule', () => {
  it('does nothing while a streak is short of what its definition asks for', () => {
    assert.equal(planDowngrade([gauge({ consecutiveBreaches: 5 })], 'NORMAL'), null);
  });

  it('fires the moment the requirement is met', () => {
    const decision = planDowngrade([gauge({ consecutiveBreaches: 6 })], 'NORMAL');
    assert.equal(decision?.toState, 'CAUTION');
    assert.deepEqual(decision?.firing, [
      { sloKey: 'ops.pipeline.wrapper_failure_streak', consecutiveBreaches: 6, required: 6 },
    ]);
  });

  it('ignores a breaching gauge nobody promoted', () => {
    // Report-only is the state migration 083 seeded and 097 deliberately left two
    // gauges in. A breach there is a number to watch, not a decision.
    assert.equal(
      planDowngrade([gauge({ breachSafetyState: null, consecutiveBreaches: 99 })], 'NORMAL'),
      null,
    );
  });

  it('takes the worst state when several fire at once', () => {
    const decision = planDowngrade(
      [
        gauge({ sloKey: 'a', breachSafetyState: 'CAUTION', consecutiveBreaches: 6 }),
        gauge({
          sloKey: 'b',
          breachSafetyState: 'HALTED',
          breachConsecutiveRequired: 2,
          consecutiveBreaches: 2,
        }),
        gauge({
          sloKey: 'c',
          breachSafetyState: 'INFORMATION_ONLY',
          breachConsecutiveRequired: 2,
          consecutiveBreaches: 3,
        }),
      ],
      'NORMAL',
    );
    // A gauge asking for CAUTION cannot soften one asking for HALTED.
    assert.equal(decision?.toState, 'HALTED');
    assert.deepEqual(
      decision?.firing.map((row) => row.sloKey),
      ['b'],
    );
  });

  it('never records a transition that transitions nothing', () => {
    // The ledger is append-only. Re-asserting the state it already holds would grow
    // it with rows that carry no decision.
    assert.equal(planDowngrade([gauge({ consecutiveBreaches: 6 })], 'CAUTION'), null);
    assert.equal(planDowngrade([gauge({ consecutiveBreaches: 6 })], 'HALTED'), null);
  });

  it('still downgrades further when a worse gauge fires later', () => {
    const decision = planDowngrade(
      [
        gauge({
          breachSafetyState: 'HALTED',
          breachConsecutiveRequired: 2,
          consecutiveBreaches: 2,
        }),
      ],
      'CAUTION',
    );
    assert.equal(decision?.toState, 'HALTED');
  });

  it('never proposes NORMAL, because a breach cannot mean health', () => {
    for (const current of ['NORMAL', 'CAUTION', 'INFORMATION_ONLY', 'HALTED'] as SafetyState[]) {
      const decision = planDowngrade([gauge({ consecutiveBreaches: 6 })], current);
      assert.notEqual(decision?.toState, 'NORMAL');
    }
  });

  it('reports each firing gauge so the reason names its own evidence', () => {
    const decision = planDowngrade(
      [
        gauge({ sloKey: 'z', consecutiveBreaches: 6 }),
        gauge({ sloKey: 'a', consecutiveBreaches: 7 }),
      ],
      'NORMAL',
    );
    assert.deepEqual(
      decision?.firing.map((row) => row.sloKey),
      ['a', 'z'],
    );
  });
});

describe('safety state recovery', () => {
  it('requires a person, not a default', () => {
    // 082 keeps recovery manual so somebody's name is on the decision. A default
    // here would quietly turn that back into automation.
    assert.throws(
      () => parseRecoveryArgs(['--to', 'NORMAL', '--reason', 'cleared']),
      /--decided-by is required/,
    );
    assert.throws(
      () => parseRecoveryArgs(['--to', 'NORMAL', '--decided-by', 'jigoo']),
      /--reason is required/,
    );
    assert.throws(
      () => parseRecoveryArgs(['--to', 'SOMETHING', '--reason', 'x', '--decided-by', 'y']),
      /--to must be/,
    );
  });

  it('defaults to dry-run', () => {
    const args = parseRecoveryArgs([
      '--to',
      'NORMAL',
      '--reason',
      'cleared',
      '--decided-by',
      'jigoo',
    ]);
    assert.equal(args.apply, false);
    assert.equal(args.toState, 'NORMAL');
  });

  it('refuses to call a downgrade a recovery', () => {
    assert.throws(() => assertRecoveryDirection('NORMAL', 'CAUTION'), /not a recovery/);
    assert.throws(() => assertRecoveryDirection('CAUTION', 'CAUTION'), /not a recovery/);
    assert.doesNotThrow(() => assertRecoveryDirection('HALTED', 'CAUTION'));
    assert.doesNotThrow(() => assertRecoveryDirection('CAUTION', 'NORMAL'));
  });

  it('blocks a recovery while the cause is still breaching', () => {
    // The ledger is append-only: a recovery written over a live breach cannot be
    // taken back, only followed by another downgrade.
    const blockers = recoveryBlockers([
      gauge({ sloKey: 'still-bad', consecutiveBreaches: 6 }),
      gauge({ sloKey: 'fine', consecutiveBreaches: 1 }),
      gauge({ sloKey: 'report-only', breachSafetyState: null, consecutiveBreaches: 9 }),
    ]);
    assert.deepEqual(
      blockers.map((row) => row.sloKey),
      ['still-bad'],
    );
  });

  it('clears once every promoted gauge is under its requirement', () => {
    assert.deepEqual(recoveryBlockers([gauge({ consecutiveBreaches: 5 })]), []);
  });
});
