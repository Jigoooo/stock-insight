import { toAccountIdentity, type AccountIdentity } from './account-identity.ts';

import {
  createScryptPasswordRecordAsync,
  loadLocalAccountById,
  loadLocalAccountByUsername,
  verifyScryptPasswordAsync,
  type LocalAccount,
  type LocalAccountQueryExecutor,
} from '@stock-insight/api';

// A fixed well-formed record so an absent account still costs one scrypt
// verification, preventing username-enumeration by timing. Identical to the
// legacy in-process constant so login latency does not change shape.
const DUMMY_PASSWORD_RECORD =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;

export type AuthenticateResult =
  | Readonly<{ status: 'authenticated'; identity: AccountIdentity }>
  | Readonly<{ status: 'rejected' }>;

export type EnrollResult =
  | Readonly<{ status: 'created'; identity: AccountIdentity }>
  | Readonly<{ status: 'invalid_code' }>
  | Readonly<{ status: 'unavailable' }>;

type Secret = Buffer | Uint8Array;

// Password verification runs HERE, never in the web/BFF. The caller supplies the
// plaintext over the internal channel and receives only an opaque identity.
export async function authenticateCredentials(
  executor: LocalAccountQueryExecutor,
  secret: Secret,
  input: Readonly<{ username: string; password: string }>,
): Promise<AuthenticateResult> {
  const account =
    typeof input.username === 'string' && USERNAME_PATTERN.test(input.username)
      ? await loadLocalAccountByUsername(executor, input.username)
      : undefined;

  // Always spend one scrypt verification so callers cannot enumerate usernames
  // by response time — matches the legacy authenticateAccount() contract.
  const passwordMatches = await verifyScryptPasswordAsync(
    input.password,
    account?.passwordRecord ?? DUMMY_PASSWORD_RECORD,
  );
  if (!account || !passwordMatches || account.username !== input.username) {
    return { status: 'rejected' };
  }
  return { status: 'authenticated', identity: toAccountIdentity(secret, account) };
}

// Session refresh: resolve the account the token claims so the caller can
// re-derive its credential-bound signing key. Returns undefined for unknown ids.
export async function resolveAccountIdentity(
  executor: LocalAccountQueryExecutor,
  secret: Secret,
  userId: string,
): Promise<AccountIdentity | undefined> {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) return undefined;
  const account = await loadLocalAccountById(executor, userId);
  return account ? toAccountIdentity(secret, account) : undefined;
}

export type EnrollDeps = Readonly<{
  // Runs the atomic SECURITY DEFINER consume-and-create inside one transaction.
  consumeInvitation: (
    codeDigest: string,
    username: string,
    passwordRecord: string,
  ) => Promise<{ status: string; user_id: string | null } | undefined>;
  hashCode: (code: string) => string;
}>;

// Signup mints the user, so there is no pre-existing scope; the SECURITY
// DEFINER consume function sets its own scope internally.
export async function enrollAccount(
  deps: EnrollDeps,
  secret: Secret,
  input: Readonly<{ username: string; password: string; enrollmentCode: string }>,
): Promise<EnrollResult> {
  if (!USERNAME_PATTERN.test(input.username)) return { status: 'invalid_code' };

  const passwordRecord = await createScryptPasswordRecordAsync(input.password);
  const codeDigest = deps.hashCode(input.enrollmentCode);
  const result = await deps.consumeInvitation(codeDigest, input.username, passwordRecord);

  if (!result) return { status: 'unavailable' };
  if (result.status === 'created' && result.user_id && UUID_PATTERN.test(result.user_id)) {
    const account: LocalAccount = {
      userId: result.user_id,
      username: input.username,
      passwordRecord,
    };
    return { status: 'created', identity: toAccountIdentity(secret, account) };
  }
  // username_taken / exhausted / expired / revoked are all conflict-like states
  // where the operator or user must act; everything else is an invalid code.
  if (['username_taken', 'exhausted', 'expired', 'revoked'].includes(result.status)) {
    return { status: 'unavailable' };
  }
  return { status: 'invalid_code' };
}
