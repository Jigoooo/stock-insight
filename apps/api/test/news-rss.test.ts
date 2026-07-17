import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNewsIngestAudit,
  canonicalizeNewsUrl,
  parsePublishedAt,
  toSourceDocumentSeed,
} from '../src/ingest/news-rss.ts';

test('canonicalizeNewsUrl removes tracking and fragments but preserves semantic query', () => {
  assert.equal(
    canonicalizeNewsUrl('HTTPS://Example.COM:443/story?id=7&utm_source=rss&gclid=x#section'),
    'https://example.com/story?id=7',
  );
  assert.equal(canonicalizeNewsUrl('javascript:alert(1)'), undefined);
});

test('parsePublishedAt accepts RFC 822 and rejects invalid values', () => {
  assert.equal(parsePublishedAt('Fri, 17 Jul 2026 10:00:00 GMT'), '2026-07-17T10:00:00.000Z');
  assert.equal(parsePublishedAt('not-a-date'), undefined);
});

test('source document seed is deterministic by canonical URL', () => {
  const now = '2026-07-18T00:00:00.000Z';
  const first = toSourceDocumentSeed(
    {
      title: 'Market update',
      url: 'https://example.com/a?utm_source=rss',
      source: 'Example Feed',
      region: 'overseas',
      kind: 'news',
      when: 'Fri, 17 Jul 2026 10:00:00 GMT',
    },
    now,
  );
  const second = toSourceDocumentSeed(
    {
      title: 'Market update',
      url: 'https://example.com/a',
      source: 'Example Feed',
    },
    now,
  );
  if (!first || !second) throw new Error('expected valid source document seeds');
  assert.equal(first.sourceKey, second.sourceKey);
  assert.equal(first.contentHash.length, 64);
  assert.equal(first.revisionFingerprint.length, 64);
  assert.equal(first.providerKey, 'rss:example-feed');
  assert.equal(first.validAt, '2026-07-17T10:00:00.000Z');
});

test('audit skips invalid rows and deduplicates canonical URLs', () => {
  const audit = buildNewsIngestAudit(
    {
      items: [
        { title: 'A', url: 'https://example.com/a?utm_medium=rss', source: 'Feed' },
        { title: 'A duplicate', url: 'https://example.com/a', source: 'Feed' },
        { title: '', url: 'https://example.com/b', source: 'Feed' },
      ],
      errors: { BrokenFeed: 'timeout' },
    },
    '2026-07-18T00:00:00.000Z',
  );
  assert.equal(audit.collected, 3);
  assert.equal(audit.eligible, 1);
  assert.equal(audit.duplicateUrls, 1);
  assert.equal(audit.skipped, 1);
  assert.equal(audit.feedErrors, 1);
});
