import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertPitContextSound,
  axisForOperation,
  bindPitOperation,
  cutoffForOperation,
  PIT_OPERATIONS,
  pitContextFromInformationSet,
  traceForOperation,
} from '../src/kernel/temporal-kernel.ts';

import { analysisInformationSetSchema } from '@stock-insight/contracts/analysis-information-set';

const VALID = '2026-07-21T00:00:00.000Z';
const EARLIER = '2026-07-20T00:00:00.000Z';
const LATER = '2026-07-22T00:00:00.000Z';

function exAnte() {
  return analysisInformationSetSchema.parse({
    informationSetId: 'is-1',
    mode: 'EX_ANTE',
    validCutoff: VALID,
    sourceAvailableCutoff: EARLIER,
    systemKnownCutoff: VALID,
    marketObservationCutoff: EARLIER,
    semanticSnapshotId: 'snap-1',
  });
}

describe('temporal kernel — the seven canonical operations', () => {
  it('names exactly the operations canonical/02 §2 fixes', () => {
    assert.deepEqual(
      [...PIT_OPERATIONS],
      [
        'PIT_SELECT',
        'PIT_JOIN',
        'PIT_UNIVERSE',
        'PIT_PRICE',
        'PIT_EXPECTATION',
        'PIT_ENTITY_STATE',
        'PIT_RELATION',
      ],
    );
  });

  it('gives every operation an axis', () => {
    for (const operation of PIT_OPERATIONS) {
      assert.ok(axisForOperation(operation), `${operation} has no axis`);
    }
  });

  it('binds PIT_PRICE to market observation, not to what we knew', () => {
    // The leak this table exists to prevent: a price query standing on
    // systemKnownCutoff lets an ex-ante run see prices it could not have seen.
    assert.equal(axisForOperation('PIT_PRICE'), 'marketObservationCutoff');
  });

  it('binds PIT_UNIVERSE to the world, not to our knowledge of it (REQ-PIT-002)', () => {
    assert.equal(axisForOperation('PIT_UNIVERSE'), 'validCutoff');
  });

  it('binds PIT_EXPECTATION to availability — an expectation is a published artifact', () => {
    assert.equal(axisForOperation('PIT_EXPECTATION'), 'sourceAvailableCutoff');
  });

  it('rejects an unknown operation instead of defaulting to an axis', () => {
    const context = pitContextFromInformationSet(exAnte());
    assert.throws(() => cutoffForOperation(context, 'PIT_GUESS' as never));
  });
});

describe('temporal kernel — context comes only from an information set', () => {
  it('carries the cutoffs, snapshot and mode across', () => {
    const context = pitContextFromInformationSet(exAnte());
    assert.equal(context.informationSetId, 'is-1');
    assert.equal(context.semanticSnapshotId, 'snap-1');
    assert.equal(context.mode, 'EX_ANTE');
    assert.equal(context.cutoffs.validCutoff, VALID);
    assert.equal(context.cutoffs.marketObservationCutoff, EARLIER);
  });

  it('resolves each operation to its own cutoff', () => {
    const context = pitContextFromInformationSet(exAnte());
    assert.equal(cutoffForOperation(context, 'PIT_PRICE'), EARLIER);
    assert.equal(cutoffForOperation(context, 'PIT_UNIVERSE'), VALID);
    assert.equal(cutoffForOperation(context, 'PIT_EXPECTATION'), EARLIER);
    assert.equal(cutoffForOperation(context, 'PIT_SELECT'), VALID);
  });
});

describe('temporal kernel — trace (REQ-KERN-010)', () => {
  it('records the axis and cutoff a read stood on', () => {
    const context = pitContextFromInformationSet(exAnte());
    assert.deepEqual(traceForOperation(context, 'PIT_PRICE'), {
      operation: 'PIT_PRICE',
      axis: 'marketObservationCutoff',
      cutoff: EARLIER,
      informationSetId: 'is-1',
      semanticSnapshotId: 'snap-1',
    });
  });

  it('cannot return a cutoff without the trace that describes it', () => {
    // A trace disagreeing with the bound value would be worse than none, because
    // it would be believed.
    const context = pitContextFromInformationSet(exAnte());
    for (const operation of PIT_OPERATIONS) {
      const binding = bindPitOperation(context, operation);
      assert.equal(binding.cutoff, binding.trace.cutoff);
      assert.equal(binding.trace.operation, operation);
    }
  });
});

describe('temporal kernel — soundness at the point of use', () => {
  it('accepts a sound ex-ante context', () => {
    assert.doesNotThrow(() => assertPitContextSound(pitContextFromInformationSet(exAnte())));
  });

  it('rejects a hand-assembled context that admits post-cutoff market data', () => {
    // The schema and the CHECK constraint both stop this at write time. A context
    // can still be assembled in memory from parts, which is why the kernel checks
    // again at the point of use.
    const context = pitContextFromInformationSet(exAnte());
    const leaking = {
      ...context,
      cutoffs: { ...context.cutoffs, marketObservationCutoff: LATER },
    };
    assert.throws(() => assertPitContextSound(leaking), /REQ-KERN-001/);
  });

  it('rejects a context that knows before it can reach', () => {
    const context = pitContextFromInformationSet(exAnte());
    const inverted = {
      ...context,
      cutoffs: { ...context.cutoffs, sourceAvailableCutoff: LATER, systemKnownCutoff: EARLIER },
    };
    assert.throws(() => assertPitContextSound(inverted), /impossible collection order/);
  });

  it('rejects an ex-ante context admitting later knowledge', () => {
    const context = pitContextFromInformationSet(exAnte());
    const hindsight = {
      ...context,
      cutoffs: { ...context.cutoffs, systemKnownCutoff: LATER },
    };
    assert.throws(() => assertPitContextSound(hindsight), /REQ-PIT-001/);
  });

  it('lets EX_POST look past the decision point', () => {
    const set = analysisInformationSetSchema.parse({
      informationSetId: 'is-2',
      mode: 'EX_POST',
      validCutoff: VALID,
      sourceAvailableCutoff: VALID,
      systemKnownCutoff: LATER,
      marketObservationCutoff: LATER,
      semanticSnapshotId: 'snap-1',
    });
    assert.doesNotThrow(() => assertPitContextSound(pitContextFromInformationSet(set)));
  });
});
