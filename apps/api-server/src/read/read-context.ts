// Shared per-request read-context construction.
// Multi-user: the scope is the verified session subject carried by the internal
// context store (populated by the internal-context interceptor after the signed
// header is verified). There is NO ambient/server-owned fallback user id.
//  - row-model routes: each query in its own BEGIN READ ONLY txn (db.queryRows)
//  - research routes: single withReadSnapshot per request
import { requireRequestUserScope } from './internal-context-store.ts';

import {
  createScopedReadOnlyDatabaseClient,
  parseServerEnv,
  type ReadSnapshotExecutor,
  type UserScope,
} from '@stock-insight/api';

export type RowQueryFn = <TRow extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: readonly unknown[],
) => Promise<TRow[]>;

export function scopedRowQuery(): { queryRows: RowQueryFn; userScope: UserScope } | undefined {
  const userScope = requireRequestUserScope();
  const db = createScopedReadOnlyDatabaseClient(userScope.userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;
  return { queryRows: (sql, params) => db.queryRows(sql, params), userScope };
}

export function unscopedRowQuery(): { queryRows: RowQueryFn } | undefined {
  // Shared-market reads (market news, price series) still run under the caller's
  // verified scope so RLS-protected relations they may touch stay consistent.
  const userScope = requireRequestUserScope();
  const db = createScopedReadOnlyDatabaseClient(userScope.userId, parseServerEnv());
  if (db.kind === 'disabled') return undefined;
  return { queryRows: (sql, params) => db.queryRows(sql, params) };
}

export function researchContext(): {
  withSnapshot: <T>(work: (executor: ReadSnapshotExecutor) => Promise<T>) => Promise<T>;
  userScope: UserScope;
} {
  const userScope = requireRequestUserScope();
  const database = createScopedReadOnlyDatabaseClient(userScope.userId, parseServerEnv());
  if (database.kind === 'disabled') {
    throw new Error('Research database is not configured');
  }
  return {
    withSnapshot: (work) => database.withReadSnapshot(work),
    userScope,
  };
}
