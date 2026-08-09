import type {
  ResearchWorkspaceViewOptions,
  ResearchWorkspaceViewPayload,
} from '../pages/research-workspace/model/workspace-view-payload.ts';

type ViewPayload<View extends ResearchWorkspaceViewOptions['view']> = Extract<
  ResearchWorkspaceViewPayload,
  { view: View }
>;

export type ResearchWorkspaceLoaders = {
  loadGeo: (userId: string) => Promise<ViewPayload<'radar'>['geoSnapshot']>;
  loadHistory: (
    userId: string,
    options: { cursor?: string; limit: number },
  ) => Promise<ViewPayload<'history'>['history']>;
  loadRadar: (
    userId: string,
    options: { cursor?: string; limit: number },
  ) => Promise<ViewPayload<'radar'>['radar']>;
  loadRecord: (userId: string, recordKey: string) => Promise<ViewPayload<'today'>['defaultRecord']>;
  loadShell: (userId: string) => Promise<ViewPayload<'today'>['shell']>;
  loadStatus: (userId: string) => Promise<ViewPayload<'status'>['status']>;
  loadStocks: (userId: string) => Promise<ViewPayload<'stocks'>['stocks']>;
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
  }

  const [activeSlice, shell] = await Promise.all([activeSlicePromise, shellPromise]);
  return {
    ...activeSlice,
    shell,
    view: options.view,
  } as ResearchWorkspaceViewPayload;
}
