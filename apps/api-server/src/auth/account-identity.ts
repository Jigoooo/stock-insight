import { createHmac } from 'node:crypto';

import type { LocalAccount } from '@stock-insight/api';

// The brain owns the credential material; the web/BFF never sees a password
// record. Instead it receives a FINGERPRINT: an HMAC over the same fields the
// legacy credentialSessionSecret() bound to, computed with the internal-context
// secret. Two properties are preserved from the in-process design:
//   1. rotating a password changes the fingerprint, so every session issued for
//      that account fails verification immediately (same as before);
//   2. the fingerprint is not password-equivalent — it cannot be replayed
//      against the scrypt verifier, and it is useless without the internal
//      secret, which never leaves the production web container.
const FINGERPRINT_DOMAIN = 'stock-insight:credential-fingerprint:v1\0';

export type AccountIdentity = Readonly<{
  userId: string;
  username: string;
  credentialFingerprint: string;
}>;

export function credentialFingerprint(secret: Buffer | Uint8Array, account: LocalAccount): string {
  return createHmac('sha256', secret)
    .update(FINGERPRINT_DOMAIN, 'utf8')
    .update('local', 'utf8')
    .update('\0', 'utf8')
    .update(account.userId, 'utf8')
    .update('\0', 'utf8')
    .update(account.username, 'utf8')
    .update('\0', 'utf8')
    .update(account.passwordRecord, 'utf8')
    .digest('base64url');
}

export function toAccountIdentity(
  secret: Buffer | Uint8Array,
  account: LocalAccount,
): AccountIdentity {
  return Object.freeze({
    userId: account.userId,
    username: account.username,
    credentialFingerprint: credentialFingerprint(secret, account),
  });
}
