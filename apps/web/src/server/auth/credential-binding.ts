import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { LocalAccount } from './local-account-repository.ts';
import type { SessionClaims } from './session-core.ts';

export type AuthenticationCredential = Readonly<{
  kind: 'local' | 'static';
  userId: string;
  username: string;
  passwordRecord: string;
}>;

type StaticCredential = Readonly<{
  username: string;
  passwordRecord: string;
}>;

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left, 'utf8').digest();
  const rightHash = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function selectAuthenticationCredential(input: {
  userId: string;
  localAccount?: LocalAccount;
  staticCredential?: StaticCredential;
}): AuthenticationCredential | undefined {
  if (input.localAccount) {
    if (input.localAccount.userId !== input.userId) {
      throw new Error('Invalid local account state');
    }
    return {
      kind: 'local',
      userId: input.userId,
      username: input.localAccount.username,
      passwordRecord: input.localAccount.passwordRecord,
    };
  }
  if (!input.staticCredential) return undefined;
  return {
    kind: 'static',
    userId: input.userId,
    username: input.staticCredential.username,
    passwordRecord: input.staticCredential.passwordRecord,
  };
}

export function credentialSessionSecret(
  baseSecret: Buffer | Uint8Array,
  credential: AuthenticationCredential,
): Buffer {
  return createHmac('sha256', baseSecret)
    .update('stock-insight:credential-session:v2\0', 'utf8')
    .update(credential.kind, 'utf8')
    .update('\0', 'utf8')
    .update(credential.userId, 'utf8')
    .update('\0', 'utf8')
    .update(credential.username, 'utf8')
    .update('\0', 'utf8')
    .update(credential.passwordRecord, 'utf8')
    .digest();
}

export function isSessionBoundToCredential(
  claims: SessionClaims,
  credential: AuthenticationCredential,
): boolean {
  return claims.sub === credential.userId && isUsernameForCredential(claims.username, credential);
}

export function isUsernameForCredential(
  username: string,
  credential: AuthenticationCredential,
): boolean {
  return constantTimeTextEqual(username, credential.username);
}
