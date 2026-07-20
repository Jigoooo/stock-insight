import { parseScryptPasswordRecord } from './session-core.ts';

export type LocalAccountQueryExecutor = <
  TRow extends Record<string, unknown> = Record<string, unknown>,
>(
  sql: string,
  params?: readonly unknown[],
) => Promise<TRow[]>;

export type LocalAccount = Readonly<{
  userId: string;
  username: string;
  passwordRecord: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;

function invalidState(): Error {
  return new Error('Invalid local account state');
}

function parseRow(row: Record<string, unknown>, expectedUserId: string): LocalAccount {
  const userId = row.user_id;
  const username = row.username;
  const passwordRecord = row.password_record;
  if (
    typeof userId !== 'string' ||
    userId !== expectedUserId ||
    !UUID_PATTERN.test(userId) ||
    typeof username !== 'string' ||
    !USERNAME_PATTERN.test(username) ||
    typeof passwordRecord !== 'string' ||
    !parseScryptPasswordRecord(passwordRecord)
  ) {
    throw invalidState();
  }
  return { userId, username, passwordRecord };
}

function requireUserId(userId: string): void {
  if (!UUID_PATTERN.test(userId)) throw invalidState();
}

export async function loadLocalAccount(
  executor: LocalAccountQueryExecutor,
  userId: string,
): Promise<LocalAccount | undefined> {
  requireUserId(userId);
  const rows = await executor(
    `SELECT user_id::text, username, password_record
       FROM public.app_local_accounts
      WHERE user_id = $1::uuid
      LIMIT 2`,
    [userId],
  );
  if (rows.length === 0) return undefined;
  if (rows.length !== 1) throw invalidState();
  return parseRow(rows[0]!, userId);
}

const USERNAME_LOGIN_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;

function parseAnyRow(row: Record<string, unknown>): LocalAccount {
  const userId = row.user_id;
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) throw invalidState();
  return parseRow(row, userId);
}

// Multi-user login: resolve an account by canonical username without knowing the
// user id first. Backed by the SECURITY DEFINER public.lookup_login_account so
// the FORCE-RLS credential table can be searched exactly once, fail-closed.
export async function loadLocalAccountByUsername(
  executor: LocalAccountQueryExecutor,
  username: string,
): Promise<LocalAccount | undefined> {
  if (typeof username !== 'string' || !USERNAME_LOGIN_PATTERN.test(username)) return undefined;
  const rows = await executor(
    `SELECT user_id::text, username, password_record
       FROM public.lookup_login_account($1)`,
    [username],
  );
  if (rows.length === 0) return undefined;
  if (rows.length !== 1) throw invalidState();
  return parseAnyRow(rows[0]!);
}

// Session refresh: rebuild the credential from the verified token subject.
export async function loadLocalAccountById(
  executor: LocalAccountQueryExecutor,
  userId: string,
): Promise<LocalAccount | undefined> {
  requireUserId(userId);
  const rows = await executor(
    `SELECT user_id::text, username, password_record
       FROM public.lookup_account_by_id($1::uuid)`,
    [userId],
  );
  if (rows.length === 0) return undefined;
  if (rows.length !== 1) throw invalidState();
  return parseRow(rows[0]!, userId);
}

export async function isEnrollmentConsumed(
  executor: LocalAccountQueryExecutor,
  userId: string,
): Promise<boolean> {
  requireUserId(userId);
  const rows = await executor(
    `SELECT EXISTS (
       SELECT 1
         FROM public.app_auth_bootstrap_state
        WHERE user_id = $1::uuid
     ) AS enrollment_consumed`,
    [userId],
  );
  if (rows.length !== 1 || typeof rows[0]?.enrollment_consumed !== 'boolean') {
    throw invalidState();
  }
  return rows[0].enrollment_consumed;
}

export async function insertLocalAccount(
  executor: LocalAccountQueryExecutor,
  account: LocalAccount,
): Promise<{ status: 'created'; account: LocalAccount } | { status: 'already_enrolled' }> {
  requireUserId(account.userId);
  if (
    !USERNAME_PATTERN.test(account.username) ||
    !parseScryptPasswordRecord(account.passwordRecord)
  ) {
    throw invalidState();
  }
  const rows = await executor(
    `WITH consumed AS (
       INSERT INTO public.app_auth_bootstrap_state (user_id)
       VALUES ($1::uuid)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING user_id
     )
     INSERT INTO public.app_local_accounts (user_id, username, password_record)
     SELECT $1::uuid, $2, $3
       FROM consumed
     ON CONFLICT (user_id) DO NOTHING
     RETURNING user_id::text, username, password_record`,
    [account.userId, account.username, account.passwordRecord],
  );
  if (rows.length === 0) return { status: 'already_enrolled' };
  if (rows.length !== 1) throw invalidState();
  return { status: 'created', account: parseRow(rows[0]!, account.userId) };
}
