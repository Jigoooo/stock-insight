import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// serving.market_confirmation_v1 exposed industry_link_strength and path_count,
// and both were 0/NULL for all 253 rows since 2026-07-19: they read
// serving.impact_summary_v1, which is empty by construction because its gate
// requires ISSUED_BY edges the v1 path producer never emits. Migration 055
// declared that plane internal-only; this consumer was not moved with it.

const migration = readFileSync(
  new URL(
    '../../../packages/db-schema/src/migrations/059_market_confirmation_reads_v2.ts',
    import.meta.url,
  ).pathname,
  'utf8',
);
const readModel = readFileSync(
  new URL('../src/product/read-model.ts', import.meta.url).pathname,
  'utf8',
);
const collector = readFileSync(
  new URL('../../../ops/scripts/collect-data-health.mjs', import.meta.url).pathname,
  'utf8',
);

test('the summary reads the v2 explanation key, not the v1 one', () => {
  // The v2 producer writes camelCase. Copying v1's `explanation ->> 'event_type'`
  // verbatim yields an array of NULLs that still type-checks and still renders —
  // the failure would surface as blank event chips, not an error.
  assert.match(migration, /explanation ->> 'eventType'/);
  assert.doesNotMatch(migration, /explanation ->> 'event_type'/);
});

test('the summary is scoped to packs the product can actually serve', () => {
  // Scoping to "latest sealed snapshot" instead would let confirmation and the
  // impact brief disagree about which snapshot is live.
  assert.match(migration, /v_relation_graph_freshness/);
  assert.match(migration, /freshness\.servable = true/);
  assert.match(migration, /item\.item_kind = 'impact_path'/);
});

test('confirmation joins the v2 summary', () => {
  const view = migration.slice(
    migration.indexOf('CREATE OR REPLACE VIEW serving.market_confirmation_v1'),
  );
  assert.match(view, /LEFT JOIN serving\.impact_summary_v2 impact/);
  assert.doesNotMatch(view, /LEFT JOIN serving\.impact_summary_v1/);
});

test('numeric casts match the v1 shape the contract expects', () => {
  // node-postgres returns bigint and numeric as strings; the Zod contract wants
  // numbers. v1 cast for this reason and v2 has to keep doing it.
  assert.match(migration, /count\(\*\)::integer AS path_count/);
  assert.match(
    migration,
    /round\(avg\(servable_path\.path_score\)::numeric, 4\) AS avg_path_score/,
  );
});

test('the permanently empty impact endpoint reads v2 too', () => {
  const impactSql = readModel.slice(
    readModel.indexOf('const IMPACT_SQL'),
    readModel.indexOf('const CONFIRMATION_SQL'),
  );
  assert.match(impactSql, /FROM serving\.impact_summary_v2 impact/);
  assert.doesNotMatch(impactSql, /FROM serving\.impact_summary_v1/);
});

test('the health metric does not claim the product renders this', () => {
  // 0 -> 212 under a heading reading "impact reaching the product" would be a
  // true number under a name that promises more, which is the same shape as
  // v_world_event_current_v1 reporting 100% over a frozen plane. No page renders
  // industry_link_strength or path_count; /v1/confirmation is proxied verbatim.
  assert.doesNotMatch(collector, /## Impact reaching the product/);
  assert.match(collector, /## Impact on the serving row/);
  assert.match(collector, /화면에 그리는 곳은 아직 없다/);
});

test('pack freshness travels with the linked-row count', () => {
  // The summary only counts servable packs, so an expiry would drive path_count
  // back toward 0 and read as a coverage collapse rather than a freshness issue.
  assert.match(collector, /servable_packs/);
  assert.match(collector, /servablePacks: Number\(impactLinked\.rows\[0\]\.servable_packs\)/);
});
