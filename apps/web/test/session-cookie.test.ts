import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clearSessionCookieHeader,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  sessionCookieHeader,
} from '../src/server/auth/session-cookie.ts';

describe('session cookie boundary', () => {
  it('issues an origin-bound secure HttpOnly cookie with finite lifetime', () => {
    const header = sessionCookieHeader('v1.payload.signature', 3600);

    assert.equal(header.startsWith(`${SESSION_COOKIE_NAME}=v1.payload.signature;`), true);
    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
    assert.match(header, /SameSite=Strict/);
    assert.match(header, /Path=\//);
    assert.match(header, /Max-Age=3600/);
    assert.doesNotMatch(header, /Domain=/i);
  });

  it('reads only the exact session cookie and preserves signed token separators', () => {
    assert.equal(
      readSessionCookie(
        `theme=light; ${SESSION_COOKIE_NAME}=v1.payload.signature; other=value%3Dwith%3Dequals`,
      ),
      'v1.payload.signature',
    );
    assert.equal(readSessionCookie(`${SESSION_COOKIE_NAME}-shadow=forged`), null);
    assert.equal(readSessionCookie(null), null);
  });

  it('clears the same origin-bound cookie immediately', () => {
    const header = clearSessionCookieHeader();

    assert.match(header, new RegExp(`^${SESSION_COOKIE_NAME}=;`));
    assert.match(header, /Max-Age=0/);
    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
    assert.match(header, /SameSite=Strict/);
    assert.match(header, /Path=\//);
    assert.doesNotMatch(header, /Domain=/i);
  });
});
