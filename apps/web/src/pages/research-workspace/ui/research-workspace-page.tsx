import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleDot,
  Database,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Network,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type RefObject,
} from 'react';

import { EvidenceInspector } from './evidence-inspector';
import styles from './research-workspace-page.module.css';
import { ResearchWorkspaceShell } from './research-workspace-shell';
import { useWorkspaceOverlayMotion } from './use-workspace-overlay-motion';
import { HistoryView } from './views/history-view';
import { MyResearchView } from './views/my-research-view';
import { RadarView } from './views/radar-view';
import { StatusView } from './views/status-view';
import { StocksView } from './views/stocks-view';
import { ThemesView } from './views/themes-view';
import { TodayView } from './views/today-view';
import { WorkspaceSearch, useDeferredWorkspaceSearch } from './workspace-search';
import { WorkspaceViewRegion } from './workspace-view-region';
import {
  resolveWorkspaceAuthoritativeOverride,
  type WorkspaceAuthoritativeOverride,
} from '../model/workspace-authoritative-override';
import {
  createWorkspaceNavigationIntentState,
  reduceWorkspaceNavigationIntent,
} from '../model/workspace-navigation-intent';
import { filterWorkspaceStocks } from '../model/workspace-search-filter';
import { isLatestWorkspaceIntent } from '../model/workspace-transition-policy';
import type { ResearchWorkspaceViewPayload } from '../model/workspace-view-payload';

import { Button, IconButton } from '@/shared/ui/primitives';
import { createApiClient } from '@stock-insight/api-client';
import type {
  DecisionHistoryPage,
  EntityRelationGraph,
  RadarSignalPage,
  ResearchFeedItem,
  ResearchFeedLaneId,
  ResearchRecordDetail,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type SectionId = 'today' | 'radar' | 'stocks' | 'themes' | 'research' | 'history' | 'status';
export type DetailState = 'ready' | 'loading' | 'error';

export type ResearchWorkspaceUrlState = {
  view?: SectionId;
  lane?: ResearchFeedLaneId;
  record?: string;
  cursor?: string;
};

type ResearchWorkspacePageProps = {
  data: ResearchWorkspaceViewPayload;
  onLogout?: () => Promise<boolean>;
  onPrefetchSection?: (section: SectionId) => void;
  urlState?: ResearchWorkspaceUrlState;
  viewLoadError?: SectionId;
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

function createFeedPaginationValue(today: WorkspaceToday): FeedPaginationValue {
  return {
    lanes: Object.fromEntries(today.lanes.map((item) => [item.lane, item])),
    loadedCursors: {},
  };
}

const sections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'today', label: '오늘', icon: LayoutDashboard },
  { id: 'radar', label: '세계 레이더', icon: Activity },
  { id: 'stocks', label: '종목', icon: BarChart3 },
  { id: 'themes', label: '테마·관계', icon: Network },
  { id: 'research', label: '내 리서치', icon: BookOpen },
  { id: 'history', label: '판단 이력', icon: History },
  { id: 'status', label: '데이터 상태', icon: Database },
];

export const laneLabels: Record<ResearchFeedLaneId, string> = {
  must_know: '꼭 봐야 할 변화',
  for_you: '관심종목 연결',
  explore: '새로 볼 변화',
};

export const availabilityLabels: Record<string, string> = {
  available: '사용 가능',
  collecting: '수집 중',
  stale: '갱신 필요',
  missing: '데이터 없음',
  text_only: '텍스트만',
  unsupported: '지원하지 않음',
  error: '오류',
};

