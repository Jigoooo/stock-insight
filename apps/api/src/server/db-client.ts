import pg, { type Pool as PgPool, type PoolClient, type QueryResultRow } from 'pg';

import { resolveDatabaseConnectionStrings } from './database-connection-policy.ts';
import { parseServerEnv, type ServerEnv } from './env.ts';
import {
  withReadSnapshot,
  type ReadSnapshotExecutor,
  type ReadSnapshotOptions,
} from './read-snapshot.ts';
import {
  withWriteTransaction,
  type WriteTransactionExecutor,
  type WriteTransactionOptions,
} from './write-transaction.ts';

type PgModule = {
  Pool: new (options: {
    connectionString: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }) => PgPool;
};

export type ConfiguredReadOnlyDatabaseClient = {
  kind: 'configured';
  connectionString: string;
  queryRows: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
  withReadSnapshot: <TResult>(
    work: (executor: ReadSnapshotExecutor) => Promise<TResult>,
    options?: Partial<ReadSnapshotOptions>,
  ) => Promise<TResult>;
  close: () => Promise<void>;
};

export type ConfiguredDatabaseClient = {
  kind: 'configured';
  connectionString: string;
  queryRows: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
  withTransaction: <TResult>(
    work: (executor: WriteTransactionExecutor) => Promise<TResult>,
    options?: Partial<Omit<WriteTransactionOptions, 'sessionUserId'>>,
  ) => Promise<TResult>;
  close: () => Promise<void>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let pgPoolConstructor: PgModule['Pool'] | undefined;
// Pools are keyed by connection string only and shared across per-request
// scoped clients — the scope is applied per transaction via the GUC, never
// baked into the pool. This lets many users safely share one connection pool.
const readPoolCache = new Map<string, PgPool>();
const writePoolCache = new Map<string, PgPool>();

const defaultReadSnapshotOptions: ReadSnapshotOptions = {
  statementTimeoutMs: 10_000,
  lockTimeoutMs: 1_000,
};
const defaultWriteTransactionOptions = {
  statementTimeoutMs: 10_000,
  lockTimeoutMs: 1_000,
} as const;

function getPgPoolConstructor(): PgModule['Pool'] {
  pgPoolConstructor ??= (pg as PgModule).Pool;
  return pgPoolConstructor;
}

function getReadPool(connectionString: string): PgPool {
  let pool = readPoolCache.get(connectionString);
  if (!pool) {
    const Pool = getPgPoolConstructor();
    pool = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    readPoolCache.set(connectionString, pool);
  }
  return pool;
}

function getWritePool(connectionString: string): PgPool {
  let pool = writePoolCache.get(connectionString);
  if (!pool) {
    const Pool = getPgPoolConstructor();
    pool = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    writePoolCache.set(connectionString, pool);
  }
  return pool;
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original read failure; rollback is best-effort cleanup.
  }
}

function requireUuidScope(userId: string): string {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new Error('A canonical UUID user scope is required for a scoped database client');
  }
  return userId;
}

export type ReadOnlyDatabaseClient =
  | {
      kind: 'disabled';
      reason: 'DATABASE_URL is not configured';
    }
  | ConfiguredReadOnlyDatabaseClient;

export type DatabaseClient =
  | {
      kind: 'disabled';
      reason: 'DATABASE_WRITE_URL is not configured';
    }
  | ConfiguredDatabaseClient;

// Build a read-only client bound to an explicit scope (may be undefined for
// unscoped/global reads). The pool is shared; the scope is applied per query.
function buildReadOnlyClient(
  connectionString: string,
  scopeUserId: string | undefined,
): ConfiguredReadOnlyDatabaseClient {
  const pool = getReadPool(connectionString);
  return {
    kind: 'configured',
    connectionString,
    async queryRows<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        if (scopeUserId) {
          await client.query("SELECT set_config('stock_insight.user_id', $1, true)", [scopeUserId]);
        }
        const result = await client.query<TRow>(sql, [...params]);
        await client.query('ROLLBACK');
        return result.rows;
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async withReadSnapshot<TResult>(
      work: (executor: ReadSnapshotExecutor) => Promise<TResult>,
      options: Partial<ReadSnapshotOptions> = {},
    ): Promise<TResult> {
      return withReadSnapshot(
        {
          async connect() {
            const client = await pool.connect();
            return {
              async queryRows<TRow extends Record<string, unknown> = Record<string, unknown>>(
                sql: string,
                params: readonly unknown[] = [],
              ): Promise<TRow[]> {
                const result = await client.query<TRow & QueryResultRow>(sql, [...params]);
                return result.rows;
              },
              release() {
                client.release();
              },
            };
          },
        },
        work,
        { ...defaultReadSnapshotOptions, ...options, sessionUserId: scopeUserId },
      );
    },
    async close() {
      // Scoped clients share the process pool; the pool is torn down centrally.
      const cached = readPoolCache.get(connectionString);
      if (cached === pool) {
        readPoolCache.delete(connectionString);
        await pool.end();
      }
    },
  };
}

