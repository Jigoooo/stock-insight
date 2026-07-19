import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const wrapper = read('../scripts/run_knowledge_pipeline.sh');
const extraction = read('../src/ingest/run-knowledge-extraction.ts');
const gates = JSON.parse(
  read('../../../docs/plan/insight-platform-backend-db-v2/backend-db-gates.json'),
) as {
  $schema_version: string;
  gates: Array<{
    id: string;
    kind: 'sql' | 'test';
    fail_closed: boolean;
    threshold: { operator: string; value: number } | null;
    sql?: string;
    command?: string;
  }>;
};

// B0 RED case 5: a successful wrapper must not mask a non-news pending backlog.
test('knowledge wrapper fails closed on unaccounted pending documents', () => {
  // Pending documents outside the explicit allowlist (news in-flight, disclosure
  // known-backlog until B4) must fail the wrapper readback.
  assert.match(wrapper, /processing_status='pending'/);
  assert.match(wrapper, /NOT IN \('news','disclosure'\)/);
  // Fresh news must drain: pending news older than the ingest SLA fails closed.
  assert.match(wrapper, /source_type='news'[\s\S]*interval '6 hours'/);
  // The wrapper records the known backlog as an explicit gauge instead of hiding it.
  assert.match(wrapper, /stock-insight-knowledge-backlog/);
  assert.match(wrapper, /pending_disclosure/);
});

test('extraction runner owns the skip policy for non-knowledge source types', () => {
  assert.match(extraction, /NON_EXTRACTION_SOURCE_TYPES/);
  for (const sourceType of ['macro_api', 'market_api', 'briefing_link', 'candidate_source']) {
    assert.match(extraction, new RegExp(sourceType));
  }
  assert.match(extraction, /'skipped'/);
  assert.match(extraction, /skip_reason/);
});

test('machine-readable B0 gates are defined, versioned and fail-closed', () => {
  assert.equal(gates.$schema_version, '1.0.0');
  const ids = gates.gates.map((gate) => gate.id);
  for (const id of [
    'b0-unverified-public-fact-zero',
    'b0-report-run-lineage-refresh',
    'b0-sourceless-impact-exposure-zero',
    'b0-stale-available-detection',
    'b0-non-news-backlog-unmasked',
  ]) {
    assert.ok(ids.includes(id), `missing gate ${id}`);
  }
  for (const gate of gates.gates) {
    assert.equal(gate.fail_closed, true);
    if (gate.kind === 'sql') {
      assert.ok(gate.sql && gate.sql.length > 0);
      assert.ok(gate.threshold, `sql gate ${gate.id} needs a threshold`);
    } else {
      assert.ok(gate.command && gate.command.length > 0);
    }
  }
});
