import '@tanstack/react-start/server-only';

import { loadAuthRuntimeConfig, type AuthRuntimeConfig } from './auth-runtime-config.ts';
import {
  credentialSessionSecret,
  isSessionBoundToCredential,
  isUsernameForCredential,
  selectAuthenticationCredential,
  type AuthenticationCredential,
} from './credential-binding.ts';
import { verifyEnrollmentCode } from './enrollment-code.ts';
import {
  insertLocalAccount,
  isEnrollmentConsumed,
  loadLocalAccount,
} from './local-account-repository.ts';
import { readSessionCookie } from './session-cookie.ts';
import {
  createScryptPasswordRecordAsync,
  createSessionToken,
  verifyScryptPasswordAsync,
  verifySessionToken,
  type SessionClaims,
} from './session-core.ts';

import {
  createDatabaseClient,
  createReadOnlyDatabaseClient,
  parseServerEnv,
  requireUserScope,
  type UserScope,
} from '@stock-insight/api';

let authConfigPromise: Promise<AuthRuntimeConfig> | undefined;

function getAuthConfig(): Promise<AuthRuntimeConfig> {
  authConfigPromise ??= loadAuthRuntimeConfig();
  return authConfigPromise;
}

function getConfiguredScope(): UserScope {
  return requireUserScope(parseServerEnv());
}

function baseSessionSecret(config: AuthRuntimeConfig): Buffer {
  return Buffer.from(config.sessionSecret, 'utf8');
}

const DUMMY_PASSWORD_RECORD =
  'scrypt$v=1$N=16384$r=8$p=1$ABEiM0RVZneImaq7zN3u_w$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

async function resolveCredential(
  config: AuthRuntimeConfig,
  scope: UserScope,
): Promise<AuthenticationCredential | undefined> {
  const database = createReadOnlyDatabaseClient();
  if (database.kind !== 'configured') throw new Error('Authentication database is unavailable');
  const [localAccount, enrollmentConsumed] = await Promise.all([
    loadLocalAccount(database.queryRows, scope.userId),
    isEnrollmentConsumed(database.queryRows, scope.userId),
  ]);
  if (localAccount && !enrollmentConsumed) throw new Error('Invalid local account state');
  return selectAuthenticationCredential({
    userId: scope.userId,
    ...(localAccount ? { localAccount } : {}),
    ...(!enrollmentConsumed && config.staticCredential
      ? { staticCredential: config.staticCredential }
      : {}),
  });
}

function issueBoundSession(
  config: AuthRuntimeConfig,
  credential: AuthenticationCredential,
): {
  token: string;
  maxAgeSeconds: number;
  session: SessionClaims;
} {
  const secret = credentialSessionSecret(baseSessionSecret(config), credential);
  const token = createSessionToken(
    { sub: credential.userId, username: credential.username },
    { secret, ttlSeconds: config.sessionTtlSeconds },
  );
  const session = verifySessionToken(token, { secret });
  if (!session || !isSessionBoundToCredential(session, credential)) {
    throw new Error('Failed to issue a bound authentication session');
  }
  return { token, maxAgeSeconds: config.sessionTtlSeconds, session };
}

export async function authenticateConfiguredCredentials(input: {
  username: string;
  password: string;
}): Promise<{ token: string; maxAgeSeconds: number; session: SessionClaims } | undefined> {
  const [config, scope] = await Promise.all([
    getAuthConfig(),
    Promise.resolve(getConfiguredScope()),
  ]);
  const credential = await resolveCredential(config, scope);
  const passwordMatches = await verifyScryptPasswordAsync(
    input.password,
    credential?.passwordRecord ?? DUMMY_PASSWORD_RECORD,
  );
  const usernameMatches = credential ? isUsernameForCredential(input.username, credential) : false;
  if (!credential || !passwordMatches || !usernameMatches) return undefined;
  return issueBoundSession(config, credential);
}

export async function readBoundSession(
  cookieHeader: string | null | undefined,
): Promise<SessionClaims | undefined> {
  const token = readSessionCookie(cookieHeader);
  if (!token) return undefined;

  const [config, scope] = await Promise.all([
    getAuthConfig(),
    Promise.resolve(getConfiguredScope()),
  ]);
  const credential = await resolveCredential(config, scope);
  if (!credential) return undefined;
  const secret = credentialSessionSecret(baseSessionSecret(config), credential);
  const session = verifySessionToken(token, { secret });
  return session && isSessionBoundToCredential(session, credential) ? session : undefined;
}

export async function getEnrollmentAvailability(): Promise<boolean> {
  const [config, scope] = await Promise.all([
    getAuthConfig(),
    Promise.resolve(getConfiguredScope()),
  ]);
  if (!config.enrollmentTokenHash) return false;
  const database = createReadOnlyDatabaseClient();
  if (database.kind !== 'configured') throw new Error('Authentication database is unavailable');
  const [localAccount, enrollmentConsumed] = await Promise.all([
    loadLocalAccount(database.queryRows, scope.userId),
    isEnrollmentConsumed(database.queryRows, scope.userId),
  ]);
  return localAccount === undefined && !enrollmentConsumed;
}

export async function enrollLocalAccountCredentials(input: {
  username: string;
  password: string;
  enrollmentCode: string;
}): Promise<
  | {
      status: 'created';
      token: string;
      maxAgeSeconds: number;
      session: SessionClaims;
    }
  | { status: 'invalid_code' | 'unavailable' }
> {
  const [config, scope] = await Promise.all([
    getAuthConfig(),
    Promise.resolve(getConfiguredScope()),
  ]);
  if (
    !config.enrollmentTokenHash ||
    !verifyEnrollmentCode(input.enrollmentCode, config.enrollmentTokenHash)
  ) {
    return { status: 'invalid_code' };
  }

  const readDatabase = createReadOnlyDatabaseClient();
  if (readDatabase.kind !== 'configured') {
    throw new Error('Authentication database is unavailable');
  }
  const [localAccount, enrollmentConsumed] = await Promise.all([
    loadLocalAccount(readDatabase.queryRows, scope.userId),
    isEnrollmentConsumed(readDatabase.queryRows, scope.userId),
  ]);
  if (localAccount || enrollmentConsumed) {
    return { status: 'unavailable' };
  }

  const passwordRecord = await createScryptPasswordRecordAsync(input.password);
  const writeDatabase = createDatabaseClient();
  if (writeDatabase.kind !== 'configured') {
    throw new Error('Authentication database is unavailable');
  }
  const enrollment = await writeDatabase.withTransaction((executor) =>
    insertLocalAccount(executor.queryRows, {
      userId: scope.userId,
      username: input.username,
      passwordRecord,
    }),
  );
  if (enrollment.status !== 'created') return { status: 'unavailable' };

  const credential = selectAuthenticationCredential({
    userId: scope.userId,
    localAccount: enrollment.account,
  });
  if (!credential) throw new Error('Failed to bind the enrolled account');
  return { status: 'created', ...issueBoundSession(config, credential) };
}

export async function getAuthenticationOrigin(): Promise<string> {
  return (await getAuthConfig()).appOrigin;
}
