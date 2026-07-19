import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const reportPublish = read('../src/publish/run-report-publish.ts');
const eventBrief = read('../src/publish/run-event-brief.ts');

// B0 RED case 2: a same-day rerun must refresh run lineage metadata instead of
// silently reusing the previous run's as_of/data_cutoff/knowledge_snapshot_id.
test('report run upsert refreshes cutoff and snapshot lineage on conflict', () => {
  for (const source of [reportPublish, eventBrief]) {
    assert.match(source, /ON CONFLICT \(report_definition_id, scheduled_for, pipeline_version\)/);
    assert.match(source, /as_of = EXCLUDED\.as_of/);
    assert.match(source, /data_cutoff = EXCLUDED\.data_cutoff/);
    assert.match(source, /knowledge_snapshot_id = EXCLUDED\.knowledge_snapshot_id/);
    assert.match(source, /finished_at = NULL/);
  }
});

test('report publish keeps the atomic pointer swap inside one transaction', () => {
  // Guard the existing atomicity: supersede + publish + pointer swap + run close
  // must all remain between one BEGIN/COMMIT pair (no interleaved COMMIT).
  const applyBlock = reportPublish.slice(
    reportPublish.indexOf('const knowledgeSnapshotId'),
    reportPublish.indexOf("mode: 'apply'"),
  );
  const commits = applyBlock.match(/client\.query\('COMMIT'\)/g) ?? [];
  assert.equal(commits.length, 1);
  assert.ok(applyBlock.indexOf('SUPERSEDE_SQL') < applyBlock.indexOf('PUBLISH_SQL'));
  assert.ok(applyBlock.indexOf('PUBLISH_SQL') < applyBlock.indexOf('SWAP_POINTER_SQL'));
  assert.ok(applyBlock.indexOf('SWAP_POINTER_SQL') < applyBlock.indexOf("client.query('COMMIT')"));
});
