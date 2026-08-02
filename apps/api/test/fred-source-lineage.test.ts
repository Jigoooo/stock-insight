import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Second collector routed through the contract layer. market.macro_vintage stores
// every (observation_date, vintage_date) pair so a past report can be rebuilt
// from what was known then — a promise that was unauditable while nothing
// recorded which fetch produced a vintage.

const collector = readFileSync(
  new URL('../src/ingest/run-fred-vintage.ts', import.meta.url).pathname,
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../../../packages/db-schema/src/migrations/057_macro_vintage_source_lineage.ts',
    import.meta.url,
  ).pathname,
  'utf8',
);

test('the record is the realtime window, not the series or the page', () => {
  // A page is too fine (one window is assembled from up to 40 offset pages) and a
  // series is too coarse (a daily series splits into many windows). The window is
  // the slice whose hash changes exactly when its data changes.
  assert.match(collector, /recordKey: `\$\{series\}:\$\{windowStart\}:\$\{windowEnd\}`/);
  assert.match(collector, /recordKey: `\$\{series\}:2000-01-01:9999-12-31`/);
  assert.match(collector, /providerRecordKey: window\.recordKey/);
});

test('the slice is preserved before it is flattened into rows', () => {
  assert.match(collector, /writeRawObject\(\{/);
  assert.match(collector, /registerRawObjectWithRevision\(client, \{/);
  // The stored payload must describe the window it came from, or the hash cannot
  // be attributed back to a request.
  assert.match(collector, /realtime_start: window\.realtimeStart/);
});

test('the vintage carries the revision that produced it', () => {
  assert.match(collector, /available_at, metadata,\s*\n\s*source_revision_id/);
  assert.match(collector, /registered\.sourceRevisionId,/);
});

test('a fetch run is opened once per invocation and closed', () => {
  assert.match(collector, /OPEN_FETCH_RUN_SQL/);
  assert.match(collector, /CLOSE_FETCH_RUN_SQL/);
  assert.doesNotMatch(collector, /'succeeded'/);
});

test('new versus replayed revisions are both reported', () => {
  assert.match(collector, /revisionsRegistered/);
  assert.match(collector, /revisionsReplayed/);
});

test('the lineage column is nullable and never backfilled', () => {
  const addColumn = migration.match(/ADD COLUMN IF NOT EXISTS source_revision_id[^;]*/)?.[0];
  assert.ok(addColumn, 'migration must add the column');
  assert.doesNotMatch(addColumn, /NOT NULL/);
  assert.match(addColumn, /REFERENCES ingestion\.source_revision/);
  assert.doesNotMatch(migration, /UPDATE market\.macro_vintage/);
});
