import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  credentialSessionSecret,
  isSessionBoundToCredential,
  selectAuthenticationCredential,
} from '../src/server/auth/credential-binding.ts';
import { createSessionToken, verifySessionToken } from '../src/server/auth/session-core.ts';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const RECORD_A =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const RECORD_B = RECORD_A.replace(/A+$/, 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
const BASE_SECRET = Buffer.alloc(32, 0x44);

describe('authentication credential binding', () => {
  it('prefers the DB account and never falls back to the old static credential once enrolled', () => {
    const credential = selectAuthenticationCredential({
      userId: USER_ID,
      localAccount: { userId: USER_ID, username: 'owner', passwordRecord: RECORD_A },
      staticCredential: { username: 'jigoo', passwordRecord: RECORD_B },
    });

    assert.deepEqual(credential, {
      kind: 'local',
      userId: USER_ID,
      username: 'owner',
      passwordRecord: RECORD_A,
    });
  });

  it('uses the static credential only before enrollment and supports DB-only empty setup', () => {
    assert.equal(
      selectAuthenticationCredential({
        userId: USER_ID,
        staticCredential: { username: 'jigoo', passwordRecord: RECORD_A },
      })?.kind,
      'static',
    );
    assert.equal(selectAuthenticationCredential({ userId: USER_ID }), undefined);
  });

  it('derives credential-specific session secrets that rotate with local and static passwords', () => {
    const local = selectAuthenticationCredential({
      userId: USER_ID,
      localAccount: { userId: USER_ID, username: 'owner', passwordRecord: RECORD_A },
    })!;
    const changed = { ...local, passwordRecord: RECORD_B };
    const staticCredential = selectAuthenticationCredential({
      userId: USER_ID,
      staticCredential: { username: 'jigoo', passwordRecord: RECORD_A },
    })!;
    const changedStatic = { ...staticCredential, passwordRecord: RECORD_B };

    assert.notDeepEqual(credentialSessionSecret(BASE_SECRET, local), BASE_SECRET);
    assert.notDeepEqual(
      credentialSessionSecret(BASE_SECRET, local),
      credentialSessionSecret(BASE_SECRET, changed),
    );
    const staticSecret = credentialSessionSecret(BASE_SECRET, staticCredential);
    const changedStaticSecret = credentialSessionSecret(BASE_SECRET, changedStatic);
    assert.notDeepEqual(staticSecret, BASE_SECRET);
    assert.notDeepEqual(staticSecret, changedStaticSecret);

    const token = createSessionToken(
      { sub: USER_ID, username: staticCredential.username },
      { secret: staticSecret, ttlSeconds: 60 },
    );
    assert.equal(verifySessionToken(token, { secret: changedStaticSecret }), undefined);
  });

  it('binds claims to both the canonical user and selected username', () => {
    const credential = selectAuthenticationCredential({
      userId: USER_ID,
      localAccount: { userId: USER_ID, username: 'owner', passwordRecord: RECORD_A },
    })!;
    const claims = { version: 1 as const, sub: USER_ID, username: 'owner', iat: 1, exp: 2 };

    assert.equal(isSessionBoundToCredential(claims, credential), true);
    assert.equal(isSessionBoundToCredential({ ...claims, username: 'jigoo' }, credential), false);
  });
});
