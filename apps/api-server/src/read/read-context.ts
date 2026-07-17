// Shared per-request read-context construction.
// Mirrors apps/web route handlers and src/server/research-workspace.ts exactly:
//  - requireUserScope BEFORE db-disabled check (order matters for error parity)
//  - row-model routes: each query in its own BEGIN READ ONLY txn (db.queryRows)
//  - research routes: single withReadSnapshot per request
import {
  createReadOnlyDatabaseClient,
  parseServerEnv,
  requireUserScope,
  type ReadSnapshotExecutor,
  type UserScope,
} from '@stock-insight/api';

export type RowQueryFn = <TRow extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: readonly unknown[],
) => Promise<TRow[]>;

export function scopedRowQuery(): { queryRows: RowQueryFn; userScope: UserScope } | undefined {
  const userScope = requireUserScope(parseServerEnv());
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;
  return { queryRows: (sql, params) => db.queryRows(sql, params), userScope };
}

export function unscopedRowQuery(): { queryRows: RowQueryFn } | undefined {
  const db = createReadOnlyDatabaseClient();
  if (db.kind === 'disabled') return undefined;
  return { queryRows: (sql, params) => db.queryRows(sql, params) };
}

export function researchContext(): {
  withSnapshot: <T>(work: (executor: ReadSnapshotExecutor) => Promise<T>) => Promise<T>;
  userScope: UserScope;
} {
  const env = parseServerEnv();
  const userScope = requireUserScope(env);
  const database = createReadOnlyDatabaseClient(env);
  if (database.kind === 'disabled') {
    throw new Error('Research database is not configured');
  }
  return {
    withSnapshot: (work) => database.withReadSnapshot(work),
    userScope,
  };
}
