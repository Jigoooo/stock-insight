import pg from 'pg';

import type { ApiServerEnv } from '../config/env.ts';

export type DbProbeResult =
  | { status: 'ok'; latencyMs: number }
  | { status: 'disabled'; reason: string }
  | { status: 'error'; message: string };

export type DbService = {
  kind: 'configured' | 'disabled';
  probe: () => Promise<DbProbeResult>;
  onApplicationShutdown?: () => Promise<void>;
};

export function createDbService(env: ApiServerEnv): DbService {
  const connectionString = env.databaseReadUrl;
  if (!connectionString) {
    return {
      kind: 'disabled',
      probe: () =>
        Promise.resolve({ status: 'disabled', reason: 'DATABASE_URL is not configured' }),
    };
  }

  const pool = new pg.Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return {
    kind: 'configured',
    async probe(): Promise<DbProbeResult> {
      const startedAt = performance.now();
      const client = await pool.connect().catch((error: unknown) => {
        return { connectError: error instanceof Error ? error.message : String(error) };
      });
      if ('connectError' in client) {
        return { status: 'error', message: client.connectError };
      }
      try {
        await client.query('BEGIN READ ONLY');
        await client.query('SELECT 1');
        await client.query('ROLLBACK');
        return { status: 'ok', latencyMs: Math.round(performance.now() - startedAt) };
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // best-effort cleanup; preserve the original failure
        }
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
      } finally {
        client.release();
      }
    },
    async onApplicationShutdown(): Promise<void> {
      await pool.end();
    },
  };
}
