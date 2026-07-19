import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const migration = read('../../../packages/db-schema/src/migrations/018_backend_truth_gate.ts');
const graphInference = read('../src/analytics/run-graph-inference.ts');
const schemaIndex = read('../../../packages/db-schema/src/index.ts');

// B0 RED case 3: impact paths whose edges lack immutable source evidence must
// not be exposed through the serving read surface.
test('migration 018 gates serving impact exposure on per-edge relation evidence', () => {
  assert.match(schemaIndex, /018_backend_truth_gate/);
  assert.match(migration, /CREATE OR REPLACE VIEW serving\.impact_summary_v1/);
  assert.match(migration, /unnest\(path\.path_edges\)/);
  assert.match(migration, /knowledge\.relation_evidence/);
  // Every edge must be evidence-backed: reject paths containing any edge without evidence.
  assert.match(migration, /NOT EXISTS/);
  // Empty edge arrays are not evidence-backed paths either.
  assert.match(migration, /cardinality\(path\.path_edges\) > 0/);
});

test('migration 018 preserves read grants on the replaced view', () => {
  assert.match(migration, /GRANT SELECT ON serving\.impact_summary_v1 TO/);
});

test('graph inference annotates per-path source-evidence backing', () => {
  assert.match(graphInference, /source_backed/);
  assert.match(graphInference, /relation_evidence/);
});
