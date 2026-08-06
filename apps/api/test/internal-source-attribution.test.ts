import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { OPEN_FETCH_RUN_SQL } from '../src/ingest/raw-object-store.ts';

/**
 * Provenance attribution for the five internal snapshot sources.
 *
 * run-v2-graph-publish opens a fetch run per provider — ETF holdings, industry
 * classification, company profile, macro series window, stock price window —
 * and every raw object it registers is filed under the source that run belongs
 * to. The idempotency key omitted the provider, so all five collapsed onto one
 * key and `ON CONFLICT ... RETURNING` returned the FIRST run's source_id to
 * every later caller.
 *
 * Measured on production 2026-08-05, before the fix:
 *
 *   internal-etf-holdings-snapshot        798 transitional_company_profile
 *                                         171 transitional_etf_snapshot
 *                                         119 transitional_industry_classification
 *                                          63 stock_price_window
 *                                          18 macro_series_window
 *   the other four internal sources          0 — approved, and never written to
 *
 * So every relation's source_revision evidence cited an ETF holdings snapshot:
 * 22,449 SAME_ETF_BASKET, 13,180 PRODUCT_SIMILARITY, 119 CLASSIFIED_AS,
 * 210 MACRO_COMOVEMENT. The payload metadata still carried the real `kind`, so
 * no content was lost — but the evidence ledger is what the product treats as
 * authoritative provenance, and it named the wrong source for all of it.
 */
describe('internal snapshot provenance attribution', () => {
  it('scopes the graph-publish fetch-run key by provider', async () => {
    const source = await readFile(
      new URL('../src/analytics/run-v2-graph-publish.ts', import.meta.url),
      'utf8',
    );

    const runIdAssignment = source.match(/const runId = `([^`]*)`/)?.[1];
    assert.ok(runIdAssignment, 'openFetchRun must build a runId');
    assert.ok(
      runIdAssignment.includes('${providerKey}'),
      `the fetch-run idempotency key must carry the provider; got \`${runIdAssignment}\``,
    );
  });

  it('refuses to reuse a fetch run that belongs to a different source', () => {
    // Verified against a disposable clone on 2026-08-05: inserting key K under
    // ETF returns its source; the same K under the macro series source returns
    // ZERO rows; K under ETF again still returns ETF, so idempotency for the
    // legitimate case is untouched.
    const conflictClause = OPEN_FETCH_RUN_SQL.slice(OPEN_FETCH_RUN_SQL.indexOf('ON CONFLICT'));
    assert.match(
      conflictClause,
      /WHERE\s+fetch_run\.source_id\s*=\s*EXCLUDED\.source_id/,
      'a cross-source key collision must return no row rather than another source’s run',
    );
  });

  it('keeps a distinct provider constant per internal snapshot kind', async () => {
    const source = await readFile(
      new URL('../src/analytics/run-v2-graph-publish.ts', import.meta.url),
      'utf8',
    );

    const providers = [...source.matchAll(/'(internal-[a-z-]+)'/g)].map((match) => match[1]);
    const distinct = new Set(providers);
    // One source per kind of snapshot. If a constant is ever dropped or reused,
    // two kinds start sharing provenance again — the shape of the bug this file
    // exists for. Adding a kind is fine and must be stated here, so a new
    // snapshot cannot quietly borrow an existing source.
    assert.deepEqual(
      [...distinct].sort(),
      [
        'internal-company-profile-snapshot',
        'internal-etf-holdings-snapshot',
        'internal-industry-classification-snapshot',
        // Added 2026-08-07 with the ownership builder. One raw object and one
        // source revision per POSITION rather than per filing, because
        // COMMON_OWNER declares minSourceRevisions: 2 and assembles a pair's
        // evidence from both legs — at filing grain both legs cite the same
        // revision and every candidate would quarantine.
        'internal-institutional-holdings-snapshot',
        'internal-macro-series-window-snapshot',
        // Added 2026-08-05 with MEASURED_BY. Its contract is written by
        // migration 068 rather than ensureSource, because the mapping is a
        // curated judgement and ensureSource would file it as internal_derived.
        'internal-macro-topic-mapping-snapshot',
        'internal-stock-price-window-snapshot',
      ],
      'each internal snapshot kind needs its own source',
    );
  });
});
