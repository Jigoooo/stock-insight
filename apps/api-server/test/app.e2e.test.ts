import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../dist/index.js';

// Data routes require a signed internal context; health/meta are public. These
// tests only exercise public/liveness routes, so a fixed test secret suffices.
const TEST_INTERNAL_SECRET = 'test-internal-context-secret-0123456789';

async function buildTestApp() {
  const app = await createApp({ internalContextSecret: TEST_INTERNAL_SECRET });
  await app.init();
  const instance = app.getHttpAdapter().getInstance();
  await instance.ready();
  return { app, instance };
}

test('GET /health returns ok with db status (no prefix)', async () => {
  const { app, instance } = await buildTestApp();
  try {
    const res = await instance.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      service: string;
      checkedAt: string;
      db: { status: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.service, 'stock-insight-api-server');
    assert.ok(new Date(body.checkedAt).getTime() > 0);
    assert.ok(['ok', 'disabled', 'error'].includes(body.db.status));
    if (!process.env.DATABASE_URL) {
      assert.equal(body.db.status, 'disabled');
    }
  } finally {
    await app.close();
  }
});

test('GET /v1/meta returns service metadata under versioned prefix', async () => {
  const { app, instance } = await buildTestApp();
  try {
    const res = await instance.inject({ method: 'GET', url: '/v1/meta' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as { service: string; apiVersion: string };
    assert.equal(body.service, 'stock-insight-api-server');
    assert.equal(body.apiVersion, 'v1');
  } finally {
    await app.close();
  }
});

test('GET /meta without prefix is 404 (prefix enforced)', async () => {
  const { app, instance } = await buildTestApp();
  try {
    const res = await instance.inject({ method: 'GET', url: '/meta' });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('data routes fail closed with 401 when no internal context is present', async () => {
  const { app, instance } = await buildTestApp();
  try {
    const res = await instance.inject({ method: 'GET', url: '/v1/workspace' });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body) as { error?: { code?: string } };
    assert.equal(body.error?.code, 'UNAUTHORIZED');
  } finally {
    await app.close();
  }
});

test('unknown route returns structured 404', async () => {
  const { app, instance } = await buildTestApp();
  try {
    const res = await instance.inject({ method: 'GET', url: '/v1/does-not-exist' });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('live listen on ephemeral port serves /health over real socket', async () => {
  const app = await createApp({ internalContextSecret: TEST_INTERNAL_SECRET });
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const url = await app.getUrl();
    const res = await fetch(`${url.replace('[::1]', '127.0.0.1')}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  } finally {
    await app.close();
  }
});

test(
  'db probe reaches PostgreSQL when TEST_DATABASE_URL is provided',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { app, instance } = await buildTestApp();
    try {
      const res = await instance.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body) as { db: { status: string; latencyMs?: number } };
      assert.equal(body.db.status, 'ok');
      assert.ok((body.db.latencyMs ?? -1) >= 0);
    } finally {
      await app.close();
      delete process.env.DATABASE_URL;
    }
  },
);
