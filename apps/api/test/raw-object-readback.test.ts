import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readRawObjectVerified, writeRawObject } from '../src/ingest/raw-object-store.ts';

test('B2 raw object readback verifies immutable bytes and fails closed on tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stock-insight-b2-'));
  const stored = await writeRawObject({
    providerKey: 'fixture:source',
    content: 'original immutable bytes',
    extension: 'txt',
    fetchedAt: new Date('2026-07-19T00:00:00Z'),
    root,
  });
  const body = await readRawObjectVerified(stored);
  assert.equal(body.toString('utf8'), 'original immutable bytes');

  await writeFile(stored.objectUri.slice('file://'.length), 'tampered bytes');
  await assert.rejects(() => readRawObjectVerified(stored), /hash mismatch/);
  await assert.rejects(
    () => readRawObjectVerified({ objectUri: 'https://example.test/raw', contentHash: stored.contentHash }),
    /unsupported raw object URI/,
  );
});
