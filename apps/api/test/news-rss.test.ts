import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNewsIngestAudit,
  canonicalizeNewsUrl,
  parsePublishedAt,
  toSourceDocumentSeed,
  validateRssNewsBundle,
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
      summary: 'Feed-provided article synopsis.',
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
  assert.equal(first.summary, 'Feed-provided article synopsis.');
  assert.equal(first.rawJson.feedSummaryPresent, true);
  assert.notEqual(first.contentHash, second.contentHash, 'summary changes content identity');
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

test('RSS runtime contract rejects malformed, total-failure and stale/future cache bundles', () => {
  const item = {
    title: 'A', url: 'https://example.com/a', source: 'Feed',
    region: 'overseas', kind: 'news', when: '', summary: '',
  };
  const valid = {
    items: [item], by: { 'overseas/news': 1 }, errors: {},
    stats: { feeds_tried: 2, collected: 1, errors: 0, cache_hit: false },
  };
  assert.equal(validateRssNewsBundle(valid), valid);
  assert.throws(() => validateRssNewsBundle({}), /requires items/);
  assert.throws(() => validateRssNewsBundle({
    ...valid, items: [], by: {}, errors: { a: 'x', b: 'x' },
    stats: { feeds_tried: 2, collected: 0, errors: 2, cache_hit: false },
  }), /no verified successful feed/);
  assert.throws(() => validateRssNewsBundle({
    ...valid,
    stats: { ...valid.stats, cache_hit: true, cache_stale_fallback: true },
    cache: { key: 'k', created_at_epoch: 100 },
  }, { nowMs: 100_000 }), /stale cache fallback/);
  assert.throws(() => validateRssNewsBundle({
    ...valid,
    stats: { ...valid.stats, cache_hit: true },
    cache: { key: 'k', created_at_epoch: 101 },
  }, { nowMs: 100_000 }), /future-dated or too old/);
});
