import { AlertCircle, UserPlus } from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';

import { EvidenceInspector } from './evidence-inspector';
import {
  HistoryBriefingInspector,
  type HistoryBriefingInspectorState,
} from './history-briefing-inspector';
import styles from './research-workspace-page.module.css';
import { WorkspaceSearch, useDeferredWorkspaceSearch } from './workspace-search';
import { WorkspaceViewErrorBoundary, WorkspaceViewReady } from './workspace-view-boundary';
import { WorkspaceViewRegion } from './workspace-view-region';
import {
  buildHistoryBriefingDetail,
  buildHistoryBriefingModel,
  type HistoryBriefingDetail,
  type HistoryBriefingItem,
  type HistoryBriefingModel,
} from '../model/history-briefing';
import {
  buildMarketConnectionsModel,
  type MarketConnectionLoader,
  type MarketConnectionsModel,
} from '../model/market-connections';
import {
  buildReliabilityBriefingModel,
  type ReliabilityBriefingItem,
  type ReliabilityBriefingModel,
} from '../model/reliability-briefing';
import {
  buildStocksBriefingModel,
  type StockBriefingLoader,
  type StocksBriefingModel,
} from '../model/stock-briefing';
import {
  resolveWorkspaceAuthoritativeOverride,
  type WorkspaceAuthoritativeOverride,
} from '../model/workspace-authoritative-override';
import { createRetryablePromiseCache, retryWorkspaceView } from '../model/workspace-lazy-recovery';
import {
  createWorkspaceNavigationIntentState,
  reduceWorkspaceNavigationIntent,
  resolveWorkspaceVisualSelection,
} from '../model/workspace-navigation-intent';
import { filterWorkspaceStocks } from '../model/workspace-search-filter';
import { isLatestWorkspaceIntent } from '../model/workspace-transition-policy';
import {
  workspaceViewFailureMessage,
  type WorkspaceViewFailureKind,
} from '../model/workspace-view-failure';
import type { ResearchWorkspaceViewPayload } from '../model/workspace-view-payload';

