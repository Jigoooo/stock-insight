import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  analysisInformationSetSchema,
  analysisModeSchema,
  forbiddenInformationClasses,
  informationSetFromTemporalQuery,
} from '../src/analysis-information-set.ts';
import { resolveTemporalQuery, temporalQuerySchema } from '../src/temporal.ts';

const FREEZE = new URL(
  '../../../docs/plan/stock-crypto-investment-context-world-model-v2-final/',
  import.meta.url,
);

const T0 = '2026-07-20T00:00:00.000Z';
const T1 = '2026-07-21T00:00:00.000Z';
const T2 = '2026-07-22T00:00:00.000Z';

function base(overrides: Record<string, unknown> = {}) {
  return {
    informationSetId: 'is-001',
    mode: 'EX_ANTE',
    validCutoff: T1,
    sourceAvailableCutoff: T1,
    systemKnownCutoff: T1,
    marketObservationCutoff: T1,
    semanticSnapshotId: 'snap-001',
    ...overrides,
  };
}

describe('analysis information set — frozen schema parity', () => {
  // The canonical JSON Schema is the contract; this module only mirrors it.
  // If the freeze gains or loses a field, this fails rather than drifting.
  it('covers exactly the fields of contracts/analysis-information-set.schema.json', () => {
    const schema = JSON.parse(
      readFileSync(new URL('contracts/analysis-information-set.schema.json', FREEZE), 'utf8'),
    );
    const frozen = Object.keys(schema.properties).sort();
    const parsed = analysisInformationSetSchema.parse(base());
    assert.deepEqual(Object.keys(parsed).sort(), frozen);
  });

  it('requires every field the freeze marks required', () => {
    const schema = JSON.parse(
      readFileSync(new URL('contracts/analysis-information-set.schema.json', FREEZE), 'utf8'),
    );
    for (const field of schema.required as string[]) {
      const input = base() as Record<string, unknown>;
      delete input[field];
      assert.throws(
        () => analysisInformationSetSchema.parse(input),
        new RegExp(field),
        `missing ${field} should be rejected`,
      );
    }
  });

  it('rejects unknown fields (freeze sets additionalProperties: false)', () => {
    assert.throws(() => analysisInformationSetSchema.parse(base({ extraField: 'x' })));
  });

  // The truth-class vocabulary itself is owned by truth-visual-language.ts and
  // asserted against the frozen JSON there. This module deliberately does not
  // re-declare it: `allowedInformationClasses` is typed as plain strings because
  // that is what the frozen schema says, and narrowing beyond the freeze is the
  // drift the freeze exists to prevent.

  it('accepts the four canonical modes and nothing else', () => {
    assert.deepEqual(analysisModeSchema.options, ['EX_ANTE', 'LIVE', 'EX_POST', 'RETROSPECTIVE']);
    assert.throws(() => analysisModeSchema.parse('BACKTEST'));
  });
});

describe('analysis information set — leak invariants', () => {
  it('rejects EX_ANTE admitting market observation after validCutoff (REQ-KERN-001)', () => {
    assert.throws(
      () => analysisInformationSetSchema.parse(base({ marketObservationCutoff: T2 })),
      /REQ-KERN-001/,
    );
  });

  it('rejects LIVE admitting market observation after validCutoff', () => {
    assert.throws(
      () => analysisInformationSetSchema.parse(base({ mode: 'LIVE', marketObservationCutoff: T2 })),
      /REQ-KERN-001/,
    );
  });

  it('allows EX_POST to see market observation after validCutoff — that is its purpose', () => {
    const set = analysisInformationSetSchema.parse(
      base({ mode: 'EX_POST', marketObservationCutoff: T2, systemKnownCutoff: T2 }),
    );
    assert.equal(set.marketObservationCutoff, T2);
  });

  it('rejects EX_ANTE admitting knowledge acquired after validCutoff (REQ-PIT-001)', () => {
    assert.throws(
      () =>
        analysisInformationSetSchema.parse(
          base({ sourceAvailableCutoff: T2, systemKnownCutoff: T2 }),
        ),
      /REQ-PIT-001/,
    );
  });

  it('rejects a knowledge cutoff earlier than the availability cutoff', () => {
    assert.throws(
      () =>
        analysisInformationSetSchema.parse(
          base({ mode: 'EX_POST', sourceAvailableCutoff: T2, systemKnownCutoff: T1 }),
        ),
      /impossible collection order/,
    );
  });

  it('rejects an embargo that has already lifted at the decision point (REQ-KERN-002)', () => {
    assert.throws(
      () => analysisInformationSetSchema.parse(base({ outcomeEmbargoUntil: T0 })),
      /embargo admits the outcome/,
    );
  });

  it('rejects duplicate information classes', () => {
    assert.throws(
      () =>
        analysisInformationSetSchema.parse(base({ allowedInformationClasses: ['FACT', 'FACT'] })),
      /duplicates/,
    );
  });

  it('names every forbidden class an EX_ANTE set requested, not just the first', () => {
    const set = analysisInformationSetSchema.parse(
      base({ allowedInformationClasses: ['FACT', 'OUTCOME', 'RECOMMENDATION'] }),
    );
    assert.deepEqual(forbiddenInformationClasses(set), ['OUTCOME', 'RECOMMENDATION']);
  });

  it('permits outcome classes outside EX_ANTE', () => {
    const set = analysisInformationSetSchema.parse(
      base({ mode: 'EX_POST', allowedInformationClasses: ['OUTCOME'] }),
    );
    assert.deepEqual(forbiddenInformationClasses(set), []);
  });
});

