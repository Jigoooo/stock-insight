import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const MIGRATIONS_DIR = new URL('../../../packages/db-schema/src/migrations/', import.meta.url);
const graphInference = read('../src/analytics/run-graph-inference.ts');
const schemaIndex = read('../../../packages/db-schema/src/index.ts');

/**
 * The migrations that redefine serving.impact_summary_v1, in numeric order.
 *
 * This file used to read migration 018 by name, and that is exactly how it went
 * stale: migration 023 replaced the view on the same day 018 shipped, and this
 * test kept asserting properties of a definition the database had not run for two
 * weeks — passing the whole time. Locating the owner dynamically means the test
 * cannot describe a dead formula again.
 */
function migrationsDefiningImpactSummary(): Array<{ id: string; body: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => ({
      id: name.replace(/\.ts$/, ''),
      body: readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8'),
    }))
    .filter((entry) => /CREATE OR REPLACE VIEW serving\.impact_summary_v1/.test(entry.body));
}

test('the migration that currently owns serving.impact_summary_v1 is the one asserted', () => {
  const owners = migrationsDefiningImpactSummary();
  assert.ok(owners.length > 0, 'no migration defines serving.impact_summary_v1');

  // If this fails, a newer migration took ownership and the assertions below
  // describe someone else's definition — which is the failure this test exists
  // to make loud.
  assert.equal(owners.at(-1)!.id, '023_temporal_relation_ledger');
  for (const owner of owners) assert.match(schemaIndex, new RegExp(owner.id));
});

test('the live gate requires every path edge to resolve to a currently accepted relation', () => {
  const current = migrationsDefiningImpactSummary().at(-1)!.body;
  assert.match(current, /unnest\(path\.path_edges\)/);
  assert.match(current, /serving\.relation_current_v1/);
  // Reject a path containing any edge that does not resolve.
  assert.match(current, /NOT EXISTS/);
  // An empty edge array is not an evidence-backed path either. Whitespace around
  // the operator varies between migrations, so do not pin it.
  assert.match(current, /cardinality\(path\.path_edges\)\s*>\s*0/);
});

test('every migration that replaces the view restores its read grants', () => {
  // The first migration creates it; the ones after replace something the reader
  // role already depends on, so each has to hand the grant back.
  for (const owner of migrationsDefiningImpactSummary().slice(1)) {
    assert.match(
      owner.body,
      /GRANT SELECT ON serving\.impact_summary_v1 TO/,
      `${owner.id} replaces the view without restoring its grants`,
    );
  }
});

test('graph inference is declared internal-only rather than silently unservable', () => {
  // The producer keeps running: 44,658 paths a night that no serving surface can
  // expose, because its predicate allowlist and the gate's requirement are
  // disjoint sets. That is now stated at the top of the file instead of being
  // folklore, and migration 055 records it on the objects themselves.
  assert.match(graphInference, /INTERNAL ANALYSIS ONLY/);
  assert.match(graphInference, /ISSUED_BY/);
  // The tempting "fix" this comment exists to block: adding ISSUED_BY to the
  // allowlist would make the join succeed while publishing unbacked claims.
  assert.doesNotMatch(graphInference, /^\s*'ISSUED_BY',$/m);
});
