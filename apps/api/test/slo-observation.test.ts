import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildObservationRow,
  observeSlos,
  parseSloObservationArgs,
  sloBreached,
  type SloComparison,
  type SloDefinitionRow,
} from '../src/ops/run-slo-observation.ts';

const cutoff = '2026-08-10T00:00:00.000Z';

function definition(overrides: Partial<SloDefinitionRow> = {}): SloDefinitionRow {
  return {
    sloKey: 'knowledge.claim.growth',
    sloKind: 'artifact_count',
    subject: 'knowledge.claim',
    comparison: 'at_least',
    threshold: 1,
    unit: 'rows',
    windowHours: 24,
    ...overrides,
  };
}

describe('SLO verdict', () => {
  /**
   * `slo_observation_verdict_matches` recomputes the verdict from the numbers stored
   * beside it, with strict inequalities on both sides. A gauge written with `<=` is
   * rejected at INSERT — these cases pin the boundary the CHECK enforces.
   */
  it('treats equality as clean on both comparisons', () => {
    assert.equal(sloBreached('at_least', 1, 1), false);
    assert.equal(sloBreached('at_most', 48, 48), false);
    assert.equal(sloBreached('at_least', 0, 0), false);
  });

  it('breaches only strictly past the threshold', () => {
    assert.equal(sloBreached('at_least', 0, 1), true);
    assert.equal(sloBreached('at_least', 2, 1), false);
    assert.equal(sloBreached('at_most', 49, 48), true);
    assert.equal(sloBreached('at_most', 47, 48), false);
  });

  it('breaches a coverage regression but not a flat one', () => {
    // governance.coverage_ledger.delta is at_least 0, so exactly zero is clean and
    // any negative delta is a breach.
    assert.equal(sloBreached('at_least', 0, 0), false);
    assert.equal(sloBreached('at_least', -0.01, 0), true);
  });

  it('matches what the database CHECK would compute', () => {
    const check = (comparison: SloComparison, observed: number, threshold: number) =>
      comparison === 'at_least' ? observed < threshold : observed > threshold;
    for (const comparison of ['at_least', 'at_most'] as const) {
      for (const observed of [-1, 0, 0.5, 1, 47, 48, 49]) {
        for (const threshold of [0, 1, 48]) {
          assert.equal(
            sloBreached(comparison, observed, threshold),
            check(comparison, observed, threshold),
          );
        }
      }
    }
  });
});

describe('SLO observation row', () => {
  it('snapshots the threshold and comparison it was judged under', () => {
    const row = buildObservationRow(
      definition({ threshold: 5, comparison: 'at_least' }),
      { observedValue: 3, detail: { note: 'x' } },
      { start: '2026-08-09T00:00:00.000Z', end: cutoff },
    );
    assert.equal(row.thresholdAtObservation, 5);
    assert.equal(row.comparisonAtObservation, 'at_least');
    assert.equal(row.breached, true);
    assert.deepEqual(row.detail, { note: 'x' });
  });

  it('refuses a non-finite observation rather than storing one', () => {
    for (const observedValue of [Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () =>
          buildObservationRow(
            definition(),
            { observedValue, detail: {} },
            { start: '2026-08-09T00:00:00.000Z', end: cutoff },
          ),
        /non-finite/,
      );
    }
  });
});

describe('SLO observation arguments', () => {
  it('defaults to dry-run against the database clock', () => {
    const args = parseSloObservationArgs([]);
    assert.equal(args.apply, false);
    // null means "ask the database" — REQ-PIT-003 forbids now() as a business cutoff.
    assert.equal(args.cutoffs, null);
  });

  it('builds one cutoff per day across a replay range', () => {
    const args = parseSloObservationArgs(['--from', '2026-08-01', '--to', '2026-08-03']);
    assert.deepEqual(args.cutoffs, [
      '2026-08-01T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      '2026-08-03T00:00:00.000Z',
    ]);
  });

  it('refuses to write a replayed window', () => {
    // A past window's value is a calculation about the past, not something observed
    // then. Writing it would distort which observation slo_current_v1 calls latest,
    // and the ledger is append-only.
    assert.throws(
      () => parseSloObservationArgs(['--from', '2026-08-01', '--to', '2026-08-03', '--apply']),
      /dry-run only/,
    );
  });

  it('rejects contradictory or half-given ranges', () => {
    assert.throws(
      () => parseSloObservationArgs(['--as-of', cutoff, '--from', '2026-08-01']),
      /combined/,
    );
    assert.throws(() => parseSloObservationArgs(['--from', '2026-08-01']), /both/);
    assert.throws(() => parseSloObservationArgs(['--to', '2026-08-01']), /both/);
    assert.throws(() => parseSloObservationArgs(['--as-of', 'not-a-time']), /parseable/);
    assert.throws(() => parseSloObservationArgs(['--nope']), /unknown/);
  });
});

