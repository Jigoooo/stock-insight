import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertKnowledgeSyncComplete,
  buildKnowledgeSnapshotId,
  buildRevisionEventDedupeKey,
  normalizeSourceRevision,
} from '../src/ingest/knowledge-revision-contract.ts';
import {
  CLAIM_PENDING_DOCUMENTS_SQL,
  INSERT_CLAIM_EVIDENCE_SQL,
  INSERT_EVENT_EVIDENCE_SQL,
  MARK_DOCUMENT_EXTRACTED_SQL,
} from '../src/ingest/run-knowledge-extraction.ts';
import { RECENT_CLAIMS_SQL, RECENT_EVENTS_SQL } from '../src/publish/run-report-publish.ts';

const syncUrl = new URL('../src/ingest/run-knowledge-document-sync.ts', import.meta.url);
const extractionUrl = new URL('../src/ingest/run-knowledge-extraction.ts', import.meta.url);
const reportUrl = new URL('../src/publish/run-report-publish.ts', import.meta.url);
const wrapperUrl = new URL('../scripts/run_knowledge_pipeline.sh', import.meta.url);
const rehearsalUrl = new URL('../scripts/run-knowledge-revision-rehearsal.mjs', import.meta.url);

test('knowledge revision contract rejects malformed revisions and separates event revisions', () => {
  assert.equal(normalizeSourceRevision('2'), 2);
  for (const invalid of [undefined, null, '', '0', '-1', '1.5', 'revision-2']) {
    assert.throws(() => normalizeSourceRevision(invalid));
  }

  const first = buildRevisionEventDedupeKey({
    documentId: 7,
    revisionNo: 1,
    eventType: 'earnings',
    targetMention: 'Example Corp',
  });
  const corrected = buildRevisionEventDedupeKey({
    documentId: 7,
    revisionNo: 2,
    eventType: 'earnings',
    targetMention: 'Example Corp',
  });
  assert.notEqual(first, corrected);
});

test('knowledge sync completion and snapshot lineage fail closed and stay deterministic', () => {
  assert.doesNotThrow(() =>
    assertKnowledgeSyncComplete({ unpromoted: 0, revision_drift: 0, chunks_missing: 0 }),
  );
  for (const field of ['unpromoted', 'revision_drift', 'chunks_missing'] as const) {
    assert.throws(() =>
      assertKnowledgeSyncComplete({
        unpromoted: 0,
        revision_drift: 0,
        chunks_missing: 0,
        [field]: 1,
      }),
    );
  }

  const asOf = '2026-07-27T09:00:00.000Z';
  const evidence = [
    { kind: 'event' as const, id: 2, chunkId: 22, revisionNo: 2 },
    { kind: 'claim' as const, id: 1, chunkId: 11, revisionNo: 1 },
  ];
  assert.equal(
    buildKnowledgeSnapshotId(asOf, evidence),
    buildKnowledgeSnapshotId(asOf, [...evidence].reverse()),
  );
});

test('production evidence and report SQL are reusable by the disposable DB rehearsal', () => {
  assert.match(CLAIM_PENDING_DOCUMENTS_SQL, /FOR UPDATE SKIP LOCKED/);
  assert.match(CLAIM_PENDING_DOCUMENTS_SQL, /processing_status\s*=\s*'chunked'/);
  assert.match(MARK_DOCUMENT_EXTRACTED_SQL, /knowledge_extraction_owner/);
  assert.match(MARK_DOCUMENT_EXTRACTED_SQL, /knowledge_sync_run_id/);
  assert.match(MARK_DOCUMENT_EXTRACTED_SQL, /revision_no/);
  assert.match(MARK_DOCUMENT_EXTRACTED_SQL, /lease_until/);
  assert.match(INSERT_CLAIM_EVIDENCE_SQL, /RETURNING chunk_id/);
  assert.match(INSERT_EVENT_EVIDENCE_SQL, /RETURNING chunk_id/);
  assert.match(RECENT_EVENTS_SQL, /chunk\.revision_no/);
  assert.match(RECENT_CLAIMS_SQL, /chunk\.revision_no/);
});

