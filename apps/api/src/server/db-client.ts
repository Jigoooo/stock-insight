import pg, { type Pool as PgPool, type PoolClient, type QueryResultRow } from 'pg';

import { parseServerEnv, type ServerEnv } from './env';

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
  close: () => Promise<void>;
};

export type ConfiguredDatabaseClient = {
  kind: 'configured';
  connectionString: string;
  queryRows: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
  close: () => Promise<void>;
};

let pgPoolConstructor: PgModule['Pool'] | undefined;
let cachedConfiguredClient: ConfiguredReadOnlyDatabaseClient | undefined;
let cachedConfiguredWriteClient: ConfiguredDatabaseClient | undefined;

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
      reason: 'DATABASE_URL is not configured';
    }
  | ConfiguredDatabaseClient;

export function createReadOnlyDatabaseClient(
  env: ServerEnv = parseServerEnv(),
): ReadOnlyDatabaseClient {
  if (!env.databaseUrl) {
    return {
      kind: 'disabled',
      reason: 'DATABASE_URL is not configured',
    };
  }

  if (cachedConfiguredClient?.connectionString === env.databaseUrl) return cachedConfiguredClient;

  const Pool = getPgPoolConstructor();
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  cachedConfiguredClient = {
    kind: 'configured',
    connectionString: env.databaseUrl,
    async queryRows<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
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
    async close() {
      if (cachedConfiguredClient?.connectionString === env.databaseUrl)
        cachedConfiguredClient = undefined;
      await pool.end();
    },
  };

  return cachedConfiguredClient;
}

export function createDatabaseClient(env: ServerEnv = parseServerEnv()): DatabaseClient {
  if (!env.databaseUrl) {
    return {
      kind: 'disabled',
      reason: 'DATABASE_URL is not configured',
    };
  }

  if (cachedConfiguredWriteClient?.connectionString === env.databaseUrl)
    return cachedConfiguredWriteClient;

  const Pool = getPgPoolConstructor();
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  cachedConfiguredWriteClient = {
    kind: 'configured',
    connectionString: env.databaseUrl,
    async queryRows<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
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
    async close() {
      if (cachedConfiguredWriteClient?.connectionString === env.databaseUrl)
        cachedConfiguredWriteClient = undefined;
      await pool.end();
    },
  };

  return cachedConfiguredWriteClient;
}
