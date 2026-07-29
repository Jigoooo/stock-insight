import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// The BFF no longer holds password records. The brain returns an opaque
// AccountIdentity whose credentialFingerprint stands in for the credential when
// deriving a session signing key.
export type AccountIdentity = Readonly<{
  userId: string;
  username: string;
  credentialFingerprint: string;
}>;

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left, 'utf8').digest();
  const rightHash = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftHash, rightHash);
}

// Session key derivation, credential-bound via the brain-issued fingerprint.
// Preserves the v2 property that a password rotation invalidates every issued
// session: the fingerprint changes, so the derived key — and therefore every
// outstanding token signature — stops verifying.
//
// The MAC domain is deliberately distinct from the retired v2 label so a token
// minted under the old password-record-derived scheme can never verify here.
export function fingerprintSessionSecret(
  baseSecret: Buffer | Uint8Array,
  identity: AccountIdentity,
): Buffer {
  return createHmac('sha256', baseSecret)
    .update('stock-insight:credential-session:v3\0', 'utf8')
    .update(identity.userId, 'utf8')
    .update('\0', 'utf8')
    .update(identity.username, 'utf8')
    .update('\0', 'utf8')
    .update(identity.credentialFingerprint, 'utf8')
    .digest();
}

export function isSessionBoundToIdentity(
  claims: Readonly<{ sub: string; username: string }>,
  identity: AccountIdentity,
): boolean {
  return (
    claims.sub === identity.userId && constantTimeTextEqual(claims.username, identity.username)
  );
}
