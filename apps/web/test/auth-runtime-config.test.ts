import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadAuthRuntimeConfig } from '../src/server/auth/auth-runtime-config.ts';

const validEnv = {
  STOCK_INSIGHT_AUTH_USERNAME: 'jigoo',
  STOCK_INSIGHT_AUTH_PASSWORD_RECORD_FILE: '/run/secrets/stock-insight-password-record',
  STOCK_INSIGHT_AUTH_ENROLLMENT_TOKEN_HASH_FILE: '/run/secrets/stock-insight-enrollment-token-hash',
  STOCK_INSIGHT_SESSION_SECRET_FILE: '/run/secrets/stock-insight-session-secret',
  STOCK_INSIGHT_APP_ORIGIN: 'https://stock.jigooo.com',
};

const readSecret = async (path: string) => {
  if (path.endsWith('password-record')) return 'scrypt$fixture-record\n';
  if (path.endsWith('enrollment-token-hash')) return `${'ab'.repeat(32)}\n`;
  if (path.endsWith('session-secret')) return '0123456789abcdef0123456789abcdef\n';
  throw new Error('missing fixture');
};

describe('authentication runtime configuration', () => {
  it('loads trimmed credentials from absolute secret-file paths', async () => {
    assert.deepEqual(await loadAuthRuntimeConfig(validEnv, readSecret), {
      staticCredential: {
        username: 'jigoo',
        passwordRecord: 'scrypt$fixture-record',
      },
      enrollmentTokenHash: 'ab'.repeat(32),
      sessionSecret: '0123456789abcdef0123456789abcdef',
      appOrigin: 'https://stock.jigooo.com',
      sessionTtlSeconds: 28_800,
    });
  });

  it('supports DB-only authentication after the static credential is retired', async () => {
    const config = await loadAuthRuntimeConfig(
      {
        STOCK_INSIGHT_SESSION_SECRET_FILE: validEnv.STOCK_INSIGHT_SESSION_SECRET_FILE,
        STOCK_INSIGHT_APP_ORIGIN: validEnv.STOCK_INSIGHT_APP_ORIGIN,
      },
      readSecret,
    );

    assert.equal(config.staticCredential, undefined);
    assert.equal(config.enrollmentTokenHash, undefined);
  });

  it('allows loopback HTTP for isolated candidate verification', async () => {
    const config = await loadAuthRuntimeConfig(
      { ...validEnv, STOCK_INSIGHT_APP_ORIGIN: 'http://127.0.0.1:8092' },
      readSecret,
    );
    assert.equal(config.appOrigin, 'http://127.0.0.1:8092');
  });

  it('accepts a bounded explicit session TTL', async () => {
    const config = await loadAuthRuntimeConfig(
      { ...validEnv, STOCK_INSIGHT_SESSION_TTL_SECONDS: '3600' },
      readSecret,
    );
    assert.equal(config.sessionTtlSeconds, 3600);
  });

  for (const source of [
    {},
    { ...validEnv, STOCK_INSIGHT_AUTH_USERNAME: 'bad user' },
    { ...validEnv, STOCK_INSIGHT_AUTH_PASSWORD_RECORD_FILE: 'relative/password' },
    { ...validEnv, STOCK_INSIGHT_AUTH_PASSWORD_RECORD_FILE: undefined },
    { ...validEnv, STOCK_INSIGHT_AUTH_USERNAME: undefined },
    { ...validEnv, STOCK_INSIGHT_SESSION_SECRET_FILE: '../secret' },
    { ...validEnv, STOCK_INSIGHT_APP_ORIGIN: 'http://stock.jigooo.com' },
    { ...validEnv, STOCK_INSIGHT_APP_ORIGIN: 'https://stock.jigooo.com/path' },
    { ...validEnv, STOCK_INSIGHT_SESSION_TTL_SECONDS: '0' },
    { ...validEnv, STOCK_INSIGHT_SESSION_TTL_SECONDS: '86401' },
  ]) {
    it('fails closed for malformed non-secret configuration', async () => {
      await assert.rejects(
        loadAuthRuntimeConfig(source, readSecret),
        new Error('Invalid authentication runtime configuration'),
      );
    });
  }

  it('fails closed for a malformed enrollment token hash without exposing it', async () => {
    await assert.rejects(
      loadAuthRuntimeConfig(validEnv, async (path) =>
        path.endsWith('enrollment-token-hash') ? 'not-a-sha256-hash' : readSecret(path),
      ),
      new Error('Invalid authentication runtime configuration'),
    );
  });

  it('fails closed without exposing short secret contents', async () => {
    const shortSecret = async (path: string) =>
      path.endsWith('password-record') ? 'record' : 'too-short';

    await assert.rejects(
      loadAuthRuntimeConfig(validEnv, shortSecret),
      new Error('Invalid authentication runtime configuration'),
    );
  });
});
