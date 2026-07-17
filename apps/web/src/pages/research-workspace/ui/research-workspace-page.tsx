import { gsap } from 'gsap';
import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Network,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

import styles from './research-workspace-page.module.css';

import { logout } from '@/pages/auth/model/auth-functions';
import {
  presentResearchSummary,
  sourceAttributionLabel,
  themeTitleLabel,
} from '@/pages/research-workspace/model/presentation';
import { layoutRelationNodes } from '@/pages/research-workspace/model/relation-layout';
import {
  readProfileMotionNumber,
  readProfileMotionSeconds,
  readProfileMotionValue,
} from '@/shared/ui/motion/profile-motion';
import { createApiClient } from '@stock-insight/api-client';
import type { StockListResponse } from '@stock-insight/contracts';
import type {
  DecisionHistoryPage,
  EntityRelationGraph,
  MyResearchOverview,
  RadarSignalPage,
  ResearchFeedItem,
  ResearchFeedLaneId,
  ResearchRecordDetail,
  SystemStatus,
  ThemeResearchList,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type ResearchWorkspaceInitialData = {
  today: WorkspaceToday;
  defaultRecord: ResearchRecordDetail | null;
  radar: RadarSignalPage;
  themes: ThemeResearchList;
  myResearch: MyResearchOverview;
  history: DecisionHistoryPage;
  status: SystemStatus;
  stocks: StockListResponse;
  relation: EntityRelationGraph | null;
};

export type SectionId = 'today' | 'radar' | 'stocks' | 'themes' | 'research' | 'history' | 'status';
type DetailState = 'ready' | 'loading' | 'error';

export type ResearchWorkspaceUrlState = {
  view?: SectionId;
  lane?: ResearchFeedLaneId;
  record?: string;
  cursor?: string;
};

type ResearchWorkspacePageProps = {
  data: ResearchWorkspaceInitialData;
  urlState?: ResearchWorkspaceUrlState;
  onUrlStateChange?: (next: Partial<ResearchWorkspaceUrlState>) => void;
};

const sections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'today', label: '오늘', icon: LayoutDashboard },
  { id: 'radar', label: '세계 레이더', icon: Activity },
  { id: 'stocks', label: '종목', icon: BarChart3 },
  { id: 'themes', label: '테마·관계', icon: Network },
  { id: 'research', label: '내 리서치', icon: BookOpen },
  { id: 'history', label: '판단 이력', icon: History },
  { id: 'status', label: '데이터 상태', icon: Database },
];

const laneLabels: Record<ResearchFeedLaneId, string> = {
  must_know: '꼭 봐야 할 변화',
  for_you: '관심종목 연결',
  explore: '새로 볼 변화',
};

const availabilityLabels: Record<string, string> = {
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

const sourceBindingLabels: Record<string, string> = {
  verified: '기준 시점 확인됨',
  superseded: '이후 갱신됨',
  missing: '연결 확인 필요',
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

const domainLabels: Record<string, string> = {
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
      if (previousFocus?.isConnected) window.setTimeout(() => previousFocus.focus(), 0);
    };
  }, [active, containerRef]);
}

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '기준 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function confidenceLabel(value: string) {
  if (value === 'high') return '근거 높음';
  if (value === 'medium') return '근거 보통';
  return '근거 낮음';
}