function buildWriteClient(
  connectionString: string,
  scopeUserId: string | undefined,
): ConfiguredDatabaseClient {
  const pool = getWritePool(connectionString);
  return {
    kind: 'configured',
    connectionString,
    async queryRows<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (scopeUserId) {
          await client.query("SELECT set_config('stock_insight.user_id', $1, true)", [scopeUserId]);
        }
        const result = await client.query<TRow>(sql, [...params]);
        await client.query('COMMIT');
        return result.rows;
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async withTransaction<TResult>(
      work: (executor: WriteTransactionExecutor) => Promise<TResult>,
      options: Partial<Omit<WriteTransactionOptions, 'sessionUserId'>> = {},
    ): Promise<TResult> {
      if (!scopeUserId) throw new Error('A user scope is required for writes');
      return withWriteTransaction(
        {
          async connect() {
            const client = await pool.connect();
            return {
              async queryRows<TRow extends Record<string, unknown> = Record<string, unknown>>(
                sql: string,
                params: readonly unknown[] = [],
              ): Promise<TRow[]> {
                const result = await client.query<TRow & QueryResultRow>(sql, [...params]);
                return result.rows;
              },
              release() {
                client.release();
              },
            };
          },
        },
        work,
        { ...defaultWriteTransactionOptions, ...options, sessionUserId: scopeUserId },
      );
    },
    async close() {
      const cached = writePoolCache.get(connectionString);
      if (cached === pool) {
        writePoolCache.delete(connectionString);
        await pool.end();
      }
    },
  };
}

// Legacy factory: scope comes from the environment (single-user fallback).
export function createReadOnlyDatabaseClient(
  env: ServerEnv = parseServerEnv(),
): ReadOnlyDatabaseClient {
  const connectionString = resolveDatabaseConnectionStrings(env).read;
  if (connectionString === undefined) {
    return { kind: 'disabled', reason: 'DATABASE_URL is not configured' };
  }
  return buildReadOnlyClient(connectionString, env.userId);
}

export function createDatabaseClient(env: ServerEnv = parseServerEnv()): DatabaseClient {
  const connectionString = resolveDatabaseConnectionStrings(env).write;
  if (!connectionString) {
    return { kind: 'disabled', reason: 'DATABASE_WRITE_URL is not configured' };
  }
  return buildWriteClient(connectionString, env.userId);
}

// Signup bootstrap write client: multi-user signup mints the user, so there is
// no pre-existing scope to bind. The invitation-consume function is SECURITY
// DEFINER and sets its own transaction-local user GUC internally, so this client
// runs a plain BEGIN/COMMIT transaction WITHOUT requiring env.userId. It must
// only ever be used for the invitation signup path.
export function createSignupDatabaseClient(env: ServerEnv = parseServerEnv()): DatabaseClient {
  const connectionString = resolveDatabaseConnectionStrings(env).write;
  if (!connectionString) {
    return { kind: 'disabled', reason: 'DATABASE_WRITE_URL is not configured' };
  }
  const pool = getWritePool(connectionString);
  return {
    kind: 'configured',
    connectionString,
    async queryRows<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const client = await pool.connect();
      try {
        const result = await client.query<TRow>(sql, [...params]);
        return result.rows;
      } finally {
        client.release();
      }
    },
    async withTransaction<TResult>(
      work: (executor: WriteTransactionExecutor) => Promise<TResult>,
    ): Promise<TResult> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('statement_timeout', $1, true)", [
          `${defaultWriteTransactionOptions.statementTimeoutMs}ms`,
        ]);
        await client.query("SELECT set_config('lock_timeout', $1, true)", [
          `${defaultWriteTransactionOptions.lockTimeoutMs}ms`,
        ]);
        const result = await work({
          queryRows: async <TRow extends Record<string, unknown> = Record<string, unknown>>(
            sql: string,
            params: readonly unknown[] = [],
          ): Promise<TRow[]> => {
            const rows = await client.query<TRow & QueryResultRow>(sql, [...params]);
            return rows.rows;
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      const cached = writePoolCache.get(connectionString);
      if (cached === pool) {
        writePoolCache.delete(connectionString);
        await pool.end();
      }
    },
  };
}

// Multi-user factories: the scope is the verified session subject, bound per
// request. A missing/malformed scope fails closed before any pool is touched.
export function createScopedReadOnlyDatabaseClient(
  userId: string,
  env: ServerEnv = parseServerEnv(),
): ReadOnlyDatabaseClient {
  const scope = requireUuidScope(userId);
  const connectionString = resolveDatabaseConnectionStrings(env).read;
  if (connectionString === undefined) {
    return { kind: 'disabled', reason: 'DATABASE_URL is not configured' };
  }
  return buildReadOnlyClient(connectionString, scope);
}

export function createScopedDatabaseClient(
  userId: string,
  env: ServerEnv = parseServerEnv(),
): DatabaseClient {
  const scope = requireUuidScope(userId);
  const connectionString = resolveDatabaseConnectionStrings(env).write;
  if (!connectionString) {
    return { kind: 'disabled', reason: 'DATABASE_WRITE_URL is not configured' };
  }
  return buildWriteClient(connectionString, scope);
}
