import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg, { type QueryResultRow } from 'pg';

import { createPostgresDashboardReadModel } from '../src/dashboard/read-model.ts';
import { getDecisionHistory } from '../src/history/read-model.ts';
import { getMyResearchOverview } from '../src/my-research/read-model.ts';
import { getRadarSignals } from '../src/radar/read-model.ts';
import { getEntityRelations } from '../src/relations/read-model.ts';
import { withReadSnapshot } from '../src/server/read-snapshot.ts';
import { getSystemStatus } from '../src/status/read-model.ts';
import { createPostgresStockReadModel } from '../src/stocks/read-model.ts';
import { getThemeResearchList } from '../src/themes/read-model.ts';
import { getWorkspaceToday } from '../src/workspace/read-model.ts';
import { getResearchRecordDetail } from '../src/workspace/record-detail.ts';

const databaseUrl = process.env.STOCK_INSIGHT_LIVE_DB_URL;
const userId = process.env.STOCK_INSIGHT_LIVE_USER_ID;
const skipReason =
  databaseUrl && userId
    ? false
    : 'STOCK_INSIGHT_LIVE_DB_URL and STOCK_INSIGHT_LIVE_USER_ID are required';

describe('v3 live PostgreSQL read models', () => {
  it(
    'loads workspace, detail, status, and relation through repeatable-read snapshots',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      assert.ok(userId);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      const provider = {
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
      };
      const snapshot = <TResult>(
        work: Parameters<typeof withReadSnapshot<TResult>>[1],
      ): Promise<TResult> =>
        withReadSnapshot(provider, work, {
          statementTimeoutMs: 5_000,
          lockTimeoutMs: 1_000,
          sessionUserId: userId,
        });
      const userScope = { userId };

      try {
        const workspace = await snapshot((executor) => getWorkspaceToday(executor, { userScope }));
        assert.match(workspace.meta.contentSnapshot.analysisRunId, /^stock:/);
        assert.equal(workspace.lanes.length, 3);

        const detail = workspace.defaultRecordKey
          ? await snapshot((executor) =>
              getResearchRecordDetail(executor, {
                userScope,
                recordKey: workspace.defaultRecordKey!,
              }),
            )
          : null;
        if (workspace.defaultRecordKey) assert.equal(detail?.recordKey, workspace.defaultRecordKey);

        const status = await snapshot((executor) => getSystemStatus(executor));
        const history = await snapshot((executor) =>
          getDecisionHistory(executor, { userScope, limit: 20 }),
        );
        const myResearch = await snapshot((executor) =>
          getMyResearchOverview(executor, { userScope }),
        );
        const radar = await snapshot((executor) =>
          getRadarSignals(executor, { userScope, limit: 20 }),
        );
        const themes = await snapshot((executor) => getThemeResearchList(executor, { userScope }));
        const legacyStocks = await snapshot((executor) =>
          createPostgresStockReadModel(executor.queryRows, userScope).listStocks({ scope: 'all' }),
        );
        const legacyDashboard = await snapshot((executor) =>
          createPostgresDashboardReadModel(executor.queryRows, userScope).loadDashboardBootstrap(),
        );
        assert.ok(status.datasets.length > 0);
        assert.ok(legacyStocks.length > 0);
        assert.ok(
          'data' in legacyDashboard
            ? legacyDashboard.data.stocks.length > 0
            : legacyDashboard.stocks.length > 0,
        );

        const relationEntity = workspace.lanes
          .flatMap(({ items }) => items)
          .flatMap(({ affectedEntityKeys }) => affectedEntityKeys)[0];
        const graph = relationEntity
          ? await snapshot((executor) =>
              getEntityRelations(executor, { userScope, entityKey: relationEntity, depth: 1 }),
            )
          : null;
        if (graph) {
          assert.ok(graph.nodes.length <= 20);
          assert.ok(graph.edges.every(({ approved, inferred }) => approved && !inferred));
        }

        console.log(
          JSON.stringify({
            run: workspace.meta.contentSnapshot.analysisRunId,
            revision: workspace.meta.contentSnapshot.analysisRevision,
            lanes: workspace.lanes.map(({ lane, items, scopeTotal }) => ({
              lane,
              returned: items.length,
              total: scopeTotal,
            })),
            detail: detail ? { recordKey: detail.recordKey, sources: detail.sources.length } : null,
            status: {
              overall: status.overall,
              datasets: status.datasets.length,
              sourceCoverage: status.sourceCoverage,
              graphSourceCoverage: status.graphSourceCoverage,
            },
            history: {
              total: history.scopeTotal,
              returned: history.items.length,
              uuidIds: history.items.every(({ historyId }) =>
                /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(historyId),
              ),
            },
            myResearch: {
              watchlist: myResearch.watchlistCount,
              holdings: myResearch.holdingCount,
              recent: myResearch.recentHistory.length,
            },
            radar: { total: radar.scopeTotal, returned: radar.items.length },
            themes: { availability: themes.availability, returned: themes.items.length },
            legacy: {
              stocks: legacyStocks.length,
              dashboardStocks:
                'data' in legacyDashboard
                  ? legacyDashboard.data.stocks.length
                  : legacyDashboard.stocks.length,
            },
            relation: graph
              ? { root: graph.rootEntityKey, nodes: graph.nodes.length, edges: graph.edges.length }
              : null,
          }),
        );
      } finally {
        await pool.end();
      }
    },
  );
});
