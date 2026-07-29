import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const webSource = new URL('../src/', import.meta.url);
const privateApiRoutes = [
  'routes/api/dashboard/today.ts',
  'routes/api/discover/stocks.ts',
  'routes/api/entities/$entityKey/relations.ts',
  'routes/api/feed.ts',
  'routes/api/history.ts',
  'routes/api/market-news.ts',
  'routes/api/me/bootstrap.ts',
  'routes/api/my-research.ts',
  'routes/api/portfolio/digest.ts',
  'routes/api/positions.ts',
  'routes/api/positions/$entityKey.ts',
  'routes/api/radar.ts',
  'routes/api/records/$recordKey.ts',
  'routes/api/stocks.ts',
  'routes/api/stocks/$entityKey.ts',
  'routes/api/status.ts',
  'routes/api/themes.ts',
  'routes/api/watchlist.ts',
  'routes/api/watchlist/$entityKey.ts',
  'routes/api/workspace.ts',
];

const readSource = (path: string) => readFile(new URL(path, webSource), 'utf8');

describe('private authentication boundaries', () => {
  it('protects the private workspace server function inside the data boundary', async () => {
    const source = await readSource('pages/dashboard/model/load-workspace-bootstrap.ts');
    assert.match(source, /authFunctionMiddleware/);
    assert.match(source, /\.middleware\(\[authFunctionMiddleware\]\)/);
  });

  it('protects every existing private JSON route with request auth middleware', async () => {
    for (const path of privateApiRoutes) {
      const source = await readSource(path);
      assert.match(source, /authRequestMiddleware/, `${path} must import authRequestMiddleware`);
      assert.match(
        source,
        /middleware:\s*\[authRequestMiddleware\]/,
        `${path} must apply authRequestMiddleware inside the server boundary`,
      );
    }
  });

  it('keeps login CSRF, rate limiting, and secure cookie issuance in the server function', async () => {
    const source = await readSource('pages/auth/model/auth-functions.ts');
    // P2 brain split: password verification moved to the brain, so the BFF's
    // guarantee is now that it delegates instead of hashing locally.
    const authSource = await readSource('server/auth/auth-runtime.ts');
    assert.match(source, /isSameOriginRequest/);
    assert.match(source, /globalLoginRateLimiter/);
    assert.match(source, /clientLoginRateLimiter/);
    assert.match(source, /accountLoginRateLimiter/);
    assert.match(source, /loginPasswordGate\.tryAcquire/);
    assert.match(source, /normalizedClientKey/);
    assert.doesNotMatch(source, /x-real-ip|cf-connecting-ip|x-forwarded-for/i);
    assert.match(authSource, /\/v1\/auth\/authenticate/);
    assert.doesNotMatch(authSource, /verifyScryptPassword|scryptSync/);
    assert.match(source, /sessionCookieHeader/);
    assert.match(source, /setResponseHeader/);
  });

  it('protects invitation-gated signup with the same origin, bounded password work, and atomic account creation', async () => {
    const source = await readSource('pages/auth/model/auth-functions.ts');
    const runtimeSource = await readSource('server/auth/auth-runtime.ts');
    const bindingSource = await readSource('server/auth/credential-binding.ts');

    assert.match(source, /export const enrollAccount/);
    assert.match(source, /enrollmentInputSchema/);
    assert.match(source, /isSameOriginRequest/);
    assert.match(source, /globalEnrollmentRateLimiter/);
    assert.match(source, /clientEnrollmentRateLimiter/);
    assert.match(source, /loginPasswordGate\.tryAcquire/);
    assert.match(source, /sessionCookieHeader\(enrollment\.token/);
    // P2 brain split: invite-code hashing, password hashing and the atomic
    // consume-and-create all moved to the brain. The BFF's contract is that it
    // delegates over the internal channel and holds NO credential material.
    assert.match(runtimeSource, /\/v1\/auth\/enroll/);
    assert.doesNotMatch(runtimeSource, /hashEnrollmentCode|createScryptPasswordRecord/);
    assert.doesNotMatch(runtimeSource, /consume_invitation_and_create_account/);
    assert.doesNotMatch(runtimeSource, /SELECT|FROM public\./);
    // Session resolution is still username/id based, with no server-owned id.
    assert.match(runtimeSource, /\/v1\/auth\/account/);
    assert.doesNotMatch(runtimeSource, /requireUserScope|getConfiguredScope/);
    // Sessions stay credential-bound, but via the brain-issued fingerprint
    // rather than a raw password record the BFF is no longer allowed to see.
    assert.match(bindingSource, /createHmac\('sha256'/);
    assert.match(bindingSource, /credentialFingerprint/);
    assert.doesNotMatch(bindingSource, /passwordRecord/);
  });

  it('enforces exact configured origin for every authenticated mutation request', async () => {
    const source = await readSource('server/auth/auth-middleware.ts');
    assert.match(source, /isSameOriginRequest/);
    assert.match(source, /getAuthenticationOrigin/);
    assert.match(source, /status:\s*403/);
  });
});
