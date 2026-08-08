import { selectInitialRelationRoot } from '../pages/research-workspace/model/relation-root.ts';
import type {
  ResearchWorkspaceViewOptions,
  ResearchWorkspaceViewPayload,
} from '../pages/research-workspace/model/workspace-view-payload.ts';

type ViewPayload<View extends ResearchWorkspaceViewOptions['view']> = Extract<
  ResearchWorkspaceViewPayload,
  { view: View }
>;

export type ResearchWorkspaceLoaders = {
  loadCrypto: (
    userId: string,
    options: { limit: number },
  ) => Promise<ViewPayload<'crypto'>['crypto']>;
  loadGeo: (userId: string) => Promise<ViewPayload<'radar'>['geoSnapshot']>;
  loadHistory: (
    userId: string,
    options: { cursor?: string; limit: number },
  ) => Promise<ViewPayload<'history'>['history']>;
  loadMarketTopicNews: (
    userId: string,
  ) => Promise<ViewPayload<'market-topic-news'>['marketTopicNews']>;
  loadRadar: (
    userId: string,
    options: { cursor?: string; limit: number },
  ) => Promise<ViewPayload<'radar'>['radar']>;
  loadRecord: (userId: string, recordKey: string) => Promise<ViewPayload<'today'>['defaultRecord']>;
  loadRelation: (
    userId: string,
    entityKey: string,
    depth: number,
  ) => Promise<ViewPayload<'themes'>['relation']>;
  loadShell: (userId: string) => Promise<ViewPayload<'today'>['shell']>;
  loadStatus: (userId: string) => Promise<ViewPayload<'status'>['status']>;
  loadStocks: (userId: string) => Promise<ViewPayload<'stocks'>['stocks']>;
  loadThemes: (userId: string) => Promise<ViewPayload<'themes'>['themes']>;
  loadToday: (userId: string) => Promise<ViewPayload<'today'>['today']>;
};

type WithoutShell<Payload> = Payload extends unknown ? Omit<Payload, 'shell'> : never;

export async function orchestrateResearchWorkspaceView(
  loaders: ResearchWorkspaceLoaders,
  userId: string,
  options: ResearchWorkspaceViewOptions,
): Promise<ResearchWorkspaceViewPayload> {
  const shellPromise = loaders.loadShell(userId);

  let activeSlicePromise: Promise<WithoutShell<ResearchWorkspaceViewPayload>>;
  switch (options.view) {
    case 'today': {
      activeSlicePromise = loaders.loadToday(userId).then(async (today) => {
        // The route-owned inspector is closed until the URL carries an
        // explicit record key, and it fetches newly selected details on demand.
        // Loading the first feed record here delayed every Today entry for data
        // that was not visible.
        const recordKey = options.record;
        const defaultRecord = recordKey ? await loaders.loadRecord(userId, recordKey) : null;
        return {
          defaultRecord,
          lane: options.lane ?? 'must_know',
          today,
          view: 'today',
        };
      });
      break;
    }
    case 'radar': {
      const radarPromise = loaders.loadRadar(userId, {
        ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
        limit: 30,
      });
      const geoPromise = loaders.loadGeo(userId);
      activeSlicePromise = Promise.all([radarPromise, geoPromise]).then(([radar, geoSnapshot]) => ({
        geoSnapshot,
        radar,
        view: 'radar',
      }));
      break;
    }
    case 'stocks': {
      activeSlicePromise = loaders
        .loadStocks(userId)
        .then((stocks) => ({ stocks, view: 'stocks' as const }));
      break;
    }
    case 'crypto': {
      activeSlicePromise = loaders
        .loadCrypto(userId, { limit: 40 })
        .then((crypto) => ({ crypto, view: 'crypto' as const }));
      break;
    }
    case 'themes': {
      activeSlicePromise = loaders.loadThemes(userId).then(async (themes) => {
        const relationRoot = selectInitialRelationRoot([], themes.items);
        const relation = relationRoot ? await loaders.loadRelation(userId, relationRoot, 1) : null;
        return { relation, themes, view: 'themes' as const };
      });
      break;
    }
    case 'history': {
      activeSlicePromise = loaders
        .loadHistory(userId, {
          ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
          limit: 30,
        })
        .then((history) => ({ history, view: 'history' as const }));
      break;
    }
    case 'status': {
      activeSlicePromise = loaders
        .loadStatus(userId)
        .then((status) => ({ status, view: 'status' as const }));
      break;
    }
    case 'market-topic-news': {
      activeSlicePromise = loaders
        .loadMarketTopicNews(userId)
        .then((marketTopicNews) => ({ marketTopicNews, view: 'market-topic-news' as const }));
      break;
    }
  }

  const [activeSlice, shell] = await Promise.all([activeSlicePromise, shellPromise]);
  return {
    ...activeSlice,
    shell,
    view: options.view,
  } as ResearchWorkspaceViewPayload;
}
