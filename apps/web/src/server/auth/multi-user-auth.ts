import {
  credentialSessionSecret,
  isSessionBoundToCredential,
  isUsernameForCredential,
  selectAuthenticationCredential,
  type AuthenticationCredential,
} from './credential-binding.ts';
import type { LocalAccount } from './local-account-repository.ts';
import {
  createSessionToken,
  verifyScryptPasswordAsync,
  verifySessionToken,
  type SessionClaims,
} from './session-core.ts';

// A fixed well-formed record so an absent account still costs one scrypt
// verification, preventing username-enumeration by timing.
const DUMMY_PASSWORD_RECORD =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export type IssuedSession = Readonly<{
  token: string;
  maxAgeSeconds: number;
  session: SessionClaims;
}>;

type SessionSecret = Buffer | Uint8Array;

function credentialForAccount(account: LocalAccount): AuthenticationCredential {
  const credential = selectAuthenticationCredential({
    userId: account.userId,
    localAccount: account,
  });
  if (!credential) throw new Error('Failed to bind the account credential');
  return credential;
}

export function issueSessionForAccount(
  baseSecret: SessionSecret,
  ttlSeconds: number,
  account: LocalAccount,
): IssuedSession {
  const credential = credentialForAccount(account);
  const secret = credentialSessionSecret(baseSecret, credential);
  const token = createSessionToken(
    { sub: credential.userId, username: credential.username },
    { secret, ttlSeconds },
  );
  const session = verifySessionToken(token, { secret });
  if (!session || !isSessionBoundToCredential(session, credential)) {
    throw new Error('Failed to issue a bound authentication session');
  }
  return { token, maxAgeSeconds: ttlSeconds, session };
}

// Verify username + password against the resolved account (or a dummy record if
// absent) and issue a session on success. Always spends one scrypt verification
// so callers cannot enumerate usernames by response time.
export async function authenticateAccount(
  baseSecret: SessionSecret,
  ttlSeconds: number,
  account: LocalAccount | undefined,
  username: string,
  password: string,
): Promise<IssuedSession | undefined> {
  const passwordMatches = await verifyScryptPasswordAsync(
    password,
    account?.passwordRecord ?? DUMMY_PASSWORD_RECORD,
  );
  if (!account) return undefined;
  const credential = credentialForAccount(account);
  const usernameMatches = isUsernameForCredential(username, credential);
  if (!passwordMatches || !usernameMatches) return undefined;
  return issueSessionForAccount(baseSecret, ttlSeconds, account);
}

// Validate a session token against the account the token claims. The account is
// resolved out-of-band by canonical id; the token only verifies once its
// credential-derived secret matches, so a rotated password or a foreign account
// fails closed.
export function resolveSessionFromAccount(
  baseSecret: SessionSecret,
  token: string,
  account: LocalAccount | undefined,
): SessionClaims | undefined {
  if (!account) return undefined;
  const credential = credentialForAccount(account);
  const secret = credentialSessionSecret(baseSecret, credential);
  const session = verifySessionToken(token, { secret });
  return session && isSessionBoundToCredential(session, credential) ? session : undefined;
}
