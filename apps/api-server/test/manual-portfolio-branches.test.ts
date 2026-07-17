import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handlePositionClose,
  handlePositionUpsert,
  handleWatchlistRemove,
  handleWatchlistUpsert,
} from '../dist/index.js';

const VALID_KEY = '3f2b8c1a-9d4e-4f6a-8b2c-1d3e5f7a9b0c';

const disabledDeps = {
  resolvePolicy: () => ({
    enabled: false,
    status: 503,
    errorCode: 'MANUAL_PORTFOLIO_MUTATIONS_DISABLED',
  }),
  routeDatabase: () => {
    throw new Error('must not touch db when disabled');
  },
};

const enabledNoDbDeps = {
  resolvePolicy: () => ({ enabled: true }),
  routeDatabase: () => undefined,
};

test('disabled policy short-circuits with 503 disabled envelope (db untouched)', async () => {
  const result = await handleWatchlistUpsert(
    VALID_KEY,
    { market: 'KR', ticker: '005930' },
    disabledDeps,
  );
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'MANUAL_PORTFOLIO_MUTATIONS_DISABLED');
  assert.equal(result.body.availability, 'error');
  assert.equal(result.body.meta.source, 'fallback');
});

test('invalid body fails 400 BEFORE policy/idempotency checks (legacy order)', async () => {
  const result = await handleWatchlistUpsert(undefined, { market: 'KR' }, disabledDeps);
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'MANUAL_PORTFOLIO_BAD_REQUEST');
});

test('missing idempotency key → 428', async () => {
  const result = await handleWatchlistUpsert(
    undefined,
    { market: 'KR', ticker: '005930' },
    enabledNoDbDeps,
  );
  assert.equal(result.status, 428);
  assert.equal(result.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('whitespace-only idempotency key → 428 (trim parity)', async () => {
  const result = await handlePositionUpsert(
    '   ',
    { market: 'US', ticker: 'AAPL' },
    enabledNoDbDeps,
  );
  assert.equal(result.status, 428);
});

test('malformed idempotency key → 400 with format message', async () => {
  const result = await handleWatchlistUpsert(
    'not-a-uuid',
    { market: 'KR', ticker: '005930' },
    enabledNoDbDeps,
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error.message, 'Idempotency-Key 형식이 올바르지 않습니다.');
});

test('db unavailable → 503 DATABASE_WRITE_URL_NOT_CONFIGURED', async () => {
  const result = await handleWatchlistUpsert(
    VALID_KEY,
    { market: 'KR', ticker: '005930' },
    enabledNoDbDeps,
  );
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'DATABASE_WRITE_URL_NOT_CONFIGURED');
});

test('blank entityKey on remove → 400 with entityKey message (before idempotency)', async () => {
  const result = await handleWatchlistRemove(undefined, '   ', enabledNoDbDeps);
  assert.equal(result.status, 400);
  assert.equal(result.body.error.message, 'entityKey가 필요합니다.');
});

test('blank entityKey on position close → 400', async () => {
  const result = await handlePositionClose(undefined, ' ', enabledNoDbDeps);
  assert.equal(result.status, 400);
});
