import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getWorkspaceShellSummary,
  type WorkspaceShellSummaryQueryExecutor,
} from '../src/workspace/shell-summary.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;

describe('workspace shell summary read model', () => {
  it('loads both navigation counts in one user-scoped query', async () => {
    let executedSql = '';
    let executedParameters: readonly unknown[] = [];
    const executor: WorkspaceShellSummaryQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) => {
        executedSql = sql;
        executedParameters = parameters;
        return [{ radar_scope_total: '740', watchlist_count: '10' }] as unknown as TRow[];
      },
    };

    const summary = await getWorkspaceShellSummary(executor, { userScope });

    assert.deepEqual(summary, { radarScopeTotal: 740, watchlistCount: 10 });
    assert.deepEqual(executedParameters, [userScope.userId]);
    assert.match(
      executedSql,
      /FROM public\.user_watchlist[\s\S]*WHERE user_id = \$1::uuid[\s\S]*active = true/,
    );
    assert.match(executedSql, /FROM public\.market_signals signal/);
    assert.equal((executedSql.match(/SELECT count\(\*\)/g) ?? []).length, 2);
  });
});
