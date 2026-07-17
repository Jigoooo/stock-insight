import pg, { type Pool as PgPool, type PoolClient, type QueryResultRow } from 'pg';

import { resolveDatabaseConnectionStrings } from './database-connection-policy';
import { parseServerEnv, type ServerEnv } from './env';
import {
  withReadSnapshot,
  type ReadSnapshotExecutor,
  type ReadSnapshotOptions,
} from './read-snapshot';
import {
  withWriteTransaction,
  type WriteTransactionExecutor,
  type WriteTransactionOptions,
} from './write-transaction';

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

let pgPoolConstructor: PgModule['Pool'] | undefined;
let cachedConfiguredClient: ConfiguredReadOnlyDatabaseClient | undefined;
let cachedConfiguredWriteClient: ConfiguredDatabaseClient | undefined;

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

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original read failure; rollback is best-effort cleanup.
  }
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

export function createReadOnlyDatabaseClient(
  env: ServerEnv = parseServerEnv(),
): ReadOnlyDatabaseClient {
  const connectionString = resolveDatabaseConnectionStrings(env).read;
  if (connectionString === undefined) {
    return {
      kind: 'disabled',
      reason: 'DATABASE_URL is not configured',
    };
  }

  if (cachedConfiguredClient?.connectionString === connectionString) return cachedConfiguredClient;

  const Pool = getPgPoolConstructor();
  const pool = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  const configuredClient: ConfiguredReadOnlyDatabaseClient = {
    kind: 'configured',
    connectionString,
    async queryRows<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        if (env.userId) {
          await client.query("SELECT set_config('stock_insight.user_id', $1, true)", [env.userId]);
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
        { ...defaultReadSnapshotOptions, ...options, sessionUserId: env.userId },
      );
    },
    async close() {
      if (cachedConfiguredClient?.connectionString === connectionString)
        cachedConfiguredClient = undefined;
      await pool.end();
    },
  };

  cachedConfiguredClient = configuredClient;
  return configuredClient;
}

export function createDatabaseClient(env: ServerEnv = parseServerEnv()): DatabaseClient {
  const connectionString = resolveDatabaseConnectionStrings(env).write;
  if (!connectionString) {
    return {
      kind: 'disabled',
      reason: 'DATABASE_WRITE_URL is not configured',
    };
  }

  if (cachedConfiguredWriteClient?.connectionString === connectionString)
    return cachedConfiguredWriteClient;

  const Pool = getPgPoolConstructor();
  const pool = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  cachedConfiguredWriteClient = {
    kind: 'configured',
    connectionString,
    async queryRows<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (env.userId) {
          await client.query("SELECT set_config('stock_insight.user_id', $1, true)", [env.userId]);
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
      if (!env.userId) throw new Error('STOCK_INSIGHT_USER_ID is required for writes');
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
        { ...defaultWriteTransactionOptions, ...options, sessionUserId: env.userId },
      );
    },
    async close() {
      if (cachedConfiguredWriteClient?.connectionString === connectionString)
        cachedConfiguredWriteClient = undefined;
      await pool.end();
    },
  };

  return cachedConfiguredWriteClient;
}
