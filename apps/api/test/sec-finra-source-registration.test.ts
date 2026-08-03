import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ops.source_collection_policy held 28 rows and every one had a matching
// ingestion.source. SEC EDGAR and FINRA were in neither, while their collectors
// fetched nightly — collecting outside the governance every other source passes
// through, with nothing recording that they existed.

const migration = readFileSync(
  new URL(
    '../../../packages/db-schema/src/migrations/058_sec_finra_source_registration.ts',
    import.meta.url,
  ).pathname,
  'utf8',
);
const sec = readFileSync(
  new URL('../src/ingest/run-sec-financial-facts.ts', import.meta.url).pathname,
  'utf8',
);
const finra = readFileSync(
  new URL('../src/ingest/run-finra-short-volume.ts', import.meta.url).pathname,
  'utf8',
);

test('neither source is marked as reviewed', () => {
  // The terms were read from public pages, not reviewed by counsel. Setting
  // reviewed_at would assert a diligence that did not happen.
  // Target the INSERT column list, not the prose: the comment above it explains
  // why reviewed_at is left NULL and legitimately names the column.
  const insertColumns = migration.match(
    /INSERT INTO ops\.source_collection_policy \(([\s\S]*?)\) VALUES/,
  )?.[1];
  assert.ok(insertColumns, 'migration must insert a policy row');
  assert.doesNotMatch(insertColumns, /reviewed_at/);
  assert.match(migration, /'terms_reviewed', false/);
});

test('the FINRA row states the terms conflict rather than burying it', () => {
  // finra.org Terms of Use restrict content to non-commercial use and prohibit
  // bulk collection, derivative works, and use alongside predictive analytics —
  // three of which bracket what this app does. Registering it silently at
  // 'conditional' would have laundered that into an approval.
  assert.match(migration, /COLLECTING UNDER UNRESOLVED TERMS/);
  assert.match(migration, /'review_required'/);
  assert.match(migration, /predictive analytics/);
});

test('each collector keys its record at the unit the source publishes', () => {
  // One companyfacts response is one filer; one Reg SHO file is one trading day.
  assert.match(sec, /providerRecordKey: `CIK\$\{issuer\.cik\}`/);
  assert.match(finra, /providerRecordKey: `regsho-daily:\$\{yyyymmdd\}`/);
});

test('FINRA stores what was published, not the filtered subset', () => {
  // The rows are filtered to the US universe before insert. Hashing the subset
  // would make the content hash describe our filter rather than their file.
  assert.match(finra, /content: body,/);
});

test('both collectors carry the revision onto their rows', () => {
  assert.match(sec, /source_provider, metadata, source_revision_id/);
  assert.match(finra, /available_at,\s*\n\s*source_revision_id/);
  for (const collector of [sec, finra]) {
    assert.match(collector, /registered\.sourceRevisionId,/);
    assert.match(collector, /OPEN_FETCH_RUN_SQL/);
    assert.match(collector, /CLOSE_FETCH_RUN_SQL/);
    assert.doesNotMatch(collector, /'succeeded'/);
  }
});

test('the lineage column is nullable and never backfilled', () => {
  const addColumn = migration.match(/ADD COLUMN IF NOT EXISTS source_revision_id[^;]*/)?.[0];
  assert.ok(addColumn);
  assert.doesNotMatch(addColumn, /NOT NULL/);
  assert.doesNotMatch(migration, /UPDATE market\.short_volume_daily/);
});