describe('SLO observation sweep', () => {
  function client(measurements: Record<string, Array<Record<string, unknown>>>) {
    return {
      async query(sql: string) {
        for (const [needle, rows] of Object.entries(measurements)) {
          if (sql.includes(needle)) return { rows };
        }
        return { rows: [] };
      },
    };
  }

  it('names an SLO it cannot measure instead of inventing a value', async () => {
    // freshness over an empty pack set has no age. Reporting one would be a number
    // nobody measured, and "packs must exist" is already its own SLO.
    const db = client({
      'FROM governance.slo_definition': [
        {
          slo_key: 'serving.content_pack.freshness',
          slo_kind: 'freshness',
          subject: 'serving.content_pack',
          comparison: 'at_most',
          threshold: 48,
          unit: 'hours',
          window_hours: 24,
        },
      ],
      'FROM serving.content_pack': [{ observed: null, newest_built_at: null }],
    });
    const { observations, skipped } = await observeSlos(db, cutoff);
    assert.deepEqual(observations, []);
    assert.deepEqual(skipped, [
      { sloKey: 'serving.content_pack.freshness', reason: 'no measurable input in the window' },
    ]);
  });

  it('names a definition with no measurement rather than passing over it', async () => {
    // A definition can be seeded before its measurement exists — ingestion.parser.drift
    // was in exactly that state from migration 083 until 098 gave it a ledger to read.
    // Whatever is in that state next must be named, not skipped over.
    const db = client({
      'FROM governance.slo_definition': [
        {
          slo_key: 'ingestion.future.gauge',
          slo_kind: 'coverage_delta',
          subject: 'ingestion.source',
          comparison: 'at_most',
          threshold: 0,
          unit: 'sources',
          window_hours: 24,
        },
      ],
    });
    const { observations, skipped } = await observeSlos(db, cutoff);
    assert.deepEqual(observations, []);
    assert.equal(skipped[0]?.sloKey, 'ingestion.future.gauge');
    assert.match(skipped[0]!.reason, /no measurement implemented/);
  });

  it('derives the window from the definition, not a fixed day', async () => {
    const db = client({
      'FROM governance.slo_definition': [
        {
          slo_key: 'knowledge.relation_evidence.growth',
          slo_kind: 'information_gain',
          subject: 'knowledge.relation_evidence_ledger',
          comparison: 'at_least',
          threshold: 1,
          unit: 'rows',
          window_hours: 168,
        },
      ],
      'FROM knowledge.relation_evidence_ledger': [{ observed: 4, relations: 2 }],
    });
    const { observations } = await observeSlos(db, cutoff);
    assert.equal(observations.length, 1);
    assert.equal(observations[0]!.windowEnd, cutoff);
    assert.equal(observations[0]!.windowStart, '2026-08-03T00:00:00.000Z');
    assert.equal(observations[0]!.breached, false);
  });

  it('reports the per-wrapper breakdown expected_runs cannot express in one number', async () => {
    // The definition says "attempts observed versus scheduled" but its threshold is
    // at_least 1 while four wrappers are scheduled. The observer measures what is
    // written and surfaces the gap rather than rewriting a frozen threshold.
    const db = client({
      'FROM governance.slo_definition': [
        {
          slo_key: 'ops.pipeline.expected_runs',
          slo_kind: 'artifact_count',
          subject: 'public.migration_runs',
          comparison: 'at_least',
          threshold: 1,
          unit: 'runs',
          window_hours: 24,
        },
      ],
      'FROM public.migration_runs': [
        { job_name: 'stock-insight-analytics-wrapper', attempts: 1 },
        { job_name: 'stock-insight-ohlcv-wrapper', attempts: 2 },
      ],
    });
    const { observations } = await observeSlos(db, cutoff);
    assert.equal(observations[0]!.observedValue, 3);
    assert.equal(observations[0]!.breached, false);
    assert.deepEqual(observations[0]!.detail.perWrapper, {
      'stock-insight-analytics-wrapper': 1,
      'stock-insight-ohlcv-wrapper': 2,
    });
    assert.equal(observations[0]!.detail.scheduledWrapperCount, 4);
  });
});