describe('analysis information set — bridge from the temporal read surface', () => {
  it('maps point_in_time to EX_ANTE and clamps every cutoff to validAt', () => {
    const resolved = resolveTemporalQuery(
      temporalQuerySchema.parse({ validAt: T1, informationSet: 'point_in_time' }),
      { now: T2 },
    );
    const set = informationSetFromTemporalQuery(resolved, {
      informationSetId: 'is-002',
      semanticSnapshotId: 'snap-002',
    });
    assert.equal(set.mode, 'EX_ANTE');
    assert.equal(set.validCutoff, T1);
    assert.equal(set.sourceAvailableCutoff, T1);
    assert.equal(set.systemKnownCutoff, T1);
    assert.equal(set.marketObservationCutoff, T1);
  });

  it('clamps both cutoffs when an explicit knownAt outruns validAt', () => {
    // temporal.ts lets an explicit knownAt override the point_in_time pin. The
    // bridge must not carry that later value into the ex-ante set, and must not
    // fail with a confusing collection-order message either.
    const resolved = resolveTemporalQuery(
      temporalQuerySchema.parse({ validAt: T1, knownAt: T2, informationSet: 'point_in_time' }),
    );
    assert.equal(resolved.knownAt, T2, 'precondition: temporal keeps the explicit knownAt');

    const set = informationSetFromTemporalQuery(resolved, {
      informationSetId: 'is-003',
      semanticSnapshotId: 'snap-003',
    });
    assert.equal(set.mode, 'EX_ANTE');
    assert.equal(set.sourceAvailableCutoff, T1);
    assert.equal(set.systemKnownCutoff, T1);
  });

  it('maps as_known and latest to LIVE', () => {
    for (const informationSet of ['as_known', 'latest'] as const) {
      const resolved = resolveTemporalQuery(
        temporalQuerySchema.parse({ validAt: T1, informationSet }),
        { now: T2 },
      );
      const set = informationSetFromTemporalQuery(resolved, {
        informationSetId: 'is-004',
        semanticSnapshotId: 'snap-004',
      });
      assert.equal(set.mode, 'LIVE', `${informationSet} should be LIVE`);
      assert.equal(set.systemKnownCutoff, T2);
    }
  });

  it('rejects a market cutoff looser than validAt rather than silently widening', () => {
    const resolved = resolveTemporalQuery(
      temporalQuerySchema.parse({ validAt: T1, informationSet: 'point_in_time' }),
    );
    assert.throws(
      () =>
        informationSetFromTemporalQuery(resolved, {
          informationSetId: 'is-005',
          semanticSnapshotId: 'snap-005',
          marketObservationCutoff: T2,
        }),
      /REQ-KERN-001/,
    );
  });

  it('defaults timezone to UTC and leaves calendar unset', () => {
    const resolved = resolveTemporalQuery(
      temporalQuerySchema.parse({ validAt: T1, informationSet: 'point_in_time' }),
    );
    const set = informationSetFromTemporalQuery(resolved, {
      informationSetId: 'is-006',
      semanticSnapshotId: 'snap-006',
    });
    assert.equal(set.timezone, 'UTC');
    assert.equal(set.marketCalendar, null);
    assert.equal(set.outcomeEmbargoUntil, null);
  });
});