test('disposable PostgreSQL rehearsal attacks revision, evidence, conflict, and cutoff boundaries', async () => {
  const rehearsal = await readFile(rehearsalUrl, 'utf8');
  assert.match(rehearsal, /CREATE DATABASE/);
  assert.match(rehearsal, /DROP DATABASE IF EXISTS/);
  assert.match(rehearsal, /INSERT_EVENT_EVIDENCE_SQL/);
  assert.match(rehearsal, /INSERT_CLAIM_EVIDENCE_SQL/);
  assert.match(rehearsal, /RECENT_EVENTS_SQL/);
  assert.match(rehearsal, /RECENT_CLAIMS_SQL/);
  assert.match(rehearsal, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(rehearsal, /revisionOneExcluded/);
  assert.match(rehearsal, /conflictingBindingRejected/);
  assert.match(rehearsal, /lateWriteInvisible/);
  assert.match(rehearsal, /failedRunPendingReclaimed/);
  assert.match(rehearsal, /reclaimIdempotent/);
  assert.match(rehearsal, /reclaimedBacklogDrained/);
  assert.match(rehearsal, /staleExtractorRejected/);
  assert.match(rehearsal, /currentExtractorCompleted/);
  assert.match(rehearsal, /cleanupVerified/);
});

test('runtime knowledge sync promotes and revisions RSS documents before extraction', async () => {
  const [sync, wrapper] = await Promise.all([
    readFile(syncUrl, 'utf8'),
    readFile(wrapperUrl, 'utf8'),
  ]);

  assert.match(sync, /FROM public\.source_documents legacy/);
  assert.match(sync, /INSERT INTO knowledge\.document/);
  assert.match(sync, /legacy_source_document_pk/);
  assert.match(sync, /processing_status\s*=\s*'pending'/);
  assert.match(sync, /source_revision_fingerprint/);
  assert.match(sync, /INSERT INTO knowledge\.document_chunk/);
  assert.match(sync, /legacy\.revision_no/);
  assert.match(sync, /sha256\(convert_to/);
  assert.match(sync, /ON CONFLICT \(document_id, revision_no, chunk_index\) DO NOTHING/);
  assert.match(sync, /INSERT INTO knowledge\.document_entity/);
  assert.match(sync, /'legacy_key'/);
  assert.match(sync, /'symbol_exact'/);
  assert.match(sync, /'alias_exact'/);
  assert.match(sync, /pg_advisory_xact_lock/);
  assert.match(sync, /BEGIN ISOLATION LEVEL REPEATABLE READ/);
  assert.match(sync, /knowledge_sync_run_id/);
  assert.match(sync, /export const RECLAIM_PENDING_NEWS_SQL/);
  assert.match(sync, /knowledge_sync_reclaim_history/);
  assert.match(sync, /reclaimed\.rowCount/);
  assert.match(sync, /assertKnowledgeSyncComplete\(after\)/);
  assert.doesNotMatch(sync, /DELETE FROM knowledge\./);

  const syncPosition = wrapper.indexOf('run-knowledge-document-sync.ts --apply');
  const extractionPosition = wrapper.indexOf('run-knowledge-extraction.ts --limit 100 --apply');
  assert.ok(syncPosition >= 0);
  assert.ok(extractionPosition > syncPosition);
  assert.match(wrapper, /stock-insight-knowledge-document-sync-stage/);
  assert.match(wrapper, /KNOWLEDGE_SYNC_RUN_ID/);
  assert.match(wrapper, /while \(\( pending_news > 0 \)\)/);
  assert.match(wrapper, /after_pending >= pending_news/);
  assert.match(wrapper, /pending_news == 0/);
  assert.match(wrapper, /processing_status='chunked'/);
});

test('new extracted events persist exact chunk evidence in the same transaction', async () => {
  const extraction = await readFile(extractionUrl, 'utf8');

  assert.match(extraction, /INSERT INTO knowledge\.event_evidence/);
  assert.match(extraction, /position\(lower\(trim\(\$3\)\) in lower\(chunk\.content\)\)>0/);
  assert.match(extraction, /chunk\.revision_no=\$4/);
  assert.match(extraction, /buildRevisionEventDedupeKey/);
  assert.match(extraction, /RETURNING chunk_id/);
  assert.match(extraction, /SELECT chunk_id FROM inserted[\s\S]*UNION ALL/);
  assert.match(extraction, /bound_chunk_id/);
  assert.match(extraction, /INSERT_EVENT_EVIDENCE_SQL/);
});

test('report publication excludes events without exact evidence', async () => {
  const report = await readFile(reportUrl, 'utf8');

  assert.match(report, /JOIN knowledge\.event_evidence/);
  assert.match(report, /evidence\.event_id=event\.event_id/);
  assert.match(report, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(report, /SELECT clock_timestamp\(\) AS as_of/);
  assert.match(report, /chunk\.revision_no = coalesce/);
  assert.match(report, /chunk\.available_at <= \$1::timestamptz/);
  assert.match(report, /chunk\.ingested_at <= \$1::timestamptz/);
  assert.match(report, /buildKnowledgeSnapshotId/);
});
