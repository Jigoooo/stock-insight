import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// governance.coverage_ledger existed with a schema and zero code since 2026-07-24.
// Its job is to separate "there is nothing here" from "we never looked", and the
// data to do that did not exist: the DART collector dropped empty responses on the
// floor, so an unasked cell and an asked-but-empty cell were identical in the DB.

const collector = readFileSync(
  new URL('../src/ingest/run-dart-financial-facts.ts', import.meta.url).pathname,
  'utf8',
);
const ledger = readFileSync(
  new URL('../src/ingest/run-dart-coverage-ledger.ts', import.meta.url).pathname,
  'utf8',
);

test('an empty OpenDART response is recorded, not skipped', () => {
  // The old line was `if (status === '013') continue;` before any revision was
  // written. Absence has to survive the fetch to be reportable.
  assert.doesNotMatch(collector, /if \(status === '013'\) continue/);
  assert.match(collector, /status !== '000' && status !== '013'/);
});

test('a revision is registered for every fetched cell, not only productive ones', () => {
  // Previously gated on `matched.length > 0`, which also dropped filings that
  // simply contained none of the tracked concepts.
  assert.doesNotMatch(collector, /if \(apply && matched\.length > 0\)/);
  assert.match(collector, /if \(apply\) \{/);
});

test('empty observations are counted apart from data-bearing revisions', () => {
  // Without the split, a rising revision count reads as rising data.
  assert.match(collector, /emptyObservations/);
  assert.match(collector, /if \(status === '013'\) emptyObservations \+= 1;/);
});

test('the collector does not run when imported for its report codes', () => {
  assert.match(
    collector,
    /if \(process\.argv\[1\]\?\.endsWith\('run-dart-financial-facts\.ts'\)\)/,
  );
  assert.match(collector, /export const REPORT_CODES/);
});

test('the ledger joins on the collector mapping instead of re-deriving it', () => {
  // Re-deriving the report-code/fiscal-period mapping would yield observed=0
  // everywhere, which is indistinguishable from a real coverage gap.
  assert.match(
    ledger,
    /import \{ REPORT_CODES, periodEndFor \} from '\.\/run-dart-financial-facts\.ts'/,
  );
  assert.doesNotMatch(ledger, /'11011'|'11012'|'11013'|'11014'/);
});

test('observed counts are scoped to the DART provider', () => {
  // market.financial_fact is shared with SEC; an unscoped count would report SEC
  // filings as DART coverage.
  const observed = ledger.match(/observed AS \(([\s\S]*?)\n\),/)?.[1];
  assert.ok(observed, 'ledger must define an observed CTE');
  assert.match(observed, /source_provider = 'opendart'/);
});

test('the contract revision is resolved rather than hardcoded', () => {
  assert.match(ledger, /CONTRACT_HEAD_SQL/);
  assert.match(ledger, /no source contract revision for/);
  const insertTail = ledger.slice(ledger.indexOf('INSERT INTO governance.coverage_ledger'));
  assert.doesNotMatch(insertTail, /source_contract_revision_id[^,]*,\s*1\b/);
});

test('the coverage key carries nothing that varies per run', () => {
  // Revision N must supersede N-1 of an identical key; a date or run id in the
  // key would start a fresh chain every run and the ledger would only ever grow.
  const key = ledger.match(/'dart-financial-fact:'[^\n]*\n[^\n]*/)?.[0];
  assert.ok(key, 'ledger must build a coverage key');
  assert.doesNotMatch(key, /now\(\)|current_date|run_id|uuid/i);
});

test('a revision is appended only when the judgement changed', () => {
  // A daily unconditional insert would append ~3,600 revisions a day and drown
  // the signal it exists to carry.
  const changed = ledger.match(/changed AS \(([\s\S]*?)\n\)\nINSERT/)?.[1];
  assert.ok(changed, 'ledger must define a changed CTE');
  for (const column of [
    'completeness_state',
    'expected_artifact_count',
    'observed_artifact_count',
    'gap_reason',
  ]) {
    assert.match(changed, new RegExp(`${column} IS DISTINCT FROM`));
  }
});

test('the revision chain is continued, never restarted', () => {
  assert.match(ledger, /coalesce\(prev_revision, 0\) \+ 1/);
  assert.match(ledger, /latest\.coverage_ledger_id AS prev_id/);
});

test('expected count is null when unknown, zero when the period has not ended', () => {
  // Setting 1 across the universe would manufacture a gap for every issuer-period
  // that is not actually required to be filed.
  const expected = ledger.match(
    /CASE\s+WHEN observed_count > 0 THEN 1::bigint([\s\S]*?)END AS expected_count/,
  );
  assert.ok(expected, 'ledger must compute expected_count');
  assert.match(expected[1], /WHEN period_end > now\(\) THEN 0::bigint/);
  assert.match(expected[1], /ELSE NULL::bigint/);
});

test('every gap-bearing state carries a reason', () => {
  // The table CHECKs this, so a missing branch is a runtime failure rather than a
  // silent blank. Asserting it here keeps the failure at review time.
  const reason = ledger.match(/END AS gap_reason/);
  assert.ok(reason, 'ledger must compute gap_reason');
  for (const branch of [
    /status 013/,
    /none of the tracked/,
    /no retained observation/,
    /has not reached this issuer/,
  ]) {
    assert.match(ledger, branch);
  }
});

test('the ledger reads the current revision, not every revision', () => {
  // Counting superseded judgements would report more cells than the universe has.
  assert.match(ledger, /SELECT DISTINCT ON \(coverage_key\)/);
  assert.match(ledger, /ORDER BY coverage_key, revision_no DESC/);
});
