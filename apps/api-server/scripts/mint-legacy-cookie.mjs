#!/usr/bin/env node
// Mint a valid __Host-stock-insight-session cookie for the LOCALLY-STARTED legacy
// server (golden diff only). Reuses the exact web auth modules via Node type
// stripping — no algorithm re-implementation, no secret printed to logs except
// the cookie value itself (session token, expires with TTL, local-only server).
//
// Env: SESSION_SECRET_FILE (temp file, agent-generated), DATABASE_URL, USER_ID
import { readFileSync } from 'node:fs';

import pg from 'pg';

import {
  credentialSessionSecret,
  selectAuthenticationCredential,
} from '../../web/src/server/auth/credential-binding.ts';
import { createSessionToken } from '../../web/src/server/auth/session-core.ts';

const secretFile = process.env.SESSION_SECRET_FILE;
const databaseUrl = process.env.DATABASE_URL;
const userId = process.env.USER_ID;
if (!secretFile || !databaseUrl || !userId) {
  console.error('SESSION_SECRET_FILE, DATABASE_URL, USER_ID are required');
  process.exit(1);
}

const baseSecret = Buffer.from(readFileSync(secretFile, 'utf8').trim(), 'utf8');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const { rows } = await pool.query(
  `SELECT user_id::text AS user_id, username, password_record
     FROM public.app_local_accounts WHERE user_id = $1::uuid LIMIT 1`,
  [userId],
);
await pool.end();
if (rows.length !== 1) {
  console.error('local account not found for user');
  process.exit(1);
}

const credential = selectAuthenticationCredential({
  userId,
  localAccount: {
    userId: rows[0].user_id,
    username: rows[0].username,
    passwordRecord: rows[0].password_record,
  },
});
const secret = credentialSessionSecret(baseSecret, credential);
const token = createSessionToken(
  { sub: credential.userId, username: credential.username },
  { secret, ttlSeconds: 3600 },
);
process.stdout.write(`__Host-stock-insight-session=${encodeURIComponent(token)}`);
