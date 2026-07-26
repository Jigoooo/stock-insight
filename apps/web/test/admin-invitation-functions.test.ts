import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const sourceUrl = new URL(
  '../src/pages/admin-invitations/model/admin-invitation-functions.ts',
  import.meta.url,
);

describe('admin invitation server function boundary', () => {
  it('protects every function with the verified-session middleware', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    assert.match(source, /export const loadAdminInvitationConsole/);
    assert.match(source, /export const issueInvitation/);
    assert.match(source, /export const revokeInvitation/);
    assert.equal(source.match(/\.middleware\(\[authFunctionMiddleware\]\)/g)?.length, 3);
  });

  it('validates strict bounded mutation inputs', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    assert.match(source, /label: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(120\)/);
    assert.match(source, /maxUses: z\.number\(\)\.int\(\)\.min\(1\)\.max\(10\)/);
    assert.match(source, /expiresInHours: z\.enum\(\['24', '72', '168'\]\)/);
    assert.match(source, /reason: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(240\)/);
    assert.ok((source.match(/\.strict\(\)/g) ?? []).length >= 2);
  });

  it('requires same-origin and per-actor rate admission on mutations', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    assert.equal(source.match(/isSameOriginRequest/g)?.length, 3);
    assert.match(source, /adminMutationRateLimiter\.consume\(context\.session\.sub\)/);
    assert.match(source, /setResponseStatus\(403\)/);
    assert.match(source, /setResponseStatus\(429\)/);
    assert.match(source, /Cache-Control', 'no-store'/);
  });

  it('loads navigation capability from DB instead of caching a role in the session token', async () => {
    const authSource = await readFile(
      new URL('../src/pages/auth/model/auth-functions.ts', import.meta.url),
      'utf8',
    );
    assert.match(authSource, /loadFailClosedAdminCapabilitiesForUser/);
    assert.match(authSource, /canManageInvitations/);
    assert.doesNotMatch(authSource, /session\.role|token.*role/i);
  });
});
