import '@tanstack/react-start/server-only';

import { selectInitialRelationRoot } from '@/pages/research-workspace/model/relation-root';
import type {
  ResearchWorkspaceShellSummary,
  ResearchWorkspaceViewOptions,
  ResearchWorkspaceViewPayload,
} from '@/pages/research-workspace/model/workspace-view-payload';
import {
  createPostgresStockReadModel,
  createReadOnlyDatabaseClient,
  getDecisionHistory,
  getEntityRelationsWithV2Preference,
  getMyResearchOverview,
  getRadarSignals,
  getResearchFeedPage,
  getResearchRecordDetail,
  getStockList,
  getSystemStatus,
  getThemeResearchList,
  getWorkspaceToday,
  parseServerEnv,
  requireUserScope,
  type StockDatabaseRow,
} from '@stock-insight/api';
import type {
  MyResearchOverview,
  RadarSignalPage,
} from '@stock-insight/contracts/research-workspace';

type WithoutShell<Payload> = Payload extends unknown ? Omit<Payload, 'shell'> : never;

function createResearchReadContext() {
  const env = parseServerEnv();
  const userScope = requireUserScope(env);
  const database = createReadOnlyDatabaseClient(env);
  if (database.kind === 'disabled') {
    throw new Error('Research database is not configured');
  }
  return { database, userScope };
}

export async function loadResearchWorkspaceView(
  options: ResearchWorkspaceViewOptions,
): Promise<ResearchWorkspaceViewPayload> {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot(async (executor) => {
    let activeRadar: RadarSignalPage | undefined;
    let activeResearch: MyResearchOverview | undefined;
    let activeSlice: WithoutShell<ResearchWorkspaceViewPayload>;

    switch (options.view) {
      case 'today': {
        const today = await getWorkspaceToday(executor, { userScope });
        const recordKey = options.record ?? today.defaultRecordKey;
        const defaultRecord = recordKey
          ? await getResearchRecordDetail(executor, { userScope, recordKey })
          : null;
        activeSlice = {
          defaultRecord,
          lane: options.lane ?? 'must_know',
          today,
          view: options.view,
        };
        break;
      }
      case 'radar': {
        activeRadar = await getRadarSignals(executor, {
          userScope,
          cursor: options.cursor,
          limit: 30,
        });
        activeSlice = { radar: activeRadar, view: options.view };
        break;
      }
      case 'stocks': {
        const stocks = await getStockList({
          readModel: createPostgresStockReadModel(
            (sql, params) => executor.queryRows<StockDatabaseRow>(sql, params),
            userScope,
          ),
        });
        activeSlice = { stocks, view: options.view };
        break;
      }
      case 'themes': {
        const themes = await getThemeResearchList(executor, { userScope });
        const relationRoot = selectInitialRelationRoot([], themes.items);
        const relation = relationRoot
          ? (
              await getEntityRelationsWithV2Preference(executor, {
                entityKey: relationRoot,
                depth: 1,
                userId: userScope.userId,
                now: new Date(),
              })
            ).graph
          : null;
        activeSlice = { relation, themes, view: options.view };
        break;
      }
      case 'research': {
        activeResearch = await getMyResearchOverview(executor, { userScope });
        activeSlice = { myResearch: activeResearch, view: options.view };
        break;
      }
      case 'history': {
        const history = await getDecisionHistory(executor, {
          userScope,
          cursor: options.cursor,
          limit: 30,
        });
        activeSlice = { history, view: options.view };
        break;
      }
      case 'status': {
        const status = await getSystemStatus(executor);
        activeSlice = { status, view: options.view };
        break;
      }
    }

    const radarSummary = activeRadar ?? (await getRadarSignals(executor, { userScope, limit: 1 }));
    const researchSummary =
      activeResearch ?? (await getMyResearchOverview(executor, { userScope }));
    const shell: ResearchWorkspaceShellSummary = {
      radarScopeTotal: radarSummary.scopeTotal,
      watchlistCount: researchSummary.watchlistCount,
    };
    return { ...activeSlice, shell, view: options.view } as ResearchWorkspaceViewPayload;
  });
}

export async function loadResearchWorkspace() {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot((executor) => getWorkspaceToday(executor, { userScope }));
}

export async function loadResearchFeedPage(options: {
  lane: 'must_know' | 'for_you' | 'explore';
  cursor?: string;
  limit?: number;
}) {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot((executor) =>
    getResearchFeedPage(executor, { userScope, ...options }),
  );
}

export async function loadResearchRecord(recordKey: string) {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot((executor) =>
    getResearchRecordDetail(executor, { userScope, recordKey }),
  );
}

export async function loadResearchStatus() {
  const { database } = createResearchReadContext();
  return database.withReadSnapshot((executor) => getSystemStatus(executor));
}

export async function loadDecisionHistoryPage(options: { cursor?: string; limit?: number }) {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot((executor) =>
    getDecisionHistory(executor, { userScope, ...options }),
  );
}

export async function loadMyResearchOverview() {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot((executor) => getMyResearchOverview(executor, { userScope }));
}

export async function loadRadarSignalPage(options: { cursor?: string; limit?: number }) {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot((executor) =>
    getRadarSignals(executor, { userScope, ...options }),
  );
}

export async function loadThemeResearch() {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot((executor) => getThemeResearchList(executor, { userScope }));
}

export async function loadEntityRelationGraph(entityKey: string, depth: number) {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot(async (executor) => {
    const result = await getEntityRelationsWithV2Preference(executor, {
      entityKey,
      depth,
      userId: userScope.userId,
      now: new Date(),
    });
    return result.graph;
  });
}