function marketLabel(value: string) {
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

function signalTypeLabel(value: string) {
  return signalTypeLabels[value.toLowerCase().replace(/[\s-]+/g, '_')] ?? '시장 변화';
}

function analysisStatusLabel(value: string) {
  return analysisStatusLabels[value] ?? '분석 상태 확인 중';
}

function historyStatusLabel(value: string) {
  return historyStatusLabels[value] ?? '상태 확인 중';
}

function relationTypeLabel(value: string) {
  return relationTypeLabels[value] ?? '확인된 관계';
}

function sourceBindingLabel(value: string) {
  return sourceBindingLabels[value] ?? '연결 상태 확인 중';
}

function datasetLabel(domain: string, datasetName: string) {
  return datasetLabels[datasetName] ?? `${domainLabels[domain] ?? '기타'} 데이터`;
}

function categoryLabel(value: string) {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  const labels: Record<string, string> = {
    news: '시장 소식',
    market_news: '시장 소식',
    disclosure: '공시',
    radar: '레이더 신호',
    research: '리서치',
    theme: '테마 변화',
  };
  if (labels[normalized]) return labels[normalized];
  return /[가-힣]/.test(value) ? value : '리서치 기록';
}

function relationNodeLabel(graph: EntityRelationGraph, entityKey: string) {
  return graph.nodes.find((node) => node.entityKey === entityKey)?.label ?? '연결 기업';
}

function whySurfacedLabel(item: ResearchFeedItem) {
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
  urlState = {},
  onUrlStateChange,
}: ResearchWorkspacePageProps) {
  const [localSection, setLocalSection] = useState<SectionId>(urlState.view ?? 'today');
  const [localLane, setLocalLane] = useState<ResearchFeedLaneId>(urlState.lane ?? 'must_know');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<ResearchRecordDetail | null>(data.defaultRecord);
  const [relation, setRelation] = useState<EntityRelationGraph | null>(data.relation);
  const [relationState, setRelationState] = useState<DetailState>(
    data.relation ? 'ready' : 'error',
  );
  const [detailState, setDetailState] = useState<DetailState>(
    data.defaultRecord ? 'ready' : 'error',
  );
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(urlState.record));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [feedPages, setFeedPages] = useState(
    () =>
      Object.fromEntries(data.today.lanes.map((item) => [item.lane, item])) as Record<
        ResearchFeedLaneId,
        WorkspaceToday['lanes'][number]
      >,
  );
  const [loadedCursors, setLoadedCursors] = useState<Partial<Record<ResearchFeedLaneId, string>>>(
    {},
  );
  const [failedCursor, setFailedCursor] = useState<string>();
  const [radarPage, setRadarPage] = useState<RadarSignalPage>(data.radar);
  const [radarPageState, setRadarPageState] = useState<DetailState>('ready');
  const [historyPage, setHistoryPage] = useState<DecisionHistoryPage>(data.history);
  const [historyPageState, setHistoryPageState] = useState<DetailState>('ready');
  const navigationRef = useRef<HTMLElement>(null);
  const api = useMemo(() => createApiClient(), []);
  const section = onUrlStateChange ? (urlState.view ?? 'today') : localSection;
  const lane = onUrlStateChange ? (urlState.lane ?? 'must_know') : localLane;
  const mobileNavHidden = isMobileViewport && !mobileNavOpen;
  const mobileNavModalOpen = isMobileViewport && mobileNavOpen;
  const inspectorVisible = section === 'today' && (inspectorOpen || Boolean(urlState.record));
  const inspectorModalOpen = isMobileViewport && inspectorVisible;

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
    const navigation = navigationRef.current;
    if (!navigation) return;
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    if (!mobile) {
      gsap.set(navigation, { clearProps: 'transform' });
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const closedOffset =
      -navigation.getBoundingClientRect().width *
      readProfileMotionNumber('--motion-navigation-offset-factor');
    gsap.to(navigation, {
      x: mobileNavOpen ? 0 : closedOffset,
      duration: readProfileMotionSeconds(
        reduced ? '--motion-navigation-reduced-duration' : '--motion-navigation-duration',
      ),
      ease: readProfileMotionValue(
        mobileNavOpen ? '--motion-navigation-open-ease' : '--motion-navigation-close-ease',
      ),
      overwrite: 'auto',
    });
    return () => gsap.killTweensOf(navigation);
  }, [isMobileViewport, mobileNavOpen]);

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

  useEffect(() => {
    const cursor = urlState.cursor;
    if (!cursor || loadedCursors[lane] === cursor || failedCursor === cursor) return;
    let active = true;
    void api
      .researchFeed({ lane, cursor, limit: 20 })
      .then((page) => {
        if (!active) return;
        setFeedPages((current) => {
          const existing = current[lane];
          const seen = new Set(existing.items.map((item) => item.recordKey));
          return {
            ...current,
            [lane]: {
              ...existing,
              items: [...existing.items, ...page.items.filter((item) => !seen.has(item.recordKey))],
              nextCursor: page.nextCursor,
              scopeTotal: page.scopeTotal,
            },
          };
        });
        setLoadedCursors((current) => ({ ...current, [lane]: cursor }));
        setFailedCursor(undefined);
      })
      .catch(() => active && setFailedCursor(cursor));
    return () => {
      active = false;
    };
  }, [api, failedCursor, lane, loadedCursors, urlState.cursor]);

  const currentLane = feedPages[lane];
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const stocks = normalizedQuery
    ? data.stocks.data.filter((stock) =>
        `${stock.displayName} ${stock.name} ${stock.ticker} ${stock.entityKey}`
          .toLocaleLowerCase('ko-KR')
          .includes(normalizedQuery),
      )
    : data.stocks.data;

  const selectSection = (next: SectionId) => {
    setLocalSection(next);
    setMobileNavOpen(false);
    onUrlStateChange?.({ view: next });
  };

  const selectLane = (next: ResearchFeedLaneId) => {
    setLocalLane(next);
    onUrlStateChange?.({ lane: next, cursor: undefined });
  };

  const selectRecord = async (item: ResearchFeedItem) => {
    setInspectorOpen(true);
    if (onUrlStateChange) {
      setDetailState(detail?.recordKey === item.recordKey ? 'ready' : 'loading');
      setRelationState(detail?.recordKey === item.recordKey ? 'ready' : 'loading');
      onUrlStateChange({ record: item.recordKey });
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
    setRelationState('loading');
    try {
      setRelation(await api.entityRelations(entityKey, 1));
      setRelationState('ready');
    } catch {
      setRelation(null);
      setRelationState('error');
    }
  };

  const loadMoreRadar = async () => {
    const cursor = radarPage.nextCursor;
    if (!cursor || radarPageState === 'loading') return;
    setRadarPageState('loading');
    try {
      const nextPage = await api.radarSignals({ cursor, limit: 30 });
      setRadarPage((current) => {
        const seen = new Set(current.items.map((item) => item.signalKey));
        return {
          ...nextPage,
          items: [...current.items, ...nextPage.items.filter((item) => !seen.has(item.signalKey))],
        };
      });
      setRadarPageState('ready');
    } catch {
      setRadarPageState('error');
    }
  };

  const loadMoreHistory = async () => {
    const cursor = historyPage.nextCursor;
    if (!cursor || historyPageState === 'loading') return;
    setHistoryPageState('loading');
    try {
      const nextPage = await api.decisionHistory({ cursor, limit: 30 });
      setHistoryPage((current) => {
        const seen = new Set(current.items.map((item) => item.historyId));
        return {
          ...nextPage,
          items: [...current.items, ...nextPage.items.filter((item) => !seen.has(item.historyId))],
        };
      });
      setHistoryPageState('ready');
    } catch {
      setHistoryPageState('error');
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const result = await logout();
      if (result.ok) window.location.assign('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const sectionTitle = sections.find((item) => item.id === section)?.label ?? '오늘';
  const visibleDetailState =
    urlState.record && urlState.record !== detail?.recordKey ? 'loading' : detailState;
  const closeInspector = () => {
    setInspectorOpen(false);
    onUrlStateChange?.({ record: undefined });
  };

  return (
    <main className={styles.canvas} data-testid="research-workspace-v3">
      <aside
        ref={navigationRef}
        id="workspace-navigation"
        data-testid="workspace-sidebar"
        className={`${styles.sidebar} ${mobileNavOpen ? styles.sidebarOpen : ''}`}
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
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              data-testid={`workspace-nav-${id}`}
              aria-current={section === id ? 'page' : undefined}
              disabled={!hydrated}
              onClick={() => selectSection(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === 'radar' && <small>{formatNumber(data.radar.scopeTotal)}</small>}
              {id === 'research' && <small>{data.myResearch.watchlistCount}</small>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <div>
            <CircleDot aria-hidden="true" />
            <span>조회·리서치 전용</span>
          </div>
          <button
            type="button"
            disabled={!hydrated || loggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOut aria-hidden="true" /> {loggingOut ? '로그아웃 중' : '로그아웃'}
          </button>
        </div>
      </aside>

      <section
        className={styles.workspace}
        data-testid="workspace-content"
        aria-hidden={mobileNavModalOpen || inspectorModalOpen || undefined}
        inert={mobileNavModalOpen || inspectorModalOpen || undefined}
      >
        <header className={styles.topbar}>
          <button
            className={styles.mobileMenu}
            type="button"
            aria-label="메뉴 열기"
            aria-controls="workspace-navigation"
            aria-expanded={mobileNavOpen}
            disabled={!hydrated}
            onClick={() => setMobileNavOpen((value) => !value)}
          >
            <Menu aria-hidden="true" />
          </button>
          <div className={styles.crumbs}>
            <strong>{sectionTitle}</strong>
            <ChevronRight aria-hidden="true" />
            <span>리서치 워크스페이스</span>
          </div>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && selectSection('stocks')}
              placeholder="종목명·티커 검색"
              aria-label="종목명 또는 티커 검색"
              disabled={!hydrated}
            />
          </label>
        </header>

        <div className={styles.content}>
          {section === 'today' && (
            <TodayView
              data={data.today}
              interactive={hydrated}
              lane={lane}
              onLaneChange={selectLane}
              items={currentLane?.items ?? []}
              nextCursor={currentLane?.nextCursor ?? null}
              cursorLoading={Boolean(
                urlState.cursor && loadedCursors[lane] !== urlState.cursor && !failedCursor,
              )}
              cursorError={Boolean(urlState.cursor && failedCursor === urlState.cursor)}
              onLoadMore={() => {
                if (currentLane?.nextCursor) {
                  setFailedCursor(undefined);
                  onUrlStateChange?.({ cursor: currentLane.nextCursor });
                }
              }}
              selectedRecordKey={detail?.recordKey}
              onSelectRecord={(item) => void selectRecord(item)}
            />
          )}
          {section === 'radar' && (
            <RadarView
              data={radarPage}
              interactive={hydrated}
              pageState={radarPageState}
              onLoadMore={() => void loadMoreRadar()}
            />
          )}
          {section === 'stocks' && <StocksView data={data.stocks} stocks={stocks} />}
          {section === 'themes' && (
            <ThemesView
              data={data.themes}
              interactive={hydrated}
              relation={relation}
              relationState={relationState}
              onSelectEntity={(entityKey) => void selectThemeEntity(entityKey)}
            />
          )}
          {section === 'research' && <MyResearchView data={data.myResearch} />}
          {section === 'history' && (
            <HistoryView
              data={historyPage}
              interactive={hydrated}
              pageState={historyPageState}
              onLoadMore={() => void loadMoreHistory()}
            />
          )}
          {section === 'status' && <StatusView data={data.status} />}
        </div>
      </section>

      {inspectorModalOpen && (
        <button
          className={styles.scrim}
          type="button"
          data-motion="none"
          aria-label="인스펙터 닫기"
          onClick={closeInspector}
        />
      )}
      {inspectorVisible && (
        <EvidenceInspector
          detail={detail}
          relation={relation}
          state={visibleDetailState}
          modal={inspectorModalOpen}
          onClose={closeInspector}
        />
      )}
      {mobileNavOpen && (
        <button
          className={styles.scrim}
          type="button"
          data-motion="none"
          aria-label="메뉴 닫기"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
    </main>
  );
}

function PageHeader({
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
        <h1>{title}</h1>
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

function WorkspaceState({
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

function AvailabilityNotice({ availability }: { availability: string }) {
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

function TodayView({
  data,
  interactive,
  lane,
  items,
  nextCursor,
  cursorLoading,
  cursorError,
  selectedRecordKey,
  onLaneChange,
  onLoadMore,
  onSelectRecord,
}: {
  data: WorkspaceToday;
  interactive: boolean;
  lane: ResearchFeedLaneId;
  items: ResearchFeedItem[];
  nextCursor: string | null;
  cursorLoading: boolean;
  cursorError: boolean;
  selectedRecordKey?: string;
  onLaneChange: (lane: ResearchFeedLaneId) => void;
  onLoadMore: () => void;
  onSelectRecord: (item: ResearchFeedItem) => void;
}) {
  const laneTabRefs = useRef<Partial<Record<ResearchFeedLaneId, HTMLButtonElement | null>>>({});
  const moveLaneFocus = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const lastIndex = data.lanes.length - 1;
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextLane = data.lanes[nextIndex]?.lane;
    if (!nextLane) return;
    onLaneChange(nextLane);
    requestAnimationFrame(() => laneTabRefs.current[nextLane]?.focus());
  };

  return (
    <>
      <PageHeader
        eyebrow={formatDate(data.meta.generatedAt)}
        title="오늘 봐야 할 변화"
        description="중요도와 개인 연결도를 분리해, 영향 경로와 근거 수준을 함께 보여줍니다."
        asOf={data.meta.contentSnapshot.analysisCutoffAt}
      />
      <AvailabilityNotice availability={data.meta.freshness} />
      <section className={styles.metricStrip} aria-label="데이터 현황">
        <div>
          <span>오늘의 신호</span>
          <strong>{data.summary.laneItemCount}</strong>
        </div>
        <div>
          <span>관계 경로</span>
          <strong>{formatNumber(data.summary.relationCount)}</strong>
        </div>
        <div>
          <span>관심종목</span>
          <strong>{data.summary.watchlistCount}</strong>
        </div>
        <div>
          <span>연결 출처</span>
          <strong>{data.summary.sourceCount}</strong>
        </div>
      </section>
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>시장 인텔리전스</h2>
            <p>각 레코드는 하나의 분류에만 노출됩니다.</p>
          </div>
          <span>
            {data.meta.sourceCoverage.clickable}/{data.meta.sourceCoverage.total} 출처 연결
          </span>
        </header>
        <div className={styles.laneTabs} role="tablist" aria-label="인사이트 분류">
          {data.lanes.map((item, index) => (
            <button
              key={item.lane}
              id={`lane-tab-${item.lane}`}
              ref={(element) => {
                laneTabRefs.current[item.lane] = element;
              }}
              type="button"
              role="tab"
              aria-selected={lane === item.lane}
              aria-controls="research-feed-panel"
              tabIndex={lane === item.lane ? 0 : -1}
              disabled={!interactive}
              onKeyDown={(event) => moveLaneFocus(event, index)}
              onClick={() => onLaneChange(item.lane)}
            >
              {laneLabels[item.lane]} <small>{item.scopeTotal}</small>
            </button>
          ))}
        </div>
        <div
          id="research-feed-panel"
          className={styles.feed}
          data-testid="research-feed"
          role="tabpanel"
          aria-labelledby={`lane-tab-${lane}`}
        >
          {items.length === 0 ? (
            <WorkspaceState
              kind="empty"
              title="이 분류에는 아직 변화가 없습니다"
              description="다른 분류를 확인하거나 새 신호가 들어올 때 다시 살펴보세요."
            />
          ) : (
            items.map((item) => (
              <button
                key={item.recordKey}
                type="button"
                data-testid="research-feed-record"
                className={styles.feedRow}
                aria-current={selectedRecordKey === item.recordKey}
                disabled={!interactive}
                onClick={() => onSelectRecord(item)}
              >
                <span className={styles.market}>{marketLabel(item.market)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{presentResearchSummary(item.summary)}</p>
                  <small>{whySurfacedLabel(item)}</small>
                </div>
                <div className={styles.rowMeta}>
                  <span>{confidenceLabel(item.confidence)}</span>
                  <time>{formatDate(item.publishedAt, true)}</time>
                </div>
              </button>
            ))
          )}
        </div>
        {(nextCursor || cursorLoading || cursorError) && (
          <div className={styles.feedPager}>
            {cursorError && <span>다음 페이지를 불러오지 못했습니다.</span>}
            <button
              type="button"
              disabled={!interactive || cursorLoading || !nextCursor}
              onClick={onLoadMore}
            >
              {cursorLoading ? '불러오는 중' : cursorError ? '다시 시도' : '다음 변화 더 보기'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function RadarView({
  data,
  interactive,
  pageState,
  onLoadMore,
}: {
  data: RadarSignalPage;
  interactive: boolean;
  pageState: DetailState;
  onLoadMore: () => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="시장 신호"
        title="세계 레이더"
        description="강도와 관심·보유 연결 여부를 함께 비교합니다."
        asOf={data.signalAsOf}
      />
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>감지된 신호</h2>
            <p>
              {formatNumber(data.items.length)}건 표시 · 전체 {formatNumber(data.scopeTotal)}건
            </p>
          </div>
        </header>
        <div className={styles.ledger}>
          {data.items.length === 0 ? (
            <WorkspaceState
              kind="empty"
              title="감지된 신호가 없습니다"
              description="시장 데이터가 들어오면 강도와 관심 연결을 함께 보여드립니다."
            />
          ) : (
            data.items.map((item) => (
              <article key={item.signalKey} className={styles.ledgerRow} data-testid="radar-row">
                <span className={styles.market}>{marketLabel(item.market)}</span>
                <div>
                  <strong>
                    {item.name} <small>{item.symbol}</small>
                  </strong>
                  <p>{presentResearchSummary(item.summary)}</p>
                </div>
                <div className={styles.strength}>
                  <span
                    style={
                      { '--strength': `${Math.round(item.strength * 100)}%` } as React.CSSProperties
                    }
                  />
                  <strong>{Math.round(item.strength * 100)}</strong>
                </div>
                <div className={styles.rowMeta}>
                  <span>
                    {item.watched
                      ? '관심종목 연결'
                      : item.holding
                        ? '보유종목 연결'
                        : signalTypeLabel(item.signalType)}
                  </span>
                  <time>{formatDate(item.occurredAt, true)}</time>
                </div>
              </article>
            ))
          )}
        </div>
        {(data.nextCursor || pageState !== 'ready') && (
          <div className={styles.feedPager}>
            {pageState === 'error' && (
              <span role="alert">다음 시장 신호를 불러오지 못했습니다.</span>
            )}
            <button
              type="button"
              data-testid="radar-load-more"
              disabled={!interactive || pageState === 'loading' || !data.nextCursor}
              onClick={onLoadMore}
            >
              {pageState === 'loading'
                ? '불러오는 중'
                : pageState === 'error'
                  ? '다시 시도'
                  : '더 보기'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function StocksView({
  data,
  stocks,
}: {
  data: StockListResponse;
  stocks: StockListResponse['data'];
}) {
  return (
    <>
      <PageHeader
        eyebrow="종목 리서치"
        title="종목"
        description="관심·보유 여부와 분석 준비 상태를 한 표에서 확인합니다."
        asOf={data.meta.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>종목 커버리지</h2>
            <p>
              {stocks.length}개 표시 · {availabilityLabels[data.availability]}
            </p>
          </div>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.stockTable}>
            <thead>
              <tr>
                <th>종목</th>
                <th>시장</th>
                <th>현재 상태</th>
                <th>최근 가격</th>
                <th>변화율</th>
                <th>분석 시각</th>
              </tr>
            </thead>
            <tbody>
              {stocks.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <WorkspaceState
                      kind="empty"
                      title="조건에 맞는 종목이 없습니다"
                      description="검색어를 지우거나 다른 종목 이름과 티커를 입력해 보세요."
                    />
                  </td>
                </tr>
              )}
              {stocks.map((stock) => (
                <tr key={stock.entityKey}>
                  <td aria-label={`${stock.displayName} ${stock.ticker}`}>
                    <span>
                      <strong>{stock.displayName}</strong>
                      <small>{stock.ticker}</small>
                    </span>
                  </td>
                  <td>{marketLabel(stock.market)}</td>
                  <td>
                    {stock.isHolding
                      ? '보유종목'
                      : stock.isWatched
                        ? '관심종목'
                        : analysisStatusLabel(stock.analysisStatus)}
                  </td>
                  <td>
                    {stock.latestPrice === undefined
                      ? '—'
                      : `${formatNumber(stock.latestPrice)} ${
                          stock.currency === 'KRW' ? '원' : stock.currency === 'USD' ? '달러' : ''
                        }`}
                  </td>
                  <td className={(stock.changePct ?? 0) < 0 ? styles.negative : styles.positive}>
                    {stock.changePct === undefined ? '—' : `${stock.changePct.toFixed(2)}%`}
                  </td>
                  <td>{formatDate(stock.lastAnalyzedAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ThemesView({
  data,
  interactive,
  onSelectEntity,
  relation,
  relationState,
}: {
  data: ThemeResearchList;
  interactive: boolean;
  onSelectEntity: (entityKey: string) => void;
  relation: EntityRelationGraph | null;
  relationState: DetailState;
}) {
  const activeTheme = relation
    ? data.items.find((theme) => theme.topEntityKeys.includes(relation.rootEntityKey))
    : undefined;
  return (
    <>
      <PageHeader
        eyebrow="관계 지도"
        title="테마·관계"
        description="확인된 관계만 모아, 신호 시점과 관계 확인 시점을 나누어 보여줍니다."
        asOf={data.graphKnownThroughAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <div className={styles.split}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>테마 묶음</h2>
              <p>
                {data.items.length}개 · {availabilityLabels[data.availability]}
              </p>
            </div>
          </header>
          <div className={`${styles.ledger} ${styles.themeLedger}`} data-testid="theme-ledger">
            {data.items.length === 0 ? (
              <WorkspaceState
                kind="empty"
                title="아직 구성된 테마가 없습니다"
                description="종목 관계가 확인되면 비교할 테마 묶음을 이곳에 보여드립니다."
              />
            ) : (
              data.items.map((theme) => {
                const isActive = activeTheme?.themeKey === theme.themeKey;
                return (
                  <article
                    key={theme.themeKey}
                    className={styles.themeRow}
                    data-selected={isActive || undefined}
                  >
                    <button
                      className={styles.themeSelect}
                      type="button"
                      data-testid="theme-select"
                      aria-label={`${themeTitleLabel(theme.title)} 관계 보기`}
                      aria-pressed={isActive}
                      disabled={
                        !interactive ||
                        relationState === 'loading' ||
                        theme.topEntityKeys.length === 0
                      }
                      onClick={() => {
                        const entityKey = theme.topEntityKeys[0];
                        if (entityKey) onSelectEntity(entityKey);
                      }}
                    >
                      <strong>{themeTitleLabel(theme.title)}</strong>
                      <p>{theme.description}</p>
                      <small>
                        {isActive
                          ? '오른쪽 관계 지도에 표시 중'
                          : theme.topEntityKeys.length > 0
                            ? `대표 종목 ${theme.topEntityKeys.length}개`
                            : '대표 종목 없음'}
                      </small>
                    </button>
                    <dl>
                      <div>
                        <dt>구성</dt>
                        <dd>{theme.memberCount}</dd>
                      </div>
                      <div>
                        <dt>관심</dt>
                        <dd>{theme.watchedCount}</dd>
                      </div>
                      <div>
                        <dt>신호</dt>
                        <dd>{theme.recentSignalCount}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })
            )}
          </div>
        </section>
        <RelationLedger
          graph={relation}
          contextTitle={activeTheme ? themeTitleLabel(activeTheme.title) : undefined}
          state={relationState}
        />
      </div>
    </>
  );
}

function RelationLedger({
  graph,
  contextTitle,
  state,
}: {
  graph: EntityRelationGraph | null;
  contextTitle?: string;
  state: DetailState;
}) {
  const rootLabel = graph ? relationNodeLabel(graph, graph.rootEntityKey) : undefined;
  return (
    <section className={`${styles.panel} ${styles.relationPanel}`}>
      <header className={styles.panelHeader}>
        <div>
          <h2>{rootLabel ? `${rootLabel} 관계` : '관계 경로'}</h2>
          <p>
            {contextTitle ? `${contextTitle} 대표 종목에서 시작` : '선택한 종목에서 시작'} · 사람이
            확인한 관계
          </p>
        </div>
        <GitBranch aria-hidden="true" />
      </header>
      {state === 'loading' ? (
        <WorkspaceState
          kind="loading"
          title="관계 지도를 불러오고 있습니다"
          description="선택한 테마의 대표 종목과 확인된 관계를 가져오는 중입니다."
        />
      ) : state === 'error' ? (
        <WorkspaceState
          kind="error"
          title="관계 지도를 불러오지 못했습니다"
          description="다른 테마를 선택하거나 잠시 후 다시 시도해 주세요."
        />
      ) : !graph ? (
        <WorkspaceState
          kind="empty"
          title="표시할 관계가 없습니다"
          description="테마의 대표 종목과 연결된 관계가 확인되면 이곳에 지도가 나타납니다."
        />
      ) : (
        <>
          <RelationGraphSvg graph={graph} />
          <details open className={styles.relationFallback}>
            <summary>관계를 텍스트로 보기</summary>
            <section className={styles.edgeList} aria-label="관계 근거 목록">
              {graph.edges.map((edge) => (
                <div key={edge.edgeId}>
                  <span>{relationNodeLabel(graph, edge.from)}</span>
                  <ChevronRight aria-hidden="true" />
                  <span>{relationNodeLabel(graph, edge.to)}</span>
                  <small>
                    {relationTypeLabel(edge.relationType)} · {edge.evidenceCount}개 근거 ·{' '}
                    {confidenceLabel(edge.evidenceQuality)}
                  </small>
                </div>
              ))}
            </section>
          </details>
          <p className={styles.disclosure}>
            사람이 확인한 관계만 표시하며 새로운 연결을 임의로 추정하지 않습니다.{' '}
            {graph.evidenceSummary.limitation}
          </p>
        </>
      )}
    </section>
  );
}

function RelationGraphSvg({ graph }: { graph: EntityRelationGraph }) {
  const layout = layoutRelationNodes(graph.nodes, graph.rootEntityKey);
  const positions = new Map(layout.map((node) => [node.entityKey, node]));
  return (
    <div className={styles.graphFrame} data-testid="relation-graph">
      <svg
        viewBox="0 0 560 300"
        aria-label={`${relationNodeLabel(graph, graph.rootEntityKey)} 관계 지도`}
        aria-describedby="relation-graph-desc"
      >
        <desc id="relation-graph-desc">
          기준 시각까지 사람이 확인한 관계 {graph.edges.length}개
        </desc>
        <g className={styles.graphEdges}>
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={edge.edgeId}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={0.8 + edge.weight * 2.2}
                data-quality={edge.evidenceQuality}
              />
            );
          })}
        </g>
        <g className={styles.graphNodes}>
          {layout.map((node) => {
            const source = graph.nodes.find(({ entityKey }) => entityKey === node.entityKey);
            const isRoot = node.entityKey === graph.rootEntityKey;
            const shortLabel = node.label.length > 12 ? `${node.label.slice(0, 11)}…` : node.label;
            return (
              <g
                key={node.entityKey}
                transform={`translate(${node.x} ${node.y})`}
                data-root={isRoot}
                data-personal={
                  source?.holding ? 'holding' : source?.watched ? 'watched' : undefined
                }
              >
                <circle r={isRoot ? 21 : 14} />
                <text y={isRoot ? 34 : 27} textAnchor="middle">
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function MyResearchView({ data }: { data: MyResearchOverview }) {
  return (
    <>
      <PageHeader
        eyebrow="개인 보관함"
        title="내 리서치"
        description="관심종목, 보유종목, 열린 판단과 검토 기한을 한곳에서 확인합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <section className={styles.metricStrip}>
        <div>
          <span>관심종목</span>
          <strong>{data.watchlistCount}</strong>
        </div>
        <div>
          <span>보유종목</span>
          <strong>{data.holdingCount}</strong>
        </div>
        <div>
          <span>열린 판단</span>
          <strong>{data.openHistoryCount}</strong>
        </div>
        <div>
          <span>검토 필요</span>
          <strong>{data.reviewDueCount}</strong>
        </div>
      </section>
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>최근 판단</h2>
            <p>주문·투자 조언이 아닌 개인 리서치 기록입니다.</p>
          </div>
        </header>
        <HistoryRows items={data.recentHistory} />
      </section>
    </>
  );
}

function HistoryView({
  data,
  interactive,
  pageState,
  onLoadMore,
}: {
  data: DecisionHistoryPage;
  interactive: boolean;
  pageState: DetailState;
  onLoadMore: () => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="판단 기록"
        title="판단 이력"
        description="내가 남긴 판단과 다시 살펴볼 일정을 시간순으로 확인합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>기록</h2>
            <p>
              {data.items.length}건 표시 · 전체 {data.scopeTotal}건 ·{' '}
              {availabilityLabels[data.availability]}
            </p>
          </div>
        </header>
        <HistoryRows items={data.items} />
        {(data.nextCursor || pageState !== 'ready') && (
          <div className={styles.feedPager}>
            {pageState === 'error' && (
              <span role="alert">다음 판단 기록을 불러오지 못했습니다.</span>
            )}
            <button
              type="button"
              data-testid="history-load-more"
              disabled={!interactive || pageState === 'loading' || !data.nextCursor}
              onClick={onLoadMore}
            >
              {pageState === 'loading'
                ? '불러오는 중'
                : pageState === 'error'
                  ? '다시 시도'
                  : '더 보기'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function HistoryRows({ items }: { items: DecisionHistoryPage['items'] }) {
  return (
    <div className={styles.ledger}>
      {items.length === 0 ? (
        <WorkspaceState
          kind="empty"
          title="아직 남긴 판단이 없습니다"
          description="리서치에서 기록한 판단과 다음 검토 일정이 이곳에 쌓입니다."
        />
      ) : (
        items.map((item) => (
          <article key={item.historyId} className={styles.historyRow} data-testid="history-row">
            <Clock3 aria-hidden="true" />
            <div>
              <strong>{item.title}</strong>
              <p>{presentResearchSummary(item.thesis)}</p>
              <small>
                {marketLabel(item.market)} 시장 · 근거 {item.evidenceCount}개 ·{' '}
                {historyStatusLabel(item.status)}
              </small>
            </div>
            <div className={styles.rowMeta}>
              <time>{formatDate(item.occurredAt ?? item.createdAt, true)}</time>
              <span>
                {item.reviewDueAt ? `검토 ${formatDate(item.reviewDueAt)}` : '검토일 없음'}
              </span>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function StatusView({ data }: { data: SystemStatus }) {
  return (
    <>
      <PageHeader
        eyebrow="데이터 운영"
        title="데이터 상태"
        description="데이터가 언제까지 확인됐는지와 출처 연결 수준을 공개합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.overall} />
      <section className={styles.metricStrip}>
        <div>
          <span>전체 상태</span>
          <strong>{availabilityLabels[data.overall]}</strong>
        </div>
        <div>
          <span>연결 출처</span>
          <strong>
            {data.sourceCoverage.linked}/{data.sourceCoverage.total}
          </strong>
        </div>
        <div>
          <span>클릭 가능</span>
          <strong>{data.sourceCoverage.clickable}</strong>
        </div>
        <div>
          <span>그래프 근거</span>
          <strong>{data.graphSourceCoverage.linked}</strong>
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.statusTable}>
            <thead>
              <tr>
                <th>데이터 영역</th>
                <th>상태</th>
                <th>항목 수</th>
                <th>최근 확인</th>
              </tr>
            </thead>
            <tbody>
              {data.datasets.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <WorkspaceState
                      kind="empty"
                      title="확인할 데이터 영역이 없습니다"
                      description="연결된 데이터가 준비되면 영역별 상태를 이곳에 표시합니다."
                    />
                  </td>
                </tr>
              )}
              {data.datasets.map((dataset) => (
                <tr key={[dataset.domain, dataset.datasetName].join(':')}>
                  <td>
                    <strong>{datasetLabel(dataset.domain, dataset.datasetName)}</strong>
                    <small>{domainLabels[dataset.domain] ?? '기타 영역'}</small>
                  </td>
                  <td>{availabilityLabels[dataset.availability]}</td>
                  <td>{dataset.rowCount === null ? '—' : formatNumber(dataset.rowCount)}</td>
                  <td>{formatDate(dataset.watermarkAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function EvidenceInspector({
  detail,
  modal,
  relation,
  state,
  onClose,
}: {
  detail: ResearchRecordDetail | null;
  modal: boolean;
  relation: EntityRelationGraph | null;
  state: DetailState;
  onClose: () => void;
}) {
  const inspectorRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(modal, inspectorRef, onClose);

  useEffect(() => {
    if (modal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modal, onClose]);

  return (
    <dialog
      open
      ref={inspectorRef}
      className={styles.inspector}
      aria-modal={modal || undefined}
      aria-label="근거 인스펙터"
      data-testid="evidence-inspector"
      tabIndex={-1}
    >
      <header>
        <div>
          <FileText aria-hidden="true" />
          <strong>근거 인스펙터</strong>
        </div>
        <button type="button" aria-label="인스펙터 닫기" data-initial-focus onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      {state === 'loading' && (
        <div className={styles.inspectorState}>
          <WorkspaceState
            kind="loading"
            title="근거와 출처를 불러오고 있습니다"
            description="선택한 변화에 묶인 기준 시점의 자료를 확인하는 중입니다."
          />
        </div>
      )}
      {state === 'error' && (
        <div className={styles.inspectorState}>
          <WorkspaceState
            kind="error"
            title="상세 근거를 불러오지 못했습니다"
            description="목록으로 돌아가 잠시 후 같은 변화를 다시 선택해 주세요."
          />
        </div>
      )}
      {state === 'ready' && detail && (
        <div className={styles.inspectorBody}>
          <span className={styles.market}>
            {marketLabel(detail.market)} · {categoryLabel(detail.category)}
          </span>
          <h2>{detail.title}</h2>
          <p className={styles.bodyText}>{presentResearchSummary(detail.body)}</p>
          <dl className={styles.evidenceMeta}>
            <div>
              <dt>근거 수준</dt>
              <dd>{confidenceLabel(detail.confidence)}</dd>
            </div>
            <div>
              <dt>연결 출처</dt>
              <dd>
                {detail.sourceCoverage.linked}/{detail.sourceCoverage.total}
              </dd>
            </div>
            <div>
              <dt>관계 경로</dt>
              <dd>{relation?.edges.length ?? 0}</dd>
            </div>
            <div>
              <dt>분석 기준</dt>
              <dd>{formatDate(detail.meta.contentSnapshot.analysisCutoffAt, true)}</dd>
            </div>
            <div>
              <dt>시장 데이터</dt>
              <dd>
                {detail.meta.marketSnapshot.marketDataAsOf
                  ? formatDate(detail.meta.marketSnapshot.marketDataAsOf, true)
                  : '시각 미확인'}
              </dd>
            </div>
            <div>
              <dt>분석 버전</dt>
              <dd>{detail.meta.contentSnapshot.analysisRevision}</dd>
            </div>
          </dl>
          <section>
            <h3>검증 근거</h3>
            {detail.evidence.length === 0 ? (
              <WorkspaceState
                kind="empty"
                title="연결된 근거가 없습니다"
                description="이 기록에 묶인 근거가 확인되면 이곳에 표시됩니다."
              />
            ) : (
              detail.evidence.map((item) => (
                <article key={item.evidenceId} className={styles.evidenceItem}>
                  <strong>{presentResearchSummary(item.claim)}</strong>
                  <span>
                    {confidenceLabel(item.quality)} · 출처 {item.sourceKeys.length}개
                  </span>
                </article>
              ))
            )}
          </section>
          <section>
            <h3>출처</h3>
            {detail.sources.length === 0 ? (
              <WorkspaceState
                kind="empty"
                title="연결된 출처가 없습니다"
                description="원문 출처가 확인되면 이름과 기준 시점 상태를 보여드립니다."
              />
            ) : (
              detail.sources.map((source) =>
                source.url ? (
                  <a key={source.sourceKey} href={source.url} target="_blank" rel="noreferrer">
                    <span>{sourceAttributionLabel(source.attributionText)}</span>
                    <small>
                      {sourceBindingLabel(source.bindingState)} ·{' '}
                      {source.publishedAt ? formatDate(source.publishedAt) : '발행일 미확인'}
                    </small>
                  </a>
                ) : (
                  <div key={source.sourceKey} className={styles.sourceMissing}>
                    <span>{sourceAttributionLabel(source.attributionText)}</span>
                    <small>링크 없음</small>
                  </div>
                ),
              )
            )}
          </section>
          {detail.limitations.length > 0 && (
            <section>
              <h3>한계</h3>
              <ul>
                {detail.limitations.map((item) => (
                  <li key={item}>{presentResearchSummary(item)}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </dialog>
  );
}
