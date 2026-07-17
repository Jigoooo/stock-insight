import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ASSERT_NEWS_REVISION_LEDGER_SQL,
  LOAD_PENDING_TRANSLATIONS_SQL,
  UPDATE_TRANSLATION_SQL,
  UPSERT_SOURCE_DOCUMENT_SQL,
} from '../src/ingest/news-persistence.ts';

const marketNewsUrl = new URL('../src/market-news/read-model.ts', import.meta.url);

test('RSS apply fails closed unless the revision ledger triggers exist', () => {
  assert.match(ASSERT_NEWS_REVISION_LEDGER_SQL, /trg_prepare_source_document/);
  assert.match(ASSERT_NEWS_REVISION_LEDGER_SQL, /trg_record_source_document_revision/);
  assert.match(ASSERT_NEWS_REVISION_LEDGER_SQL, /ops\.source_document_revision/);
});

test('RSS upsert is a semantic no-op and invalidates translations only for a new revision', () => {
  assert.match(UPSERT_SOURCE_DOCUMENT_SQL, /ON CONFLICT \(source_key\) DO UPDATE/i);
  assert.match(UPSERT_SOURCE_DOCUMENT_SQL, /title_ko = NULL/i);
  assert.match(UPSERT_SOURCE_DOCUMENT_SQL, /summary_ko = NULL/i);
  assert.match(UPSERT_SOURCE_DOCUMENT_SQL, /translated_at = NULL/i);
  assert.match(UPSERT_SOURCE_DOCUMENT_SQL, /DO UPDATE SET[\s\S]+WHERE[\s\S]+IS DISTINCT FROM/i);
  assert.match(
    UPSERT_SOURCE_DOCUMENT_SQL,
    /valid_at = coalesce\(EXCLUDED\.published_at, public\.source_documents\.valid_at\)/i,
  );
});

test('translation write is compare-and-set bound to the source revision', () => {
  assert.match(LOAD_PENDING_TRANSLATIONS_SQL, /revision_fingerprint/i);
  assert.match(UPDATE_TRANSLATION_SQL, /revision_fingerprint = \$4/i);
  assert.match(UPDATE_TRANSLATION_SQL, /title_ko IS NULL/i);
});

test('market news excludes signal-linked RSS only when the publication feed actually matches', async () => {
  const source = await readFile(marketNewsUrl, 'utf8');
  assert.match(source, /FROM public\.market_signals signal/i);
  assert.match(source, /JOIN publication_feed publication/i);
  assert.match(source, /signal\.source_document_id = document\.id/i);
  assert.match(source, /publication\.title/i);
  assert.match(source, /INTERVAL '7 days'/i);
});