import {
  workspaceSections,
  type WorkspaceNavigationItem,
  type WorkspaceSectionId,
} from '@/features/workspace-navigation';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';
import { WorkspaceState } from '@/shared/ui/workspace';
import { WorkspaceShell } from '@/widgets/workspace-shell';
import type {
  DecisionHistoryPage,
  EntityRelationGraph,
  RadarSignalPage,
  ResearchFeedItem,
  ResearchFeedLaneId,
  ResearchRecordDetail,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type SectionId = WorkspaceSectionId;
export type DetailState = 'ready' | 'loading' | 'error';
export type HistoryBriefingLoader = (historyId: string) => Promise<HistoryBriefingDetail>;

export { AvailabilityNotice, PageHeader } from '@/shared/ui/workspace';
export { WorkspaceState };

function createLazyWorkspaceViews() {
  return {
    crypto: lazy(() =>
      import('./views/crypto-workspace-view').then(({ CryptoWorkspaceView }) => ({
        default: CryptoWorkspaceView,
      })),
    ),
    history: lazy(() =>
      import('./views/history-view').then(({ HistoryView }) => ({ default: HistoryView })),
    ),
    'market-topic-news': lazy(() =>
      import('./views/market-topic-news-view').then(({ MarketTopicNewsView }) => ({
        default: MarketTopicNewsView,
      })),
    ),
    radar: lazy(() =>
      import('./views/market-connections-view').then(({ MarketConnectionsView }) => ({
        default: MarketConnectionsView,
      })),
    ),
    research: lazy(() =>
      import('./views/my-research-view').then(({ MyResearchView }) => ({
        default: MyResearchView,
      })),
    ),
    status: lazy(() =>
      import('./views/status-view').then(({ StatusView }) => ({ default: StatusView })),
    ),
    stocks: lazy(() =>
      import('./views/stocks-view').then(({ StocksView }) => ({ default: StocksView })),
    ),
    themes: lazy(() =>
      import('./views/themes-view').then(({ ThemesView }) => ({ default: ThemesView })),
    ),
    today: lazy(() =>
      import('./views/today-view').then(({ TodayView }) => ({ default: TodayView })),
    ),
  };
}

function createWorkspaceApiClient() {
  return import('@stock-insight/api-client').then(({ createApiClient }) => createApiClient());
}

const getWorkspaceApiClient = createRetryablePromiseCache(createWorkspaceApiClient);

export type ResearchWorkspaceUrlState = {
  view?: SectionId;
  lane?: ResearchFeedLaneId;
  record?: string;
  cursor?: string;
  query?: string;
};

type ResearchWorkspacePageProps = {
  canManageInvitations?: boolean;
  data: ResearchWorkspaceViewPayload;
  loadMarketConnectionDetail?: MarketConnectionLoader;
  loadResearchRecord?: (recordKey: string) => Promise<ResearchRecordDetail>;
  loadStockBriefingDetail?: StockBriefingLoader;
  historyBriefing?: HistoryBriefingModel;
  loadHistoryBriefingDetail?: HistoryBriefingLoader;
  marketConnections?: MarketConnectionsModel;
  reliabilityBriefing?: ReliabilityBriefingModel;
  stocksBriefing?: StocksBriefingModel;
  navigationMode?: 'route' | 'static';
  onLogout?: () => Promise<boolean>;
  onNavigateSection?: (
    section: SectionId,
    next?: Partial<ResearchWorkspaceUrlState>,
  ) => Promise<void>;
  onPrefetchSection?: (section: SectionId) => void;
  urlState?: ResearchWorkspaceUrlState;
  viewLoadError?: SectionId;
  viewLoadFailureKind?: WorkspaceViewFailureKind;
  onUrlStateChange?: (next: Partial<ResearchWorkspaceUrlState>) => Promise<void>;
};

type FeedPaginationValue = {
  failedCursor?: string;
  lanes: Partial<Record<ResearchFeedLaneId, WorkspaceToday['lanes'][number]>>;
  loadedCursors: Partial<Record<ResearchFeedLaneId, string>>;
};

type CursorPaginationValue<Page> = {
  page: Page;
  state: DetailState;
};

function WorkspaceViewLoading() {
  return (
    <WorkspaceState
      delayMs={0}
      kind="loading"
      title="워크스페이스 화면을 준비하고 있습니다"
      description="선택한 리서치 화면을 불러오는 동안 잠시만 기다려 주세요."
    />
  );
}

function createFeedPaginationValue(today: WorkspaceToday): FeedPaginationValue {
  return {
    lanes: Object.fromEntries(today.lanes.map((item) => [item.lane, item])),
    loadedCursors: {},
  };
}

const subscribeHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function ResearchWorkspacePage({
  canManageInvitations = false,
  data,
  loadMarketConnectionDetail,
  loadResearchRecord,
  loadStockBriefingDetail,
  historyBriefing,
  loadHistoryBriefingDetail,
  marketConnections,
  reliabilityBriefing,
  stocksBriefing,
  navigationMode = 'route',
  onLogout,
  onNavigateSection,
  onPrefetchSection,
  urlState = {},
  viewLoadError,
  viewLoadFailureKind,
  onUrlStateChange,
}: ResearchWorkspacePageProps) {
  const [localSection, setLocalSection] = useState<SectionId>(urlState.view ?? data.view);
  const [localLane, setLocalLane] = useState<ResearchFeedLaneId>(
    urlState.lane ?? (data.view === 'today' ? data.lane : 'must_know'),
  );
  const [query, setQuery] = useState(urlState.query ?? '');
  const { deferredQuery, pending: searchPending } = useDeferredWorkspaceSearch(query);
  const [navigationIntent, dispatchNavigationIntent] = useReducer(
    reduceWorkspaceNavigationIntent,
    createWorkspaceNavigationIntentState(),
  );
  const navigationSequenceRef = useRef(0);
  const themeRelationSequenceRef = useRef(0);
  const inspectorOpenerRef = useRef<HTMLElement | null>(null);
  const historyInspectorOpenerRef = useRef<HTMLElement | null>(null);
  const reliabilityInspectorOpenerRef = useRef<HTMLElement | null>(null);
  const historyDetailSequenceRef = useRef(0);
  const issuedInspectorRecordKeysRef = useRef(new Set<string>());
  const [, startNavigationTransition] = useTransition();
  const initialDetail = data.view === 'today' ? data.defaultRecord : null;
  const [detail, setDetail] = useState<ResearchRecordDetail | null>(initialDetail);
  const [pendingRecordKey, setPendingRecordKey] = useState<string | undefined>();
  const requestedRecordKey = pendingRecordKey ?? urlState.record;
  const [relation, setRelation] = useState<EntityRelationGraph | null>(null);
  const [relationState, setRelationState] = useState<DetailState>('error');
  const [themeRelation, setThemeRelation] = useState<EntityRelationGraph | null | undefined>();
  const [themeRelationState, setThemeRelationState] = useState<DetailState>('ready');
  const [detailState, setDetailState] = useState<DetailState>(initialDetail ? 'ready' : 'error');
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(urlState.record));
  const [historyInspectorOpen, setHistoryInspectorOpen] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryBriefingItem | null>(null);
  const [selectedReliabilityItem, setSelectedReliabilityItem] =
    useState<ReliabilityBriefingItem | null>(null);
  const [historyDetail, setHistoryDetail] = useState<HistoryBriefingDetail | null>(null);
  const [historyDetailState, setHistoryDetailState] =
    useState<HistoryBriefingInspectorState>('ready');
  const [dismissedInspectorRecords, setDismissedInspectorRecords] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [resolvedViewKey, setResolvedViewKey] = useState<SectionId | null>(null);
  const [lazyViews, setLazyViews] = useState(createLazyWorkspaceViews);
  const [viewRetryKeys, setViewRetryKeys] = useState<Record<SectionId, number>>({
    crypto: 0,
    history: 0,
    'market-topic-news': 0,
    radar: 0,
    research: 0,
    status: 0,
    stocks: 0,
    themes: 0,
    today: 0,
  });
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [feedPagination, setFeedPagination] = useState<WorkspaceAuthoritativeOverride<
    WorkspaceToday,
    FeedPaginationValue
  > | null>(() =>
    data.view === 'today'
      ? { base: data.today, value: createFeedPaginationValue(data.today) }
      : null,
  );
  const [radarPagination, setRadarPagination] = useState<WorkspaceAuthoritativeOverride<
    RadarSignalPage,
    CursorPaginationValue<RadarSignalPage>
  > | null>(() =>
    data.view === 'radar'
      ? { base: data.radar, value: { page: data.radar, state: 'ready' } }
      : null,
  );
  const [historyPagination, setHistoryPagination] = useState<WorkspaceAuthoritativeOverride<
    DecisionHistoryPage,
    CursorPaginationValue<DecisionHistoryPage>
  > | null>(() =>
    data.view === 'history'
      ? { base: data.history, value: { page: data.history, state: 'ready' } }
      : null,
  );
  const section = onUrlStateChange ? (viewLoadError ?? data.view) : localSection;
  const visualSection = resolveWorkspaceVisualSelection(
    section,
    navigationIntent.pendingSection as SectionId | null,
  );
  const markViewReady = useCallback((readyViewKey: string) => {
    setResolvedViewKey(readyViewKey as SectionId);
  }, []);
  const retryCurrentView = useCallback(() => {
    setResolvedViewKey((current) => (current === section ? null : current));
    setLazyViews((current) => {
      const retryView = createLazyWorkspaceViews()[section];
      return { ...current, [section]: retryView };
    });
    setViewRetryKeys((current) => retryWorkspaceView(current, section));
  }, [section]);
  const {
    crypto: CryptoWorkspaceView,
    history: HistoryView,
    'market-topic-news': MarketTopicNewsView,
    radar: MarketConnectionsView,
    research: MyResearchView,
    status: StatusView,
    stocks: StocksView,
    themes: ThemesView,
    today: TodayView,
  } = lazyViews;
  // The URL is authoritative for the selected lane, not the payload. The today
  // payload carries all three lanes and its `lane` field only echoes whatever
  // the loader was last called with — now that lane is no longer a loader dep,
  // reading it from `data` would pin the UI to the lane at load time and leave
  // the tab highlight stuck while the URL moved on.
  const lane = onUrlStateChange
    ? (urlState.lane ?? (data.view === 'today' ? data.lane : 'must_know'))
    : localLane;
  const visualLane = resolveWorkspaceVisualSelection(
    lane,
    navigationIntent.pendingLane as ResearchFeedLaneId | null,
  );
  const urlInspectorVisible = Boolean(
    urlState.record && !dismissedInspectorRecords.has(urlState.record),
  );
  const inspectorVisible = section === 'today' && (inspectorOpen || urlInspectorVisible);
  const inspectorModalOpen = isMobileViewport && inspectorVisible;
  const historyInspectorVisible = section === 'history' && historyInspectorOpen;
  const loadRecordDetail = useCallback(
    async (recordKey: string) => {
      if (loadResearchRecord) {
        return { detail: await loadResearchRecord(recordKey), relation: null };
      }
      const api = await getWorkspaceApiClient();
      const nextDetail = await api.researchRecord(recordKey);
      const entityKey = nextDetail.affectedEntityKeys[0];
      const nextRelation = entityKey ? await api.entityRelations(entityKey, 1) : null;
      return { detail: nextDetail, relation: nextRelation };
    },
    [loadResearchRecord],
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => {
      setIsMobileViewport(media.matches);
    };
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (data.view === 'themes') return;
    themeRelationSequenceRef.current += 1;
  }, [data.view]);

  useEffect(() => {
    const recordKey = urlState.record;
    if (!recordKey || recordKey === detail?.recordKey) return;
    let active = true;
    void loadRecordDetail(recordKey)
      .then(({ detail: nextDetail, relation: nextRelation }) => {
        if (!active) return;
        setDetail(nextDetail);
        setRelation(nextRelation);
        setRelationState('ready');
        setDetailState('ready');
      })
      .catch(() => {
        if (!active) return;
        setRelationState('error');
        setDetailState('error');
      });
    return () => {
      active = false;
    };
  }, [detail?.recordKey, loadRecordDetail, urlState.record]);

  const feedPaginationValue =
    data.view === 'today'
      ? resolveWorkspaceAuthoritativeOverride(data.today, feedPagination)
      : null;
  const loadedCursor = feedPaginationValue?.loadedCursors[visualLane];
  const failedCursor = feedPaginationValue?.failedCursor;

  useEffect(() => {
    const cursor = urlState.cursor;
    if (
      viewLoadError ||
      data.view !== 'today' ||
      !cursor ||
      loadedCursor === cursor ||
      failedCursor === cursor
    )
      return;
    const authoritativeToday = data.today;
    let active = true;
    void getWorkspaceApiClient()
      .then((api) => api.researchFeed({ lane, cursor, limit: 20 }))
      .then((page) => {
        if (!active) return;
        setFeedPagination((current) => {
          const value =
            resolveWorkspaceAuthoritativeOverride(authoritativeToday, current) ??
            createFeedPaginationValue(authoritativeToday);
          const existing =
            value.lanes[lane] ?? authoritativeToday.lanes.find((item) => item.lane === lane);
          if (!existing) return current;
          const seen = new Set(existing.items.map((item) => item.recordKey));
          return {
            base: authoritativeToday,
            value: {
              ...value,
              failedCursor: undefined,
              lanes: {
                ...value.lanes,
                [lane]: {
                  ...existing,
                  items: [
                    ...existing.items,
                    ...page.items.filter((item) => !seen.has(item.recordKey)),
                  ],
                  nextCursor: page.nextCursor,
                  scopeTotal: page.scopeTotal,
                },
              },
              loadedCursors: { ...value.loadedCursors, [lane]: cursor },
            },
          };
        });
      })
      .catch(() => {
        if (!active) return;
        setFeedPagination((current) => {
          const value =
            resolveWorkspaceAuthoritativeOverride(authoritativeToday, current) ??
            createFeedPaginationValue(authoritativeToday);
          return { base: authoritativeToday, value: { ...value, failedCursor: cursor } };
        });
      });
    return () => {
      active = false;
    };
  }, [data, failedCursor, lane, loadedCursor, urlState.cursor, viewLoadError]);

  const currentLane =
    feedPaginationValue?.lanes[visualLane] ??
    (data.view === 'today' ? data.today.lanes.find((item) => item.lane === visualLane) : undefined);
  const stocks = useMemo(
    () => (data.view === 'stocks' ? filterWorkspaceStocks(data.stocks.data, deferredQuery) : []),
    [data, deferredQuery],
  );
  const resolvedStocksBriefing =
    data.view === 'stocks' ? (stocksBriefing ?? buildStocksBriefingModel(data.stocks)) : undefined;
  const radarPaginationValue =
    data.view === 'radar'
      ? resolveWorkspaceAuthoritativeOverride(data.radar, radarPagination)
      : null;
  const visibleRadarPage =
    radarPaginationValue?.page ?? (data.view === 'radar' ? data.radar : null);
  const visibleRadarPageState = radarPaginationValue?.state ?? 'ready';
  const resolvedMarketConnections =
    data.view === 'radar'
      ? (marketConnections ?? buildMarketConnectionsModel(visibleRadarPage ?? data.radar))
      : null;
  const historyPaginationValue =
    data.view === 'history'
      ? resolveWorkspaceAuthoritativeOverride(data.history, historyPagination)
      : null;
  const visibleHistoryPage =
    historyPaginationValue?.page ?? (data.view === 'history' ? data.history : null);
  const visibleHistoryPageState = historyPaginationValue?.state ?? 'ready';
  const visibleHistoryBriefing = useMemo(
    () =>
      visibleHistoryPage
        ? (historyBriefing ?? buildHistoryBriefingModel(visibleHistoryPage))
        : null,
    [historyBriefing, visibleHistoryPage],
  );
  const resolvedReliabilityBriefing = useMemo(
    () =>
      data.view === 'status'
        ? (reliabilityBriefing ?? buildReliabilityBriefingModel(data.status))
        : null,
    [data, reliabilityBriefing],
  );
  const visibleDetail = detail ?? (data.view === 'today' ? data.defaultRecord : null);
  const visibleThemeRelation =
    themeRelation !== undefined ? themeRelation : data.view === 'themes' ? data.relation : null;
  const visibleThemeRelationState =
    themeRelation !== undefined
      ? themeRelationState
      : data.view === 'themes' && data.relation
        ? 'ready'
        : 'error';

  const requestNavigation = (
    kind: 'lane' | 'section',
    value: ResearchFeedLaneId | SectionId,
    nextState: Partial<ResearchWorkspaceUrlState>,
  ) => {
    if (!onUrlStateChange) return;
    const sequence = ++navigationSequenceRef.current;
    dispatchNavigationIntent({ kind, sequence, type: 'request', value });
    startNavigationTransition(() => {
      void onUrlStateChange(nextState)
        .then(() => {
          startNavigationTransition(() => {
            dispatchNavigationIntent({ sequence, type: 'settle' });
          });
        })
        .catch(() => {
          dispatchNavigationIntent({ sequence, type: 'settle' });
        });
    });
  };

  const selectSection = (next: SectionId) => {
    if (next !== 'themes') {
      themeRelationSequenceRef.current += 1;
      setThemeRelation(undefined);
      setThemeRelationState('ready');
    }
    if (!onUrlStateChange) {
      setLocalSection(next);
      return;
    }
    // The <Link> performs the navigation itself, so this only records the
    // pending intent (which tab is loading) and settles it once the router has
    // committed. Calling requestNavigation here would navigate a second time.
    if (next === section && navigationIntent.pendingSection === null) return;
    const sequence = ++navigationSequenceRef.current;
    dispatchNavigationIntent({ kind: 'section', sequence, type: 'request', value: next });
  };

  const submitWorkspaceSearch = () => {
    if (!onNavigateSection) {
      selectSection('stocks');
      return;
    }
    const sequence = ++navigationSequenceRef.current;
    dispatchNavigationIntent({ kind: 'section', sequence, type: 'request', value: 'stocks' });
    startNavigationTransition(() => {
      void onNavigateSection('stocks', { query: query.trim() || undefined })
        .then(() => {
          startNavigationTransition(() => {
            dispatchNavigationIntent({ sequence, type: 'settle' });
          });
        })
        .catch(() => {
          dispatchNavigationIntent({ sequence, type: 'settle' });
        });
    });
  };

  const selectLane = (next: ResearchFeedLaneId) => {
    if (!onUrlStateChange) {
      setLocalLane(next);
      return;
    }
    if (next === lane && navigationIntent.pendingLane === null) return;
    requestNavigation('lane', next, { lane: next, cursor: undefined });
  };

  const selectRecord = async (item: ResearchFeedItem, opener: HTMLElement) => {
    setPendingRecordKey(item.recordKey);
    issuedInspectorRecordKeysRef.current.add(item.recordKey);
    setDismissedInspectorRecords(new Set());
    inspectorOpenerRef.current = opener;
    setInspectorOpen(true);
    if (onUrlStateChange) {
      setDetailState(detail?.recordKey === item.recordKey ? 'ready' : 'loading');
      setRelationState(detail?.recordKey === item.recordKey ? 'ready' : 'loading');
      void onUrlStateChange({ record: item.recordKey })
        .then(() => {
          setPendingRecordKey((current) => (current === item.recordKey ? undefined : current));
        })
        .catch(() => {
          setPendingRecordKey((current) => (current === item.recordKey ? undefined : current));
          setRelationState('error');
          setDetailState('error');
        });
      return;
    }
    setDetailState('loading');
    setRelationState('loading');
    try {
      const { detail: nextDetail, relation: nextRelation } = await loadRecordDetail(item.recordKey);
      setDetail(nextDetail);
      setRelation(nextRelation);
      setRelationState('ready');
      setDetailState('ready');
      setPendingRecordKey((current) => (current === item.recordKey ? undefined : current));
    } catch {
      setPendingRecordKey((current) => (current === item.recordKey ? undefined : current));
      setRelationState('error');
      setDetailState('error');
    }
  };

  const loadSelectedHistoryDetail = useCallback(
    async (item: HistoryBriefingItem) => {
      const sequence = ++historyDetailSequenceRef.current;
      const baseDetail = buildHistoryBriefingDetail(item);
      setHistoryDetail(baseDetail);
      if (!loadHistoryBriefingDetail) {
        setHistoryDetailState('ready');
        return;
      }
      setHistoryDetailState('loading');
      try {
        const nextDetail = await loadHistoryBriefingDetail(item.historyId);
        if (historyDetailSequenceRef.current !== sequence) return;
        setHistoryDetail(nextDetail);
        setHistoryDetailState('ready');
      } catch {
        if (historyDetailSequenceRef.current !== sequence) return;
        setHistoryDetailState('error');
      }
    },
    [loadHistoryBriefingDetail],
  );

  const selectHistory = (item: HistoryBriefingItem, opener: HTMLElement) => {
    historyInspectorOpenerRef.current = opener;
    setSelectedHistoryItem(item);
    setHistoryInspectorOpen(true);
    void loadSelectedHistoryDetail(item);
  };

  const retryHistoryDetail = () => {
    if (selectedHistoryItem) void loadSelectedHistoryDetail(selectedHistoryItem);
  };

  const selectReliability = (item: ReliabilityBriefingItem, opener: HTMLElement) => {
    reliabilityInspectorOpenerRef.current = opener;
    setSelectedReliabilityItem(item);
  };

  const selectThemeEntity = async (entityKey: string) => {
    const sequence = ++themeRelationSequenceRef.current;
    setThemeRelationState('loading');
    try {
      const api = await getWorkspaceApiClient();
      const nextRelation = await api.entityRelations(entityKey, 1);
      if (!isLatestWorkspaceIntent(themeRelationSequenceRef.current, sequence)) return;
      setThemeRelation(nextRelation);
      setThemeRelationState('ready');
    } catch {
      if (!isLatestWorkspaceIntent(themeRelationSequenceRef.current, sequence)) return;
      setThemeRelation(null);
      setThemeRelationState('error');
    }
  };

  const loadMoreRadar = async () => {
    if (data.view !== 'radar' || !visibleRadarPage) return;
    const cursor = visibleRadarPage.nextCursor;
    if (!cursor || visibleRadarPageState === 'loading') return;
    const authoritativeRadar = data.radar;
    setRadarPagination({
      base: authoritativeRadar,
      value: { page: visibleRadarPage, state: 'loading' },
    });
    try {
      const api = await getWorkspaceApiClient();
      const nextPage = await api.radarSignals({ cursor, limit: 30 });
      setRadarPagination((current) => {
        const value = resolveWorkspaceAuthoritativeOverride(authoritativeRadar, current);
        if (!value) return current;
        const seen = new Set(value.page.items.map((item) => item.signalKey));
        return {
          base: authoritativeRadar,
          value: {
            page: {
              ...nextPage,
              items: [
                ...value.page.items,
                ...nextPage.items.filter((item) => !seen.has(item.signalKey)),
              ],
            },
            state: 'ready',
          },
        };
      });
    } catch {
      setRadarPagination((current) => {
        const value = resolveWorkspaceAuthoritativeOverride(authoritativeRadar, current);
        return value ? { base: authoritativeRadar, value: { ...value, state: 'error' } } : current;
      });
    }
  };

  const loadMoreHistory = async () => {
    if (data.view !== 'history' || !visibleHistoryPage) return;
    const cursor = visibleHistoryPage.nextCursor;
    if (!cursor || visibleHistoryPageState === 'loading') return;
    const authoritativeHistory = data.history;
    setHistoryPagination({
      base: authoritativeHistory,
      value: { page: visibleHistoryPage, state: 'loading' },
    });
    try {
      const api = await getWorkspaceApiClient();
      const nextPage = await api.decisionHistory({ cursor, limit: 30 });
      setHistoryPagination((current) => {
        const value = resolveWorkspaceAuthoritativeOverride(authoritativeHistory, current);
        if (!value) return current;
        const seen = new Set(value.page.items.map((item) => item.historyId));
        return {
          base: authoritativeHistory,
          value: {
            page: {
              ...nextPage,
              items: [
                ...value.page.items,
                ...nextPage.items.filter((item) => !seen.has(item.historyId)),
              ],
            },
            state: 'ready',
          },
        };
      });
    } catch {
      setHistoryPagination((current) => {
        const value = resolveWorkspaceAuthoritativeOverride(authoritativeHistory, current);
        return value
          ? { base: authoritativeHistory, value: { ...value, state: 'error' } }
          : current;
      });
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (await onLogout?.()) window.location.assign('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const viewNavigationPending =
    navigationIntent.pendingSection !== null || navigationIntent.pendingLane !== null;
  const navigationItems: readonly WorkspaceNavigationItem[] = workspaceSections.map((item) => ({
    ...item,
    ...(item.id === 'radar' ? { count: data.shell.radarScopeTotal } : {}),
    ...(item.id === 'stocks' ? { count: data.shell.watchlistCount } : {}),
  }));
  const visibleDetailState =
    requestedRecordKey && requestedRecordKey !== visibleDetail?.recordKey
      ? 'loading'
      : detailState === 'ready' && relationState === 'loading'
        ? 'loading'
        : detailState;
  const closeInspector = () => {
    const dismissedRecords = new Set(issuedInspectorRecordKeysRef.current);
    if (urlState.record) dismissedRecords.add(urlState.record);
    if (detail?.recordKey) dismissedRecords.add(detail.recordKey);
    setDismissedInspectorRecords(dismissedRecords);
    issuedInspectorRecordKeysRef.current.clear();
    setPendingRecordKey(undefined);
    setInspectorOpen(false);
    const opener = inspectorOpenerRef.current;
    if (opener?.isConnected) window.requestAnimationFrame(() => opener.focus());
    void onUrlStateChange?.({ record: undefined });
  };

  const closeHistoryInspector = () => {
    setHistoryInspectorOpen(false);
    const opener = historyInspectorOpenerRef.current;
    if (opener?.isConnected) window.requestAnimationFrame(() => opener.focus());
  };

  const contextualActions = canManageInvitations ? (
    <Button
      type="button"
      motion="quiet"
      disabled={!hydrated}
      onClick={() => window.location.assign('/admin/invitations')}
    >
      <UserPlus aria-hidden="true" /> 가입 코드 관리
    </Button>
  ) : null;

  const workspaceViewContent = (
    <>
      {viewLoadError && (
        <ErrorState className={styles.viewLoadError} testId="workspace-view-load-error">
          <AlertCircle aria-hidden="true" />
          <div>
            <strong>
              {workspaceSections.find(({ id }) => id === viewLoadError)?.label ?? '선택한'} 화면을
              불러오지 못했습니다
            </strong>
            <p>{workspaceViewFailureMessage(viewLoadFailureKind ?? 'unknown')}</p>
          </div>
          <Button motion="pressable" type="button" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
        </ErrorState>
      )}
      {section === 'today' && data.view === 'today' && (
        <TodayView
          data={data.today}
          interactive={hydrated}
          lane={visualLane}
          pendingLane={navigationIntent.pendingLane as ResearchFeedLaneId | null}
          onLaneChange={selectLane}
          items={currentLane?.items ?? []}
          nextCursor={currentLane?.nextCursor ?? null}
          cursorLoading={Boolean(
            urlState.cursor && loadedCursor !== urlState.cursor && !failedCursor,
          )}
          cursorError={Boolean(urlState.cursor && failedCursor === urlState.cursor)}
          onLoadMore={() => {
            if (data.view === 'today' && currentLane?.nextCursor) {
              setFeedPagination((current) => {
                const value =
                  resolveWorkspaceAuthoritativeOverride(data.today, current) ??
                  createFeedPaginationValue(data.today);
                return {
                  base: data.today,
                  value: { ...value, failedCursor: undefined },
                };
              });
              void onUrlStateChange?.({ cursor: currentLane.nextCursor });
            }
          }}
          selectedRecordKey={requestedRecordKey ?? visibleDetail?.recordKey}
          onSelectRecord={(item, opener) => void selectRecord(item, opener)}
        />
      )}
      {section === 'radar' && data.view === 'radar' && resolvedMarketConnections && (
        <MarketConnectionsView
          geoSnapshot={data.geoSnapshot}
          interactive={hydrated}
          loadMarketConnectionDetail={loadMarketConnectionDetail}
          marketConnections={resolvedMarketConnections}
          radarPage={visibleRadarPage ?? data.radar}
          pageState={visibleRadarPageState}
          onLoadMore={() => void loadMoreRadar()}
        />
      )}
      {section === 'stocks' && data.view === 'stocks' && resolvedStocksBriefing && (
        <StocksView
          briefing={resolvedStocksBriefing}
          data={data.stocks}
          interactive={hydrated}
          loadStockBriefingDetail={loadStockBriefingDetail}
          pending={searchPending}
          stocks={stocks}
        />
      )}
      {section === 'crypto' && data.view === 'crypto' && <CryptoWorkspaceView data={data.crypto} />}
      {section === 'themes' && data.view === 'themes' && (
        <ThemesView
          data={data.themes}
          interactive={hydrated}
          relation={visibleThemeRelation}
          relationState={visibleThemeRelationState}
          onSelectEntity={(entityKey) => void selectThemeEntity(entityKey)}
        />
      )}
      {section === 'research' && data.view === 'research' && (
        <MyResearchView data={data.myResearch} personalization={data.personalization} />
      )}
      {section === 'history' && data.view === 'history' && visibleHistoryBriefing && (
        <HistoryView
          briefing={visibleHistoryBriefing}
          data={visibleHistoryPage ?? data.history}
          interactive={hydrated}
          pageState={visibleHistoryPageState}
          onLoadMore={() => void loadMoreHistory()}
          onOpenHistory={selectHistory}
          selectedHistoryId={selectedHistoryItem?.historyId}
        />
      )}
      {section === 'status' && data.view === 'status' && resolvedReliabilityBriefing && (
        <StatusView
          briefing={resolvedReliabilityBriefing}
          data={data.status}
          interactive={hydrated}
          onOpenReliability={selectReliability}
          selectedSurface={selectedReliabilityItem?.surface}
        />
      )}
      {section === 'market-topic-news' && data.view === 'market-topic-news' && (
        <MarketTopicNewsView data={data.marketTopicNews} />
      )}
    </>
  );

  return (
    <WorkspaceShell
      activeSection={visualSection}
      contextualActions={contextualActions}
      mobileModalInert={inspectorModalOpen || (isMobileViewport && historyInspectorVisible)}
      navigationItems={navigationItems}
      navigationMode={navigationMode}
      navigationPending={navigationIntent.pendingSection as WorkspaceSectionId | null}
      onLogout={() => void handleLogout()}
      onNavigate={selectSection}
      onPrefetch={onPrefetchSection}
      search={
        <WorkspaceSearch
          disabled={!hydrated}
          onQueryChange={setQuery}
          onSubmit={submitWorkspaceSearch}
          pending={searchPending}
          query={query}
        />
      }
    >
      <WorkspaceViewRegion
        className={styles.content}
        navigationSequence={navigationIntent.sequence}
        pending={viewNavigationPending}
        resolvedViewKey={resolvedViewKey}
        viewKey={visualSection}
      >
        {navigationIntent.pendingSection ? (
          <WorkspaceViewLoading />
        ) : (
          <WorkspaceViewErrorBoundary
            key={`${section}:${viewRetryKeys[section]}`}
            onRetry={retryCurrentView}
          >
            <Suspense fallback={<WorkspaceViewLoading />}>
              <WorkspaceViewReady onReady={markViewReady} viewKey={section}>
                {workspaceViewContent}
              </WorkspaceViewReady>
            </Suspense>
          </WorkspaceViewErrorBoundary>
        )}
      </WorkspaceViewRegion>
      <EvidenceInspector
        detail={visibleDetail}
        detailKey={requestedRecordKey ?? visibleDetail?.recordKey ?? null}
        relation={relation}
        state={visibleDetailState}
        modal={isMobileViewport}
        onClose={closeInspector}
        open={inspectorVisible}
      />
      <HistoryBriefingInspector
        detail={historyDetail}
        detailKey={selectedHistoryItem?.historyId ?? null}
        mobile={isMobileViewport}
        onClose={closeHistoryInspector}
        onRetry={retryHistoryDetail}
        open={historyInspectorVisible}
        state={historyDetailState}
      />
    </WorkspaceShell>
  );
}
