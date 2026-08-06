import type { UserScope } from '../shared/user-scope.ts';

export type WorkspaceShellSummaryQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetWorkspaceShellSummaryOptions = Readonly<{
  userScope: UserScope;
}>;

export type WorkspaceShellSummary = Readonly<{
  radarScopeTotal: number;
  watchlistCount: number;
}>;

type WorkspaceShellSummaryRow = {
  radar_scope_total: number | string;
  watchlist_count: number | string;
};

const WORKSPACE_SHELL_SUMMARY_SQL = `
  SELECT
    (
      SELECT count(*)::int
      FROM public.market_signals signal
      JOIN public.entities entity ON entity.id = signal.entity_id
      WHERE signal.domain = 'stock'
        AND entity.entity_type = 'ticker'
        AND entity.market IN ('KR', 'US')
        AND signal.signal_key IS NOT NULL
        AND signal.occurred_at IS NOT NULL
    ) AS radar_scope_total,
    (
      SELECT count(*)::int
      FROM public.user_watchlist
      WHERE user_id = $1::uuid
        AND active = true
    ) AS watchlist_count
`;

function toCount(value: number | string, label: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return count;
}

export async function getWorkspaceShellSummary(
  executor: WorkspaceShellSummaryQueryExecutor,
  options: GetWorkspaceShellSummaryOptions,
): Promise<WorkspaceShellSummary> {
  const [row] = await executor.queryRows<WorkspaceShellSummaryRow>(WORKSPACE_SHELL_SUMMARY_SQL, [
    options.userScope.userId,
  ]);
  if (!row) throw new Error('Workspace shell summary query returned no rows');
  return {
    radarScopeTotal: toCount(row.radar_scope_total, 'Radar scope total'),
    watchlistCount: toCount(row.watchlist_count, 'Watchlist count'),
  };
}