const whySurfacedLabels: Record<string, string> = {
  direct: '관심 종목과 직접 연결',
  holding_direct: '보유 종목과 직접 연결',
  watched_direct: '관심 종목과 직접 연결',
  watchlist_direct: '관심 종목과 직접 연결',
  related: '관심 종목의 연관 기업과 연결',
  relation_one_hop: '관심 종목과 1단계 관계로 연결',
  one_hop: '관심 종목과 1단계 관계로 연결',
  indirect: '관심 종목의 관계망을 통해 연결',
  relation_two_hop: '관심 종목과 2단계 관계로 연결',
  two_hop: '관심 종목과 2단계 관계로 연결',
  market: '현재 시장에서 확인할 변화',
  market_context: '현재 시장 흐름과 연결',
  discovery: '관심 목록 밖에서 발견한 변화',
  new_discovery: '관심 목록 밖에서 발견한 변화',
};

const signalTypeLabels: Record<string, string> = {
  price_mover: '가격 변화',
  volume_mover: '거래량 변화',
  news: '새 소식',
  disclosure: '공시 변화',
  macro: '거시경제 변화',
  earnings: '실적 변화',
};

const analysisStatusLabels: Record<string, string> = {
  none: '분석 전',
  cached: '분석 준비됨',
  queued: '분석 대기 중',
  running: '분석 중',
  failed: '분석 확인 필요',
  stale: '분석 갱신 필요',
};

const historyStatusLabels: Record<string, string> = {
  open: '검토 중',
  reviewed: '검토 완료',
  archived: '보관됨',
};

const relationTypeLabels: Record<string, string> = {
  same_industry: '같은 산업',
  news_co_mention: '같은 소식에 등장',
  peer: '비교 기업',
  corroborates: '근거가 서로 뒷받침',
};

const datasetLabels: Record<string, string> = {
  publication_records: '리서치 발행 기록',
  market_snapshots: '시장 가격 기록',
  decision_history: '판단 기록',
  entity_relations: '기업 관계',
  source_bindings: '출처 연결',
  watchlist: '관심종목',
  positions: '보유종목',
};

export const domainLabels: Record<string, string> = {
  stock: '종목',
  market: '시장',
  research: '리서치',
  graph: '관계',
  user: '내 기록',
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const subscribeHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () =>
      Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) =>
          !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      );
    const frame = window.requestAnimationFrame(() => {
      (
        container.querySelector<HTMLElement>('[data-initial-focus]') ??
        focusableElements()[0] ??
        container
      ).focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        const activeFocus = document.activeElement;
        if (
          previousFocus?.isConnected &&
          (activeFocus === document.body || !activeFocus || container.contains(activeFocus))
        ) {
          previousFocus.focus();
        }
      }, 0);
    };
  }, [active, containerRef]);
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '기준 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function confidenceLabel(value: string) {
  if (value === 'high') return '근거 높음';
  if (value === 'medium') return '근거 보통';
  return '근거 낮음';
}

export function marketLabel(value: string) {
  return (
    {
      KR: '한국',
      KRX: '한국',
      KOSDAQ: '코스닥',
      US: '미국',
      NASDAQ: '나스닥',
      NYSE: '뉴욕증권거래소',
      AMEX: '미국',
      MACRO: '거시경제',
      GLOBAL: '글로벌',
    }[value] ?? '기타 시장'
  );
}

export function signalTypeLabel(value: string) {
  return signalTypeLabels[value.toLowerCase().replace(/[\s-]+/g, '_')] ?? '시장 변화';
}

export function analysisStatusLabel(value: string) {
  return analysisStatusLabels[value] ?? '분석 상태 확인 중';
}

export function historyStatusLabel(value: string) {
  return historyStatusLabels[value] ?? '상태 확인 중';
}

export function relationTypeLabel(value: string) {
  return relationTypeLabels[value] ?? '확인된 관계';
}

export function datasetLabel(domain: string, datasetName: string) {
  return datasetLabels[datasetName] ?? `${domainLabels[domain] ?? '기타'} 데이터`;
}

export function relationNodeLabel(graph: EntityRelationGraph, entityKey: string) {
  return graph.nodes.find((node) => node.entityKey === entityKey)?.label ?? '연결 기업';
}

