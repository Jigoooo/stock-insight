import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignRevisions,
  checkParity,
  type NumericFactRow,
} from '../src/backfill/dart-numeric-fact-plan.ts';

function fact(overrides: Partial<NumericFactRow> = {}): NumericFactRow {
  return {
    factKey: 'dart:20250515002181:BS:7:ifrs-full_Assets:-:period',
    restatementGroupKey: 'dart:382:ifrs-full:Assets:i:2025-03-31:BS:abc:period',
    entityId: 382,
    conceptNamespace: 'ifrs-full',
    conceptKey: 'Assets',
    value: 30791952000000,
    unit: 'currency',
    currency: 'KRW',
    scalePower: 0,
    periodStart: null,
    periodEnd: null,
    instantAt: '2025-03-31T23:59:59.999Z',
    fiscalYear: 2025,
    fiscalQuarter: 1,
    dimensionsJson: {},
    locator: {
      receiptNo: '20250515002181',
      statementDivision: 'BS',
      ordinal: '7',
      accountId: 'ifrs-full_Assets',
      accountDetail: '-',
      amountField: 'thstrm_amount',
    },
    sourceRevisionId: 4711,
    availableAt: '2025-05-15T14:59:59.999Z',
    knownAt: '2026-08-07T20:23:26.826Z',
    metadata: {},
    definitionKey: 'dart.ifrs-full.assets.instant.krw',
    ...overrides,
  };
}

const NOTHING_WRITTEN = { factKeys: new Set<string>(), groups: new Map() };

describe('revision assignment', () => {
  it('writes a first observation as revision 1 with nothing superseded', () => {
    const { writes } = assignRevisions([fact()], NOTHING_WRITTEN);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].revisionNo, 1);
    assert.equal(writes[0].supersedesKey, null);
  });

  it('makes a later filing about the same claim supersede the first', () => {
    // The collision is deliberate: numeric_fact refuses a revision above 1 that
    // names nothing, so a restatement cannot be written as an independent
    // observation.
    const { writes } = assignRevisions(
      [fact(), fact({ factKey: 'dart:20250820004444:BS:7:ifrs-full_Assets:-:period' })],
      NOTHING_WRITTEN,
    );
    assert.deepEqual(
      writes.map((write) => write.revisionNo),
      [1, 2],
    );
    assert.equal(writes[1].supersedesKey, writes[1].fact.restatementGroupKey);
  });

  it('continues the chain from what a previous run already wrote', () => {
    const { writes } = assignRevisions([fact()], {
      factKeys: new Set(['dart:20250101000001:BS:7:ifrs-full_Assets:-:period']),
      groups: new Map([[fact().restatementGroupKey, { maxRevision: 2, latestFactId: 991 }]]),
    });
    assert.equal(writes[0].revisionNo, 3);
  });

  it('skips a cell it has already recorded instead of revising it', () => {
    // A filing's cell address is immutable, so meeting it again means we already
    // have it — re-running must not manufacture a revision.
    const { writes, skips } = assignRevisions([fact()], {
      factKeys: new Set([fact().factKey]),
      groups: new Map(),
    });
    assert.equal(writes.length, 0);
    assert.deepEqual(skips, [{ reason: 'already recorded', count: 1 }]);
  });

  it('assigns the same revisions whatever order the facts arrive in', () => {
    const later = fact({ factKey: 'dart:20250820004444:BS:7:ifrs-full_Assets:-:period' });
    const forwards = assignRevisions([fact(), later], NOTHING_WRITTEN).writes;
    const backwards = assignRevisions([later, fact()], NOTHING_WRITTEN).writes;
    assert.deepEqual(
      forwards.map((w) => [w.fact.factKey, w.revisionNo]),
      backwards.map((w) => [w.fact.factKey, w.revisionNo]),
    );
  });
});

describe('parity against the folded table', () => {
  const concepts = new Map([['ifrs-full_Assets', 'TotalAssets']]);

  it('agrees when both pipelines read the same cell', () => {
    const theirs = new Map([['382|TotalAssets|2025-03-31', 30791952000000]]);
    const result = checkParity([fact()], concepts, theirs);
    assert.deepEqual(result, { comparable: 1, agreed: 1, disagreed: 0, samples: [] });
  });

  it('reports a real disagreement with both numbers', () => {
    const result = checkParity([fact()], concepts, new Map([['382|TotalAssets|2025-03-31', 42]]));
    assert.equal(result.disagreed, 1);
    assert.deepEqual(result.samples[0], {
      entityId: 382,
      concept: 'TotalAssets',
      periodEnd: '2025-03-31',
      ours: 30791952000000,
      theirs: 42,
    });
  });

  it('ignores a year-to-date fact, which the folded table never holds', () => {
    // Both spans of a quarterly income statement end on the same day, so
    // comparing the cumulative one against their quarter reports a difference
    // that is really two different periods.
    const cumulative = fact({
      instantAt: null,
      periodStart: '2025-01-01T00:00:00.000Z',
      periodEnd: '2025-03-31T23:59:59.999Z',
      locator: { ...fact().locator, amountField: 'thstrm_add_amount' },
    });
    const theirs = new Map([['382|TotalAssets|2025-03-31', 1]]);
    assert.equal(checkParity([cumulative], concepts, theirs).comparable, 0);
  });

  it('ignores a component of a total', () => {
    // 자본변동표 restates equity once per component; the folded table keeps
    // whichever row it met first and has no breakdown to compare against.
    const component = fact({ dimensionsJson: { accountDetail: '이익잉여금' } });
    const theirs = new Map([['382|TotalAssets|2025-03-31', 1]]);
    assert.equal(checkParity([component], concepts, theirs).comparable, 0);
  });

  it('stays silent about concepts the folded table does not carry', () => {
    const result = checkParity([fact({ conceptKey: 'Provisions' })], new Map(), new Map());
    assert.equal(result.comparable, 0);
  });
});
