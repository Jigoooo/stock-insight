import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const runner = read('../src/analytics/run-v2-graph-publish.ts');
// The lineage machinery moved out of the runner so a second publisher can emit a
// different pack kind without duplicating it. The contract below is unchanged —
// it is now enforced in the shared module every publisher goes through.
const publisher = read('../src/relations/content-pack-publisher.ts');
const rawStore = read('../src/ingest/raw-object-store.ts');
const sourceStore = read('../src/ingest/source-revision-store.ts');
const pipeline = read('../scripts/run_analytics_pipeline.sh');

test('V2 publisher refuses an active foreign claim and only replays completed daily claims', () => {
  assert.match(runner, /SELECT claim_status,completed_at[\s\S]*FROM ops\.pipeline_run_claim/);
  assert.match(runner, /claim_status !== 'completed'[\s\S]*claim is owned by another active run/);
  assert.doesNotMatch(runner, /outcome:\s*['"]not_claimed['"]/);
  assert.match(pipeline, /natural_run_key LIKE 'v2-graph-publish:'[\s\S]*claim_status='completed'/);
  assert.match(pipeline, /serving\.v_relation_graph_freshness[\s\S]*servable=true/);
});

test('V2 publisher seals one typed derivation before every content-pack item insert', () => {
  assert.match(publisher, /INSERT INTO knowledge\.derivation/);
  assert.match(publisher, /INSERT INTO knowledge\.derivation_step/);
  assert.match(publisher, /INSERT INTO knowledge\.derivation_input/);
  assert.match(
    publisher,
    /status='sealed'[\s\S]*knowledge\.compute_derivation_digest\(derivation\.derivation_id\)/,
  );
  assert.match(publisher, /content_pack_id,item_no,item_kind,derivation_id,relation_revision_id/);
  assert.ok(
    publisher.indexOf('INSERT INTO knowledge.derivation') <
      publisher.indexOf('INSERT INTO serving.content_pack_item'),
  );
});

test('the shared publisher supersedes only its own pack kind', () => {
  // With two publishers writing packs, a supersede scoped by status alone — or by
  // a hardcoded kind — would have each run retire the other publisher's packs.
  assert.match(
    publisher,
    /SET status='superseded'\s*\n\s*WHERE pack_kind=\$1 AND status='published' AND graph_snapshot_id<>\$2/,
  );
  assert.match(publisher, /\[options\.packKind, options\.graphSnapshotId\]/);
  assert.doesNotMatch(publisher, /const PACK_KIND/);
});

test('raw registration detects overlapping applicable source contracts', () => {
  assert.match(
    rawStore,
    /FROM ingestion\.source_contract_revision[\s\S]*ORDER BY revision_no DESC,known_from DESC[\s\S]*LIMIT 2/,
  );
  assert.match(rawStore, /contract\.rows\.length !== 1/);
});

test('source revision locking uses a namespaced bigint advisory hash', () => {
  assert.match(
    sourceStore,
    /pg_advisory_xact_lock\([\s\S]*hashtextextended\('ingestion\.source_record_identity:' \|\| \$1::text, 0\)/,
  );
  assert.doesNotMatch(sourceStore, /pg_advisory_xact_lock\(\$1,\s*\$2\)/);
});