export function whySurfacedLabel(item: ResearchFeedItem) {
  const source = item.whySurfaced.trim();
  const normalized = source.toLowerCase().replace(/[\s-]+/g, '_');
  const mapped = whySurfacedLabels[normalized];
  if (mapped) return mapped;
  if (/[가-힣]/.test(source) && !/(?:related_ticker:|STAGE:)/i.test(source)) return source;

  if (item.relevance.kind === 'direct') return whySurfacedLabels.direct;
  if (item.relevance.kind === 'related') return whySurfacedLabels.related;
  if (item.relevance.kind === 'indirect') {
    return `${item.relevance.hops ?? 2}단계 관계를 통해 연결`;
  }
  if (item.relevance.kind === 'discovery') return whySurfacedLabels.discovery;
  return whySurfacedLabels.market;
}

export function ResearchWorkspacePage({
  data,
  onLogout,
  onPrefetchSection,
  urlState = {},
  viewLoadError,
  onUrlStateChange,
}: ResearchWorkspacePageProps) {
  const [localSection, setLocalSection] = useState<SectionId>(urlState.view ?? data.view);
  const [localLane, setLocalLane] = useState<ResearchFeedLaneId>(
    urlState.lane ?? (data.view === 'today' ? data.lane : 'must_know'),
  );
  const [query, setQuery] = useState('');
  const { deferredQuery, pending: searchPending } = useDeferredWorkspaceSearch(query);
  const [navigationIntent, dispatchNavigationIntent] = useReducer(
    reduceWorkspaceNavigationIntent,
    createWorkspaceNavigationIntentState(),
  );
  const navigationSequenceRef = useRef(0);
  const themeRelationSequenceRef = useRef(0);
  const inspectorOpenerRef = useRef<HTMLElement | null>(null);
  const issuedInspectorRecordKeysRef = useRef(new Set<string>());
  const [, startNavigationTransition] = useTransition();
  const initialDetail = data.view === 'today' ? data.defaultRecord : null;
  const [detail, setDetail] = useState<ResearchRecordDetail | null>(initialDetail);
  const [relation, setRelation] = useState<EntityRelationGraph | null>(null);
  const [relationState, setRelationState] = useState<DetailState>('error');
  const [themeRelation, setThemeRelation] = useState<EntityRelationGraph | null | undefined>();
  const [themeRelationState, setThemeRelationState] = useState<DetailState>('ready');
  const [detailState, setDetailState] = useState<DetailState>(initialDetail ? 'ready' : 'error');
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(urlState.record));
  const [dismissedInspectorRecords, setDismissedInspectorRecords] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
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
  const navigationRef = useRef<HTMLElement>(null);
  const navigationScrimRef = useRef<HTMLButtonElement>(null);
  const api = useMemo(() => createApiClient(), []);
  const section = onUrlStateChange ? data.view : localSection;
  const lane = onUrlStateChange
    ? data.view === 'today'
      ? data.lane
      : (urlState.lane ?? 'must_know')
    : localLane;
  const mobileNavHidden = isMobileViewport && !mobileNavOpen;
  const mobileNavModalOpen = isMobileViewport && mobileNavOpen;
  const urlInspectorVisible = Boolean(
    urlState.record && !dismissedInspectorRecords.has(urlState.record),
  );
  const inspectorVisible = section === 'today' && (inspectorOpen || urlInspectorVisible);
  const inspectorModalOpen = isMobileViewport && inspectorVisible;
  const navTransition = useWorkspaceOverlayMotion({
    kind: 'drawer',
    open: mobileNavModalOpen,
    panelRef: navigationRef,
    scopeRef: navigationRef,
    scrimRef: navigationScrimRef,
  });

  useFocusTrap(mobileNavModalOpen, navigationRef, () => setMobileNavOpen(false));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const syncViewport = () => {
      setIsMobileViewport(media.matches);
      if (!media.matches) setMobileNavOpen(false);
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
    void api
      .researchRecord(recordKey)
      .then(async (nextDetail) => {
        const entityKey = nextDetail.affectedEntityKeys[0];
        const nextRelation = entityKey ? await api.entityRelations(entityKey, 1) : null;
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
  }, [api, detail?.recordKey, urlState.record]);

  const feedPaginationValue =
    data.view === 'today'
      ? resolveWorkspaceAuthoritativeOverride(data.today, feedPagination)
      : null;
  const loadedCursor = feedPaginationValue?.loadedCursors[lane];
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
    void api
      .researchFeed({ lane, cursor, limit: 20 })
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
  }, [api, data, failedCursor, lane, loadedCursor, urlState.cursor, viewLoadError]);

  const currentLane =
    feedPaginationValue?.lanes[lane] ??
    (data.view === 'today' ? data.today.lanes.find((item) => item.lane === lane) : undefined);
  const stocks = useMemo(
    () => (data.view === 'stocks' ? filterWorkspaceStocks(data.stocks.data, deferredQuery) : []),
    [data, deferredQuery],
  );
  const radarPaginationValue =
    data.view === 'radar'
      ? resolveWorkspaceAuthoritativeOverride(data.radar, radarPagination)
      : null;
  const visibleRadarPage =
    radarPaginationValue?.page ?? (data.view === 'radar' ? data.radar : null);
  const visibleRadarPageState = radarPaginationValue?.state ?? 'ready';
  const historyPaginationValue =
    data.view === 'history'
      ? resolveWorkspaceAuthoritativeOverride(data.history, historyPagination)
      : null;
  const visibleHistoryPage =
    historyPaginationValue?.page ?? (data.view === 'history' ? data.history : null);
  const visibleHistoryPageState = historyPaginationValue?.state ?? 'ready';
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
    setMobileNavOpen(false);
    if (!onUrlStateChange) {
      setLocalSection(next);
      return;
    }
    if (next === section && navigationIntent.pendingSection === null) return;
    requestNavigation('section', next, { view: next });
  };

  const selectLane = (next: ResearchFeedLaneId) => {
    if (!onUrlStateChange) {
      setLocalLane(next);
      return;
    }
    if (next === lane && navigationIntent.pendingLane === null) return;
    requestNavigation('lane', next, { lane: next, cursor: undefined });
  };

  const selectRecord = async (item: ResearchFeedItem) => {
    issuedInspectorRecordKeysRef.current.add(item.recordKey);
    setDismissedInspectorRecords(new Set());
    if (!isMobileViewport && document.activeElement instanceof HTMLElement) {
      inspectorOpenerRef.current = document.activeElement;
    }
    setInspectorOpen(true);
    if (onUrlStateChange) {
      setDetailState(detail?.recordKey === item.recordKey ? 'ready' : 'loading');
      setRelationState(detail?.recordKey === item.recordKey ? 'ready' : 'loading');
      void onUrlStateChange({ record: item.recordKey });
      return;
    }
    setDetailState('loading');
    setRelationState('loading');
    try {
      const nextDetail = await api.researchRecord(item.recordKey);
      setDetail(nextDetail);
      const entityKey = nextDetail.affectedEntityKeys[0];
      setRelation(entityKey ? await api.entityRelations(entityKey, 1) : null);
      setRelationState('ready');
      setDetailState('ready');
    } catch {
      setRelationState('error');
      setDetailState('error');
    }
  };

  const selectThemeEntity = async (entityKey: string) => {
    const sequence = ++themeRelationSequenceRef.current;
    setThemeRelationState('loading');
    try {
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

  const sectionTitle = sections.find((item) => item.id === section)?.label ?? '오늘';
  const activeSectionIndex = Math.max(
    0,
    sections.findIndex((item) => item.id === section),
  );
  const visibleDetailState =
    urlState.record && urlState.record !== visibleDetail?.recordKey
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
    setInspectorOpen(false);
    if (!isMobileViewport) {
      const opener = inspectorOpenerRef.current;
      if (opener?.isConnected) window.requestAnimationFrame(() => opener.focus());
    }
    void onUrlStateChange?.({ record: undefined });
  };

  return (
    <ResearchWorkspaceShell className={styles.canvas} data-testid="research-workspace-v3">
      <aside
        ref={navigationRef}
        id="workspace-navigation"
        data-testid="workspace-sidebar"
        className={styles.sidebar}
        data-overlay-phase={navTransition.phase}
        role={isMobileViewport ? 'dialog' : undefined}
        aria-label={isMobileViewport ? '리서치 탐색 메뉴' : undefined}
        aria-modal={mobileNavModalOpen || undefined}
        aria-hidden={mobileNavHidden || inspectorModalOpen || undefined}
        inert={mobileNavHidden || inspectorModalOpen || undefined}
        tabIndex={-1}
      >
        <div className={styles.brand}>
          <span className={styles.brandMark}>FI</span>
          <div>
            <strong>Futur Insight</strong>
            <span>Research workspace</span>
          </div>
        </div>
        <nav className={styles.nav} aria-label="리서치 워크스페이스">
          <span
            className={styles.navIndicator}
            aria-hidden="true"
            style={{ transform: `translate3d(0, ${activeSectionIndex * 48}px, 0)` }}
          />
          {sections.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              motion="quiet"
              data-testid={`workspace-nav-${id}`}
              data-pending={navigationIntent.pendingSection === id || undefined}
              aria-busy={navigationIntent.pendingSection === id || undefined}
              aria-current={section === id ? 'page' : undefined}
              disabled={!hydrated}
              onFocus={() => onPrefetchSection?.(id)}
              onPointerEnter={() => onPrefetchSection?.(id)}
              onClick={() => selectSection(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === 'radar' && <small>{formatNumber(data.shell.radarScopeTotal)}</small>}
              {id === 'research' && <small>{data.shell.watchlistCount}</small>}
            </Button>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <div>
            <CircleDot aria-hidden="true" />
            <span>조회·리서치 전용</span>
          </div>
          <Button
            type="button"
            motion="quiet"
            disabled={!hydrated || loggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOut aria-hidden="true" /> {loggingOut ? '로그아웃 중' : '로그아웃'}
          </Button>
        </div>
      </aside>

      <section
        className={styles.workspace}
        data-testid="workspace-content"
        aria-hidden={mobileNavModalOpen || inspectorModalOpen || undefined}
        inert={mobileNavModalOpen || inspectorModalOpen || undefined}
      >
        <header className={styles.topbar}>
          <IconButton
            className={styles.mobileMenu}
            type="button"
            motion="quiet"
            aria-label="메뉴 열기"
            aria-controls="workspace-navigation"
            aria-expanded={mobileNavOpen}
            disabled={!hydrated}
            onClick={() => setMobileNavOpen((value) => !value)}
          >
            <Menu aria-hidden="true" />
          </IconButton>
          <div className={styles.crumbs}>
            <strong>{sectionTitle}</strong>
            <ChevronRight aria-hidden="true" />
            <span>리서치 워크스페이스</span>
          </div>
          <WorkspaceSearch
            disabled={!hydrated}
            onQueryChange={setQuery}
            onSubmit={() => selectSection('stocks')}
            pending={searchPending}
            query={query}
          />
        </header>

        <WorkspaceViewRegion className={styles.content} viewKey={section}>
          {viewLoadError && (
            <section
              className={styles.viewLoadError}
              data-testid="workspace-view-load-error"
              role="alert"
            >
              <AlertCircle aria-hidden="true" />
              <div>
                <strong>
                  {sections.find(({ id }) => id === viewLoadError)?.label ?? '선택한 화면'}을
                  불러오지 못했습니다
                </strong>
                <p>기존 워크스페이스는 유지했습니다. 연결을 확인한 뒤 다시 시도해 주세요.</p>
              </div>
              <Button motion="pressable" type="button" onClick={() => window.location.reload()}>
                다시 시도
              </Button>
            </section>
          )}
          {section === 'today' && data.view === 'today' && (
            <TodayView
              data={data.today}
              interactive={hydrated}
              lane={lane}
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
              selectedRecordKey={visibleDetail?.recordKey}
              onSelectRecord={(item) => void selectRecord(item)}
            />
          )}
          {section === 'radar' && data.view === 'radar' && (
            <RadarView
              data={visibleRadarPage ?? data.radar}
              interactive={hydrated}
              pageState={visibleRadarPageState}
              onLoadMore={() => void loadMoreRadar()}
            />
          )}
          {section === 'stocks' && data.view === 'stocks' && (
            <StocksView data={data.stocks} pending={searchPending} stocks={stocks} />
          )}
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
            <MyResearchView data={data.myResearch} />
          )}
          {section === 'history' && data.view === 'history' && (
            <HistoryView
              data={visibleHistoryPage ?? data.history}
              interactive={hydrated}
              pageState={visibleHistoryPageState}
              onLoadMore={() => void loadMoreHistory()}
            />
          )}
          {section === 'status' && data.view === 'status' && <StatusView data={data.status} />}
        </WorkspaceViewRegion>
      </section>

      <EvidenceInspector
        detail={visibleDetail}
        relation={relation}
        state={visibleDetailState}
        modal={isMobileViewport}
        onClose={closeInspector}
        open={inspectorVisible}
      />
      {isMobileViewport && navTransition.rendered && (
        <Button
          ref={navigationScrimRef}
          className={styles.scrim}
          type="button"
          motion="none"
          aria-hidden={!navTransition.desiredOpen || undefined}
          aria-label="메뉴 닫기"
          disabled={!navTransition.desiredOpen}
          tabIndex={navTransition.desiredOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
        />
      )}
    </ResearchWorkspaceShell>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  asOf,
}: {
  eyebrow: string;
  title: string;
  description: string;
  asOf?: string | null;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <span>{eyebrow}</span>
        <h1 data-workspace-view-heading tabIndex={-1}>
          {title}
        </h1>
        <p>{description}</p>
      </div>
      {asOf && (
        <time dateTime={asOf}>
          기준 시각<strong>{formatDate(asOf, true)}</strong>
        </time>
      )}
    </header>
  );
}

export function WorkspaceState({
  kind,
  title,
  description,
}: {
  kind: 'empty' | 'loading' | 'error' | 'stale';
  title: string;
  description: string;
}) {
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? AlertCircle : CircleDot;
  return (
    <div
      className={styles.stateSurface}
      data-kind={kind}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" data-motion-loop={kind === 'loading' ? 'spinner' : undefined} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function AvailabilityNotice({ availability }: { availability: string }) {
  if (availability === 'available') return null;
  if (availability === 'collecting') {
    return (
      <WorkspaceState
        kind="loading"
        title="새 데이터를 정리하고 있습니다"
        description="준비된 내용부터 보여드리며, 수집이 끝나면 자동으로 상태가 바뀝니다."
      />
    );
  }
  if (availability === 'stale' || availability === 'text_only') {
    return (
      <WorkspaceState
        kind="stale"
        title={
          availability === 'stale'
            ? '업데이트를 기다리는 데이터입니다'
            : '원문 연결이 제한되어 있습니다'
        }
        description="표시된 기준 시각을 확인하고, 중요한 판단에는 최신 출처를 함께 확인해 주세요."
      />
    );
  }
  if (availability === 'error') {
    return (
      <WorkspaceState
        kind="error"
        title="데이터를 확인하지 못했습니다"
        description="빈 결과로 처리하지 않았습니다. 잠시 후 다시 이 화면을 열어 주세요."
      />
    );
  }
  return (
    <WorkspaceState
      kind="empty"
      title="아직 보여드릴 데이터가 없습니다"
      description="수집 범위가 준비되면 이곳에 결과가 표시됩니다."
    />
  );
}
