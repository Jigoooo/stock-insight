import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Four collectors wrote straight into market.* with no ingestion.source_revision
// behind them. The gap was more basic than a missing call: none of the seven
// market.* tables had a column that could hold the lineage (0 of 7, measured
// 2026-08-03), so a fact could not be traced to the payload it came from and
// nothing downstream could require that it be.

const collector = readFileSync(
  new URL('../src/ingest/run-dart-financial-facts.ts', import.meta.url).pathname,
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../../../packages/db-schema/src/migrations/056_market_fact_source_lineage.ts',
    import.meta.url,
  ).pathname,
  'utf8',
);

test('the raw payload is preserved before it is parsed away', () => {
  // The response body used to be discarded after extracting matched rows, which
  // left the content hash — the only thing that makes a revision meaningful —
  // uncomputable after the fact.
  assert.match(collector, /writeRawObject\(\{/);
  assert.match(collector, /registerRawObjectWithRevision\(client, \{/);
});

test('the record key is the filing, not the row', () => {
  // One OpenDART response covers a whole (corp, year, report) filing. Keying per
  // row would make every fact its own record identity and the content hash would
  // stop meaning "this filing, unchanged".
  assert.match(
    collector,
    /providerRecordKey: `\$\{issuer\.corp_code\}:\$\{year\}:\$\{report\.code\}`/,
  );
});

test('the fact carries the revision that produced it', () => {
  assert.match(collector, /source_provider, metadata, source_revision_id/);
  assert.match(collector, /registered\.sourceRevisionId,/);
});

test('a fetch run is opened once and closed with a legal status', () => {
  assert.match(collector, /OPEN_FETCH_RUN_SQL/);
  assert.match(collector, /CLOSE_FETCH_RUN_SQL/);
  // ingestion.fetch_run CHECKs status IN (running, success, partial, failed).
  // 'succeeded' passes review and fails at runtime.
  assert.match(collector, /quotaExhausted \? 'partial' : 'success'/);
  assert.doesNotMatch(collector, /'succeeded'/);
});

test('the lineage column is nullable and never backfilled', () => {
  // Rows loaded before the collector was routed have no revision. Inventing one
  // would manufacture provenance for data whose origin was not recorded.
  // Match the column definition itself: the partial index below it legitimately
  // says `WHERE source_revision_id IS NOT NULL`, which is a predicate, not a
  // constraint.
  const addColumn = migration.match(/ADD COLUMN IF NOT EXISTS source_revision_id[^;]*/)?.[0];
  assert.ok(addColumn, 'migration must add the column');
  assert.doesNotMatch(addColumn, /NOT NULL/);
  assert.match(addColumn, /REFERENCES ingestion\.source_revision/);
  assert.doesNotMatch(migration, /UPDATE market\.financial_fact/);
});

test('the run reports how many revisions were new versus replayed', () => {
  // An unchanged refetch must not append a revision. Without both counters the
  // difference between "collected again" and "changed" is invisible.
  assert.match(collector, /revisionsRegistered/);
  assert.match(collector, /revisionsReplayed/);
  assert.match(collector, /if \(registered\.replay\) revisionsReplayed \+= 1;/);
});
