#!/usr/bin/env node
// Mint a session cookie bound to the STATIC credential (golden write-parity only).
// Env: SESSION_SECRET_FILE, PW_RECORD_FILE, USER_ID, AUTH_USERNAME
import { readFileSync } from 'node:fs';

import {
  credentialSessionSecret,
  selectAuthenticationCredential,
} from '../../web/src/server/auth/credential-binding.ts';
import { createSessionToken } from '../../web/src/server/auth/session-core.ts';

const baseSecret = Buffer.from(
  readFileSync(process.env.SESSION_SECRET_FILE, 'utf8').trim(),
  'utf8',
);
const passwordRecord = readFileSync(process.env.PW_RECORD_FILE, 'utf8').trim();
const userId = process.env.USER_ID;
const username = process.env.AUTH_USERNAME ?? 'goldentest';

const credential = selectAuthenticationCredential({
  userId,
  staticCredential: { username, passwordRecord },
});
const secret = credentialSessionSecret(baseSecret, credential);
const token = createSessionToken(
  { sub: credential.userId, username: credential.username },
  { secret, ttlSeconds: 3600 },
);
process.stdout.write(`__Host-stock-insight-session=${encodeURIComponent(token)}`);
