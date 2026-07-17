import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createConcurrencyGate,
  createLoginRateLimiter,
  normalizedClientKey,
} from '../src/server/auth/login-rate-limit.ts';

describe('login rate limiter', () => {
  it('blocks attempts beyond the configured window limit', () => {
    let now = 1_000;
    const limiter = createLoginRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    assert.deepEqual(limiter.consume('ip:account'), { allowed: true, retryAfterSeconds: 0 });
    assert.deepEqual(limiter.consume('ip:account'), { allowed: true, retryAfterSeconds: 0 });
    assert.deepEqual(limiter.consume('ip:account'), { allowed: true, retryAfterSeconds: 0 });
    assert.deepEqual(limiter.consume('ip:account'), { allowed: false, retryAfterSeconds: 60 });

    now += 60_000;
    assert.deepEqual(limiter.consume('ip:account'), { allowed: true, retryAfterSeconds: 0 });
  });

  it('isolates keys and resets the successful login key', () => {
    const limiter = createLoginRateLimiter({ limit: 1, windowMs: 60_000, now: () => 10 });

    assert.equal(limiter.consume('first').allowed, true);
    assert.equal(limiter.consume('first').allowed, false);
    assert.equal(limiter.consume('second').allowed, true);
    limiter.reset('first');
    assert.equal(limiter.consume('first').allowed, true);
  });

  it('fails closed instead of evicting active buckets under hostile cardinality', () => {
    const limiter = createLoginRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxKeys: 2,
      now: () => 10,
    });

    limiter.consume('first');
    limiter.consume('second');
    limiter.consume('third');

    assert.equal(limiter.size(), 2);
    assert.equal(limiter.consume('first').allowed, false);
    assert.equal(limiter.consume('third').allowed, false);
  });

  it('bounds concurrent expensive password verifications', () => {
    const gate = createConcurrencyGate(2);
    const releaseFirst = gate.tryAcquire();
    const releaseSecond = gate.tryAcquire();
    assert.ok(releaseFirst);
    assert.ok(releaseSecond);
    assert.equal(gate.active(), 2);
    assert.equal(gate.tryAcquire(), undefined);
    releaseFirst();
    releaseFirst();
    assert.equal(gate.active(), 1);
    assert.ok(gate.tryAcquire());
  });

  it('trusts only the Cloudflare-overwritten client header', () => {
    assert.equal(
      normalizedClientKey(
        new Headers({
          'cf-connecting-ip': '203.0.113.10',
          'x-forwarded-for': '203.0.113.11',
          'x-real-ip': '203.0.113.12',
        }),
      ),
      '203.0.113.10',
    );
    assert.equal(
      normalizedClientKey(new Headers({ 'x-stock-client-ip': '2001:DB8::1' })),
      'unknown',
    );
    assert.equal(
      normalizedClientKey(new Headers({ 'cf-connecting-ip': '2001:DB8::1' })),
      '2001:db8::1',
    );
    assert.equal(normalizedClientKey(new Headers({ 'cf-connecting-ip': 'spoofed' })), 'unknown');
  });
});
