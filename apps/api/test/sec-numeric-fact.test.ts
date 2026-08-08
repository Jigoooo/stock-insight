import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  expandSecCompanyFacts,
  type SecCompanyFactsPayload,
  type SecUnitEntry,
} from '../src/backfill/sec-numeric-fact.ts';

const context = {
  canonicalCik: '0000320193',
  entityId: 42,
  sourceRevisionId: 99,
  ingestedAt: '2025-08-01T12:34:56.789Z',
  sinceYear: 2020,
};

function entry(overrides: Partial<SecUnitEntry> = {}): SecUnitEntry {
  return {
    end: '2025-03-29',
    val: 100,
    accn: '0000320193-25-000001',
    fy: 2025,
    fp: 'Q1',
    form: '10-Q',
    filed: '2025-05-02',
    frame: 'CY2025Q1I',
    ...overrides,
  };
}

function payload(units: Record<string, SecUnitEntry[]>): SecCompanyFactsPayload {
  return {
    cik: 320193,
    entityName: 'Example Corp',
    facts: {
      'us-gaap': {
        InventoryNet: {
          label: 'Inventory, Net',
          description: 'Inventory net of allowances.',
          units,
        },
      },
    },
  };
}

describe('SEC companyfacts expansion', () => {
  it('preserves the complete claim locator and deterministic entry identity', () => {
    const result = expandSecCompanyFacts(payload({ USD: [entry()] }), context);
    const draft = result.drafts[0]!;

    assert.equal(result.skippedCount, 0);
    assert.deepEqual(draft.locator, {
      provider: 'sec-edgar',
      cik: '0000320193',
      taxonomy: 'us-gaap',
      tag: 'InventoryNet',
      unit: 'USD',
      accession: '0000320193-25-000001',
      form: '10-Q',
      filed: '2025-05-02',
      fiscalYear: 2025,
      fiscalPeriod: 'Q1',
      start: null,
      end: '2025-03-29',
      frame: 'CY2025Q1I',
      entryIdentity: draft.locator.entryIdentity,
      entryIndex: 0,
    });
    assert.match(draft.locator.entryIdentity, /^[a-f0-9]{64}$/);
  });

  it('maps known units and preserves compound units losslessly', () => {
    const result = expandSecCompanyFacts(
      payload({
        eur: [entry({ accn: 'currency' })],
        shares: [entry({ accn: 'shares' })],
        pure: [entry({ accn: 'pure' })],
        'USD/shares': [entry({ accn: 'compound' })],
        ZZZ: [entry({ accn: 'unknown-three-letter' })],
      }),
      context,
    );
    const mapped = Object.fromEntries(
      result.drafts.map((draft) => [
        draft.locator.unit,
        { unit: draft.unit, currency: draft.currency },
      ]),
    );

    assert.deepEqual(mapped, {
      'USD/shares': { unit: 'USD/shares', currency: null },
      eur: { unit: 'currency', currency: 'EUR' },
      pure: { unit: 'pure', currency: null },
      shares: { unit: 'shares', currency: null },
      ZZZ: { unit: 'ZZZ', currency: null },
    });
  });

  it('uses conservative New York filing-day bounds without pre-collection leakage', () => {
    const winter = expandSecCompanyFacts(payload({ USD: [entry({ filed: '2025-01-15' })] }), {
      ...context,
      ingestedAt: '2025-02-01T00:00:00.000Z',
    }).drafts[0]!;
    const summer = expandSecCompanyFacts(payload({ USD: [entry({ filed: '2025-07-15' })] }), {
      ...context,
      ingestedAt: '2025-08-01T00:00:00.000Z',
    }).drafts[0]!;
    const clamped = expandSecCompanyFacts(payload({ USD: [entry({ filed: '2025-07-15' })] }), {
      ...context,
      ingestedAt: '2025-07-15T20:00:00.000Z',
    }).drafts[0]!;

    assert.equal(winter.availableAt, '2025-01-16T04:59:59.999Z');
    assert.equal(summer.availableAt, '2025-07-16T03:59:59.999Z');
    assert.equal(clamped.availableAt, '2025-07-15T20:00:00.000Z');
    assert.equal(winter.knownAt, '2025-02-01T00:00:00.000Z');
    assert.equal(summer.knownAt, '2025-08-01T00:00:00.000Z');
    assert.equal(clamped.knownAt, '2025-07-15T20:00:00.000Z');
  });

  it('refuses collection before the New York filing day starts across DST boundaries', () => {
    const spring = expandSecCompanyFacts(payload({ USD: [entry({ filed: '2025-03-09' })] }), {
      ...context,
      ingestedAt: '2025-03-09T04:59:59.999Z',
    });
    const fall = expandSecCompanyFacts(payload({ USD: [entry({ filed: '2025-11-02' })] }), {
      ...context,
      ingestedAt: '2025-11-02T03:59:59.999Z',
    });
    const springAtStart = expandSecCompanyFacts(
      payload({ USD: [entry({ filed: '2025-03-09' })] }),
      { ...context, ingestedAt: '2025-03-09T05:00:00.000Z' },
    );
    const fallAtStart = expandSecCompanyFacts(payload({ USD: [entry({ filed: '2025-11-02' })] }), {
      ...context,
      ingestedAt: '2025-11-02T04:00:00.000Z',
    });

    assert.equal(spring.drafts.length, 0);
    assert.equal(fall.drafts.length, 0);
    assert.match(spring.skips[0]?.reason ?? '', /predates New York filing day/);
    assert.match(fall.skips[0]?.reason ?? '', /predates New York filing day/);
    assert.equal(springAtStart.drafts[0]?.availableAt, '2025-03-09T05:00:00.000Z');
    assert.equal(fallAtStart.drafts[0]?.availableAt, '2025-11-02T04:00:00.000Z');
  });

  it('separates filings and corrections while grouping amendments together', () => {
    const first = expandSecCompanyFacts(
      payload({ USD: [entry({ val: 100, accn: 'original' })] }),
      context,
    ).drafts[0]!;
    const amendment = expandSecCompanyFacts(
      payload({ USD: [entry({ val: 101, accn: 'amendment' })] }),
      context,
    ).drafts[0]!;
    const corrected = expandSecCompanyFacts(
      payload({ USD: [entry({ val: 102, accn: 'original' })] }),
      context,
    ).drafts[0]!;

    assert.notEqual(first.factKey, amendment.factKey);
    assert.notEqual(first.factKey, corrected.factKey);
    assert.equal(first.restatementGroupKey, amendment.restatementGroupKey);
    assert.equal(first.restatementGroupKey, corrected.restatementGroupKey);
  });

  it('does not let presentation frame split one restatement claim', () => {
    const first = expandSecCompanyFacts(
      payload({ USD: [entry({ frame: 'CY2025Q1I', accn: 'original' })] }),
      context,
    ).drafts[0]!;
    const amendment = expandSecCompanyFacts(
      payload({ USD: [entry({ frame: 'CY2025Q1', accn: 'amendment' })] }),
      context,
    ).drafts[0]!;

    assert.equal(first.restatementGroupKey, amendment.restatementGroupKey);
  });

  it('distinguishes instant and duration periods without guessing fiscal quarters', () => {
    const instant = expandSecCompanyFacts(payload({ USD: [entry()] }), context).drafts[0]!;
    const duration = expandSecCompanyFacts(
      payload({ USD: [entry({ start: '2024-12-30', fp: 'FY', form: '10-K' })] }),
      context,
    ).drafts[0]!;
    const unknown = expandSecCompanyFacts(payload({ USD: [entry({ fp: 'H1' })] }), context)
      .drafts[0]!;

    assert.equal(instant.instantAt, '2025-03-29T23:59:59.999Z');
    assert.equal(instant.periodStart, null);
    assert.equal(instant.periodEnd, null);
    assert.equal(instant.fiscalYear, null);
    assert.equal(instant.fiscalQuarter, null);
    assert.equal(duration.instantAt, null);
    assert.equal(duration.periodStart, '2024-12-30');
    assert.equal(duration.periodEnd, '2025-03-29');
    assert.equal(duration.fiscalYear, null);
    assert.equal(duration.fiscalQuarter, null);
    assert.equal(unknown.fiscalQuarter, null);
  });

  it('derives canonical fiscal fields from claim end and proven fiscal year-end month', () => {
    const result = expandSecCompanyFacts(
      payload({
        USD: [entry({ end: '2024-12-31', fy: 1999, fp: 'FY' })],
      }),
      { ...context, fiscalYearEndMonth: 9 },
    );

    assert.equal(result.drafts[0]?.locator.fiscalYear, 1999, 'raw filing focus stays preserved');
    assert.equal(result.drafts[0]?.locator.fiscalPeriod, 'FY');
    assert.equal(result.drafts[0]?.fiscalYear, 2025);
    assert.equal(result.drafts[0]?.fiscalQuarter, 1);
  });

  it('filters sinceYear by claim end year rather than the filing focus fy', () => {
    const result = expandSecCompanyFacts(
      payload({ USD: [entry({ end: '2019-12-31', fy: 2025, fp: 'FY' })] }),
      { ...context, sinceYear: 2020 },
    );

    assert.equal(result.drafts.length, 0);
    assert.match(result.skips[0]?.reason ?? '', /claim end year is before sinceYear/);
  });

  it('fails closed on CIK mismatch and counts malformed entries', () => {
    const mismatch = expandSecCompanyFacts(
      { ...payload({ USD: [entry()] }), cik: 999999 },
      context,
    );
    assert.equal(mismatch.drafts.length, 0);
    assert.match(mismatch.skips[0]?.reason ?? '', /does not match canonical CIK/);

    const malformed = expandSecCompanyFacts(
      payload({
        USD: [
          entry({ accn: undefined }),
          entry({ filed: undefined }),
          entry({ end: undefined }),
          entry({ val: Number.POSITIVE_INFINITY }),
          entry({ end: '2019-12-31', fy: 2025 }),
        ],
      }),
      context,
    );
    assert.equal(malformed.drafts.length, 0);
    assert.equal(malformed.skippedCount, 5);
    const reasons = malformed.skips.map((skip) => skip.reason);
    assert.ok(reasons.some((reason) => /accession/.test(reason)));
    assert.ok(reasons.some((reason) => /filed date/.test(reason)));
    assert.ok(reasons.some((reason) => /period end/.test(reason)));
    assert.ok(reasons.some((reason) => /finite numeric/.test(reason)));
    assert.ok(reasons.some((reason) => /before sinceYear/.test(reason)));
  });

  it('rejects all-zero CIK and whitespace-padded taxonomy, tag, and unit keys', () => {
    const zero = expandSecCompanyFacts(payload({ USD: [entry()] }), {
      ...context,
      canonicalCik: '0000000000',
    });
    const padded = expandSecCompanyFacts(
      {
        cik: 320193,
        facts: {
          ' us-gaap': {
            ' InventoryNet': { units: { ' USD': [entry()] } },
          },
        },
      },
      context,
    );

    assert.equal(zero.drafts.length, 0);
    assert.match(zero.skips[0]?.reason ?? '', /CIK is missing or invalid/);
    assert.equal(padded.drafts.length, 0);
    assert.ok(padded.skippedCount >= 1);
  });

  it('orders fact keys deterministically regardless of raw entry order', () => {
    const first = entry({ accn: 'b', val: 2 });
    const second = entry({ accn: 'a', val: 1 });
    const forwards = expandSecCompanyFacts(payload({ USD: [first, second] }), context).drafts;
    const backwards = expandSecCompanyFacts(payload({ USD: [second, first] }), context).drafts;

    assert.deepEqual(
      forwards.map((draft) => draft.factKey),
      backwards.map((draft) => draft.factKey),
    );
    assert.equal(new Set(forwards.map((draft) => draft.locator.entryIdentity)).size, 2);
  });

  it('deduplicates an exact entry identity within one payload and counts it', () => {
    const repeated = entry({ accn: 'same', val: 7 });
    const other = entry({ accn: 'other', val: 8 });
    const forwards = expandSecCompanyFacts(payload({ USD: [repeated, other, repeated] }), context);
    const backwards = expandSecCompanyFacts(payload({ USD: [repeated, repeated, other] }), context);

    assert.equal(forwards.drafts.length, 2);
    assert.deepEqual(
      forwards.drafts.map((row) => row.factKey),
      backwards.drafts.map((row) => row.factKey),
    );
    assert.deepEqual(forwards.skips, [
      { reason: 'duplicate SEC entry identity within payload', count: 1 },
    ]);
  });
});
