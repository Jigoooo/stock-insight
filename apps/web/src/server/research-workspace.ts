import '@tanstack/react-start/server-only';

import { selectInitialRelationRoot } from '@/pages/research-workspace/model/relation-root';
import {
  createPostgresStockReadModel,
  createReadOnlyDatabaseClient,
  getDecisionHistory,
  getEntityRelations,
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

function createResearchReadContext() {
  const env = parseServerEnv();
  const userScope = requireUserScope(env);
  const database = createReadOnlyDatabaseClient(env);
  if (database.kind === 'disabled') {
    throw new Error('Research database is not configured');
  }
  return { database, userScope };
}

export async function loadResearchWorkspaceInitial() {
  const { database, userScope } = createResearchReadContext();
  return database.withReadSnapshot(async (executor) => {
    const today = await getWorkspaceToday(executor, { userScope });
    const defaultRecord = today.defaultRecordKey
      ? await getResearchRecordDetail(executor, {
          userScope,
          recordKey: today.defaultRecordKey,
        })
      : null;
    const radar = await getRadarSignals(executor, { userScope, limit: 30 });
    const themes = await getThemeResearchList(executor, { userScope });
    const relationRoot = selectInitialRelationRoot(
      defaultRecord?.affectedEntityKeys ?? [],
      themes.items,
    );
    const myResearch = await getMyResearchOverview(executor, { userScope });
    const history = await getDecisionHistory(executor, { userScope, limit: 30 });
    const status = await getSystemStatus(executor);
    const stocks = await getStockList({
      readModel: createPostgresStockReadModel(
        (sql, params) => executor.queryRows<StockDatabaseRow>(sql, params),
        userScope,
      ),
    });
    const relation = relationRoot
      ? await getEntityRelations(executor, { userScope, entityKey: relationRoot, depth: 1 })
      : null;

    return { today, defaultRecord, radar, themes, myResearch, history, status, stocks, relation };
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
  return database.withReadSnapshot((executor) =>
    getEntityRelations(executor, { userScope, entityKey, depth }),
  );
}
