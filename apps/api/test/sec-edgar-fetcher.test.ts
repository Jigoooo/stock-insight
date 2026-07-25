import assert from 'node:assert/strict';
import test from 'node:test';

import { createSecFetcher } from '../src/backfill/sec-edgar-fetcher.ts';

function response(status: number, body = '{}'): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

test('SEC fetcher stops after one HTTP 403 without retrying', async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  const fetcher = createSecFetcher('stock-insight test contact@example.com', {
    async fetchImpl() {
      attempts += 1;
      return response(403);
    },
    async sleep(milliseconds) {
      sleeps.push(milliseconds);
    },
    now: () => 1_000,
  });

  await assert.rejects(fetcher.fetchJson('https://www.sec.gov/files/company_tickers.json'), /403/);
  assert.equal(attempts, 1);
  assert.deepEqual(sleeps, []);
});

test('SEC fetcher retries HTTP 429 exactly three times with bounded backoff', async () => {
  let attempts = 0;
  let now = 1_000;
  const sleeps: number[] = [];
  const fetcher = createSecFetcher('stock-insight test contact@example.com', {
    async fetchImpl() {
      attempts += 1;
      return response(429);
    },
    async sleep(milliseconds) {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
    now: () => now,
  });

  await assert.rejects(fetcher.fetchJson('https://www.sec.gov/files/company_tickers.json'), /429/);
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [2_000, 4_000]);
});

test('SEC fetcher enforces request spacing and sends the configured User-Agent', async () => {
  let now = 1_000;
  const sleeps: number[] = [];
  const userAgents: string[] = [];
  const fetcher = createSecFetcher('stock-insight test contact@example.com', {
    async fetchImpl(_input, init) {
      userAgents.push(new Headers(init?.headers).get('User-Agent') ?? '');
      return response(200, '{"ok":true}');
    },
    async sleep(milliseconds) {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
    now: () => now,
  });

  await fetcher.fetchJson('https://www.sec.gov/a.json');
  await fetcher.fetchJson('https://www.sec.gov/b.json');
  assert.deepEqual(sleeps, [250]);
  assert.deepEqual(userAgents, [
    'stock-insight test contact@example.com',
    'stock-insight test contact@example.com',
  ]);
});
