import {
  Bell,
  Bolt,
  CalendarDays,
  Cpu,
  LockKeyhole,
  Newspaper,
  PieChart,
  Search,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import styles from './dashboard-shell.module.css';

import type { Insight } from '@/entities/insight';
import type { PortfolioSnapshot } from '@/entities/portfolio';
import { StockDetail, type Stock } from '@/entities/stock';
import type { ThemeNode } from '@/entities/theme';
import { dashboardSections, type DashboardSectionId } from '@/features/dashboard-navigation';
import { filterStocks } from '@/features/stock-search';
import { useDashboardReveal } from '@/shared/motion/use-dashboard-reveal';
import {
  buildEmptyStateCopy,
  buildQualityTestId,
  Button,
  DataQualityPopover,
  EmptyState,
  SearchField,
  Skeleton,
  StatusBadge,
} from '@/shared/ui/primitives';
import { ScrollArea } from '@/shared/ui/scroll';
import type {
  DataAvailability,
  DiscoverStockItem,
  ManualPositionInput,
  ManualWatchlistInput,
  MeBootstrap,
  PortfolioDigest,
  ResponseMeta,
} from '@stock-insight/contracts';

export type ManualPortfolioAction =
  | { type: 'upsert-watchlist'; input: ManualWatchlistInput }
  | { type: 'remove-watchlist'; entityKey: string }
  | { type: 'upsert-position'; input: ManualPositionInput }
  | { type: 'close-position'; entityKey: string };

export type ManualPortfolioMutationStatus = 'idle' | 'saving' | 'success' | 'error';

type DashboardShellProps = {
  dataAvailability?: DataAvailability;
  dataSource?: ResponseMeta['source'];
  discoverAvailability?: DataAvailability;
  discoverCandidates?: DiscoverStockItem[];
  discoverSource?: ResponseMeta['source'];
  insights: Insight[];
  marketInsights: Insight[];
  marketNewsAvailability?: DataAvailability;
  marketNewsSource?: ResponseMeta['source'];
  manualPortfolioData?: MeBootstrap;
  manualPortfolioStatus?: ManualPortfolioMutationStatus;
  onManualPortfolioAction?: (action: ManualPortfolioAction) => Promise<boolean>;
  portfolio: PortfolioSnapshot;
  portfolioAvailability?: DataAvailability;
  portfolioDigest?: PortfolioDigest;
  portfolioDigestAvailability?: DataAvailability;
  portfolioDigestSource?: ResponseMeta['source'];
  portfolioSource?: ResponseMeta['source'];
  stocks: Stock[];
  stockListAvailability?: DataAvailability;
  stockListSource?: ResponseMeta['source'];
  themes: ThemeNode[];
};

type NewsScope = 'personal' | 'market';

const insightIcons: Record<Insight['icon'], LucideIcon> = {
  bolt: Bolt,
  cpu: Cpu,
  newspaper: Newspaper,
  'triangle-alert': TriangleAlert,
};

const LazyThemeFlowChart = lazy(() =>
  import('./theme-flow-chart').then((module) => ({ default: module.ThemeFlowChart })),
);
const LazyPortfolioThemeShareChart = lazy(() =>
  import('./portfolio-theme-share-chart').then((module) => ({
    default: module.PortfolioThemeShareChart,
  })),
);

export function DashboardShell({
  dataAvailability = 'collecting',
  dataSource = 'fallback',
  discoverAvailability = 'collecting',
  discoverCandidates = [],
  discoverSource = 'fallback',
  insights,
  marketInsights,
  marketNewsAvailability = 'collecting',
  marketNewsSource = 'fallback',
  manualPortfolioData,
  manualPortfolioStatus = 'idle',
  onManualPortfolioAction,
  portfolio,
  portfolioAvailability = 'collecting',
  portfolioDigest,
  portfolioDigestAvailability = 'collecting',
  portfolioDigestSource = 'fallback',
  portfolioSource = 'fallback',
  stocks,
  stockListAvailability = 'collecting',
  stockListSource = 'fallback',
  themes,
}: DashboardShellProps) {
  const [activeSection, setActiveSection] = useState<DashboardSectionId>('today');
  const [query, setQuery] = useState('');
  const [selectedStockId, setSelectedStockId] = useState(stocks[0]?.id ?? '');
  const revealRef = useRef<HTMLDivElement | null>(null);

  const filteredStocks = useMemo(() => filterStocks(stocks, query), [query, stocks]);
  const selectedStock =
    filteredStocks.find((stock) => stock.id === selectedStockId) ??
    filteredStocks[0] ??
    (query.trim() ? undefined : stocks[0]);

  useEffect(() => {
    document.documentElement.dataset.futurHydrated = 'true';

    return () => {
      delete document.documentElement.dataset.futurHydrated;
    };
  }, []);

  useDashboardReveal(revealRef, activeSection);

  const showStocks = () => setActiveSection('stocks');
  const showNews = () => setActiveSection('news');

  const handleGlobalSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    setQuery(event.currentTarget.value);
    setActiveSection('stocks');
  };

  return (
    <main className={styles.page}>
      <section
        className={styles.shell}
        data-availability={dataAvailability}
        data-portfolio-availability={portfolioAvailability}
        data-portfolio-source={portfolioSource}
        data-source={dataSource}
        data-testid="dashboard-shell"
      >
        <h1 className={styles.srOnly}>Futur Insight</h1>
        <div className={styles.app}>
          <aside className={styles.sidebar} aria-label="데스크톱 내비게이션">
            <Brand />
            <Navigation activeSection={activeSection} onSelect={setActiveSection} />
            <SecurityNote />
          </aside>

          <section className={styles.main}>
            <div className={styles.top}>
              <SearchField
                className={styles.search}
                icon={<Search aria-hidden="true" />}
                inputProps={{
                  'aria-label': '종목·티커·테마 전체 검색',
                  placeholder: '종목·티커·테마 검색 후 Enter',
                  onKeyDown: handleGlobalSearchKeyDown,
                }}
              />
              <div className={styles.topPrinciples} aria-label="서비스 원칙">
                <span className={styles.principleItem}>
                  <ShieldCheck aria-hidden="true" /> 조회 전용
                </span>
                <span className={styles.principleItem}>
                  <Bell aria-hidden="true" /> 리서치 발행
                </span>
                <span className={styles.principleItem}>
                  <TriangleAlert aria-hidden="true" /> 주문 기능 없음
                </span>
              </div>
              <button className={styles.avatar} type="button" aria-label="알림과 계정">
                JK
              </button>
            </div>

            <ScrollArea
              className={styles.contentScroll}
              viewportProps={{
                'aria-label': '대시보드 콘텐츠',
                'data-testid': 'dashboard-content-scroll',
                role: 'region',
              }}
              contentStyle={{ minHeight: '100%' }}
            >
              <div className={styles.contentInner} ref={revealRef}>
                {activeSection === 'today' ? (
                  <TodayView
                    insights={insights}
                    portfolio={portfolio}
                    themes={themes}
                    onShowNews={showNews}
                    onShowStocks={showStocks}
                  />
                ) : null}
                {activeSection === 'news' ? (
                  <NewsView
                    marketInsights={marketInsights}
                    marketNewsAvailability={marketNewsAvailability}
                    marketNewsSource={marketNewsSource}
                    personalInsights={insights}
                  />
                ) : null}
                {activeSection === 'stocks' ? (
                  <StocksView
                    discoverAvailability={discoverAvailability}
                    discoverCandidates={discoverCandidates}
                    discoverSource={discoverSource}
                    filteredStocks={filteredStocks}
                    query={query}
                    selectedStock={selectedStock}
                    selectedStockId={selectedStockId}
                    stockListAvailability={stockListAvailability}
                    stockListSource={stockListSource}
                    onQueryChange={setQuery}
                    onSelectStock={setSelectedStockId}
                  />
                ) : null}
                {activeSection === 'theme' ? <ThemeView themes={themes} /> : null}
                {activeSection === 'portfolio' ? (
                  <PortfolioView
                    manualPortfolioData={manualPortfolioData}
                    manualPortfolioStatus={manualPortfolioStatus}
                    onManualPortfolioAction={onManualPortfolioAction}
                    portfolio={portfolio}
                    portfolioAvailability={portfolioAvailability}
                    portfolioDigest={portfolioDigest}
                    portfolioDigestAvailability={portfolioDigestAvailability}
                    portfolioDigestSource={portfolioDigestSource}
                    portfolioSource={portfolioSource}
                  />
                ) : null}
                {activeSection === 'settings' ? <SettingsView /> : null}
              </div>
            </ScrollArea>
          </section>
        </div>

        <nav className={styles.tabbar} aria-label="모바일 내비게이션" data-testid="mobile-tabbar">
          {dashboardSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={styles.tabButton}
                type="button"
                aria-current={activeSection === section.id ? 'page' : undefined}
                data-testid={`mobile-tab-${section.id}`}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
              >
                <Icon aria-hidden="true" />
                <span>{section.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div className={styles.brand}>
      <div className={styles.logo}>F</div>
      <div>
        <b>Futur Insight</b>
        <span>Research terminal</span>
      </div>
    </div>
  );
}

function Navigation({
  activeSection,
  onSelect,
}: Readonly<{
  activeSection: DashboardSectionId;
  onSelect: (section: DashboardSectionId) => void;
}>) {
  return (
    <nav className={styles.nav} aria-label="주요 화면">
      {dashboardSections.map((section) => {
        const Icon = section.icon;
        return (
          <button
            className={styles.navButton}
            type="button"
            aria-current={activeSection === section.id ? 'page' : undefined}
            data-testid={`nav-tab-${section.id}`}
            key={section.id}
            onClick={() => onSelect(section.id)}
          >
            <Icon aria-hidden="true" />
            <span>{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SecurityNote() {
  return (
    <div className={styles.secure}>
      <b>
        <LockKeyhole aria-hidden="true" />
        키 보안
      </b>
      <p>서버에 app key/secret 원문을 저장하지 않는 구조를 전제로 합니다.</p>
    </div>
  );
}

function TodayView({
  insights,
  portfolio,
  themes,
  onShowNews,
  onShowStocks,
}: Readonly<{
  insights: Insight[];
  portfolio: PortfolioSnapshot;
  themes: ThemeNode[];
  onShowNews: () => void;
  onShowStocks: () => void;
}>) {
  return (
    <section className={styles.view} aria-label="오늘 브리핑">
      <div className={styles.briefingGrid}>
        <article className={`${styles.panel} ${styles.briefingPanel}`} data-reveal>
          <span className={`${styles.metaLabel} ${styles.statusPrimary}`}>
            <Newspaper aria-hidden="true" />
            리서치 브리프
          </span>
          <h2>시장-종목 연결 브리프</h2>
          <p>관련 뉴스, 테마 흐름, 보유 맥락을 한 화면에서 점검합니다.</p>
          <div className={styles.briefMeta}>
            <span>발행 기준 09:20</span>
            <span>조회 전용 목업</span>
            <span>매수·매도 지시 없음</span>
          </div>
          <div className={styles.buttonGroup}>
            <Button
              className={styles.primaryButton}
              variant="primary"
              size="sm"
              onClick={onShowStocks}
            >
              종목 분석 보기
            </Button>
            <Button
              className={styles.secondaryButton}
              variant="secondary"
              size="sm"
              onClick={onShowNews}
            >
              뉴스 보기
            </Button>
          </div>
        </article>
        <section className={`${styles.panel} ${styles.exposurePanel}`} data-reveal>
          <b>포트폴리오 노출</b>
          <div>
            <strong>{portfolio.value}</strong>
            <br />
            <span>{portfolio.dailyChange}</span>
          </div>
          <PortfolioSnapshotChart portfolio={portfolio} />
        </section>
      </div>

      <div className={styles.metricStrip}>
        <Kpi label="관련 이슈" value={`${portfolio.relatedIssueCount}건`} icon={Newspaper} />
        <Kpi label="상위 테마" value={portfolio.focusTheme} icon={PieChart} />
        <Kpi label="확인 일정" value={`${portfolio.scheduleCount}개`} icon={CalendarDays} />
        <Kpi label="주의 신호" value={portfolio.cautionLevel} icon={TriangleAlert} />
      </div>

      <div className={styles.grid}>
        <article className={styles.card} data-reveal>
          <h3>내 종목 관련 뉴스</h3>
          <InsightFeed insights={insights.slice(0, 2)} />
        </article>
        <article className={styles.card} data-reveal>
          <h3>테마 이동 지도</h3>
          <p>
            {themes.map((theme) => theme.title).join(' → ')}로 관심이 확산됩니다. 이 흐름은
            보유종목과 관심종목을 비교하는 정보 제공용 맥락입니다.
          </p>
        </article>
      </div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: LucideIcon; label: string; value: string }>) {
  return (
    <div className={`${styles.panel} ${styles.metricTile}`} data-reveal>
      <label>
        {label}
        <Icon aria-hidden="true" />
      </label>
      <strong>{value}</strong>
    </div>
  );
}

function PortfolioSnapshotChart({ portfolio }: Readonly<{ portfolio: PortfolioSnapshot }>) {
  return (
    <figure className={styles.snapshotFigure} data-testid="portfolio-snapshot-chart">
      <figcaption className={styles.srOnly}>포트폴리오 발행 기준 추세</figcaption>
      <div className={styles.snapshotChart} aria-hidden="true">
        {portfolio.trend.map((item, index) => (
          <span
            className={styles.snapshotBar}
            data-testid="portfolio-snapshot-bar"
            key={`${item.label}-${item.value}`}
            style={{ '--bar-index': index, height: `${item.value}%` } as CSSProperties}
          >
            <i>{item.label}</i>
          </span>
        ))}
      </div>
    </figure>
  );
}

function InsightFeed({ insights }: Readonly<{ insights: Insight[] }>) {
  return (
    <div className={styles.feed}>
      {insights.map((insight) => {
        const Icon = insightIcons[insight.icon];
        return (
          <div className={styles.feedItem} key={insight.id} data-reveal>
            <div className={styles.feedIcon}>
              <Icon aria-hidden="true" />
            </div>
            <div>
              <b>{insight.title}</b>
              <span>{insight.context}</span>
            </div>
            <em className={styles.impactText}>{insight.impact}</em>
          </div>
        );
      })}
    </div>
  );
}

function NewsView({
  marketInsights,
  marketNewsAvailability,
  marketNewsSource,
  personalInsights,
}: Readonly<{
  marketInsights: Insight[];
  marketNewsAvailability: DataAvailability;
  marketNewsSource: ResponseMeta['source'];
  personalInsights: Insight[];
}>) {
  const [scope, setScope] = useState<NewsScope>('personal');
  const activeInsights = scope === 'personal' ? personalInsights : marketInsights;
  const newsEmptyCopy = buildEmptyStateCopy({
    label: scope === 'personal' ? '내 종목 뉴스' : '시장 뉴스',
    reason: '선택한 범위에 표시할 뉴스가 아직 수집되지 않았습니다.',
    nextAction:
      scope === 'personal'
        ? '시장 전체 뉴스로 전환하거나 포트폴리오 원장을 확인하세요.'
        : '상단 데이터 품질 상태를 확인하세요.',
  });

  return (
    <section
      className={styles.view}
      aria-label="뉴스"
      data-news-availability={marketNewsAvailability}
      data-news-source={marketNewsSource}
      data-testid="news-view"
    >
      <div className={styles.newsHead} data-reveal>
        <SectionHead
          title="뉴스"
          description="내 종목에 연결된 브리프와 시장 전체 뉴스를 분리해 봅니다."
        />
        <StatusQualityStack
          availability={marketNewsAvailability}
          label="시장 뉴스"
          qualityId="market-news"
          source={marketNewsSource}
          testId="market-news-status"
        />
      </div>

      <div className={styles.newsToolbar} data-reveal>
        <button
          className={styles.newsScopeButton}
          type="button"
          aria-pressed={scope === 'personal'}
          data-testid="news-scope-personal"
          onClick={() => setScope('personal')}
        >
          내 종목 뉴스
        </button>
        <button
          className={styles.newsScopeButton}
          type="button"
          aria-pressed={scope === 'market'}
          data-testid="news-scope-market"
          onClick={() => setScope('market')}
        >
          시장 전체 뉴스
        </button>
      </div>

      <div className={styles.grid}>
        <article className={`${styles.card} ${styles.newsFeedCard}`} data-reveal>
          <h3>{scope === 'personal' ? '내 종목 관련 뉴스' : '시장 전체 뉴스'}</h3>
          {activeInsights.length > 0 ? (
            <InsightFeed insights={activeInsights} />
          ) : (
            <EmptyState className={styles.empty}>{newsEmptyCopy.text}</EmptyState>
          )}
        </article>
        <article className={styles.card} data-reveal>
          <h3>읽는 기준</h3>
          <p>
            내 종목 뉴스는 대시보드 브리프 기준, 시장 전체 뉴스는 /api/market-news 기준으로
            분리합니다. 상태 배지는 실제 데이터 주입 여부를 보여줍니다.
          </p>
        </article>
      </div>
    </section>
  );
}

function StocksView({
  discoverAvailability,
  discoverCandidates,
  discoverSource,
  filteredStocks,
  query,
  selectedStock,
  selectedStockId,
  stockListAvailability,
  stockListSource,
  onQueryChange,
  onSelectStock,
}: Readonly<{
  discoverAvailability: DataAvailability;
  discoverCandidates: DiscoverStockItem[];
  discoverSource: ResponseMeta['source'];
  filteredStocks: Stock[];
  query: string;
  selectedStock: Stock | undefined;
  selectedStockId: string;
  stockListAvailability: DataAvailability;
  stockListSource: ResponseMeta['source'];
  onQueryChange: (query: string) => void;
  onSelectStock: (stockId: string) => void;
}>) {
  const stockSearchEmptyCopy = buildEmptyStateCopy({
    label: '검색 결과',
    reason: query.trim()
      ? '검색어와 일치하는 종목이 없습니다.'
      : '표시할 종목 카드가 아직 준비되지 않았습니다.',
    nextAction: query.trim()
      ? '검색어를 지우거나 삼성전자, HBM, 전력기기, NAVER 중 하나로 다시 검색하세요.'
      : '상단 종목 데이터 품질 상태를 확인하세요.',
  });
  const selectedStockEmptyCopy = buildEmptyStateCopy({
    label: '종목 상세',
    reason: '선택 가능한 종목 카드가 없습니다.',
    nextAction: '검색어를 지우거나 종목 목록 수집 상태를 확인하세요.',
  });
  const discoverEmptyCopy = buildEmptyStateCopy({
    label: '발굴 후보',
    reason: '조건에 맞는 발굴 후보가 아직 준비되지 않았습니다.',
    nextAction: '관심종목 원장과 발굴 후보 데이터 품질 상태를 확인하세요.',
  });

  return (
    <section className={styles.view} aria-label="종목 분석">
      <div className={styles.head} data-reveal>
        <div>
          <h2>종목 분석</h2>
          <p>
            보유종목과 관심 후보를 같은 리서치 기준으로 비교합니다. 상세 영역은 독립 스크롤됩니다.
          </p>
        </div>
        <StatusQualityStack
          availability={stockListAvailability}
          label={`종목 ${filteredStocks.length}개`}
          qualityId="stock-list"
          source={stockListSource}
          testId="stock-list-status"
        />
      </div>

      <section className={`${styles.card} ${styles.discoverPanel}`} data-reveal>
        <div className={styles.discoverHead}>
          <div>
            <h3>발굴 후보</h3>
            <p>관심종목·시장 모멘텀과 연결된 새 후보를 조회 전용으로 보여줍니다.</p>
          </div>
          <StatusQualityStack
            availability={discoverAvailability}
            label="발굴 후보"
            qualityId="discover"
            source={discoverSource}
            testId="discover-status"
          />
        </div>
        <div className={styles.discoverList} data-testid="discover-list">
          {discoverCandidates.length > 0 ? (
            discoverCandidates.slice(0, 3).map((candidate) => (
              <article className={styles.discoverCard} key={candidate.entityKey}>
                <div>
                  <b>{candidate.name}</b>
                  <span>
                    {candidate.market}:{candidate.ticker} · {candidate.reasonTitle}
                  </span>
                </div>
                <p>{candidate.reasonSummary}</p>
                <small>
                  출처 {candidate.sourceCount}개 · 분석{' '}
                  {candidate.canStartAnalysis ? '시작 가능' : '이미 진행됨'}
                </small>
              </article>
            ))
          ) : (
            <EmptyState className={styles.empty}>{discoverEmptyCopy.text}</EmptyState>
          )}
        </div>
      </section>

      <div className={styles.stockLayout}>
        <section className={styles.stockPanel}>
          <SearchField
            className={`${styles.search} ${styles.stockSearch}`}
            icon={<Search aria-hidden="true" />}
            inputProps={{
              'aria-label': '종목 검색',
              'data-testid': 'stock-search',
              placeholder: '삼성전자, HBM, 전력기기, NAVER',
              value: query,
              onChange: (event) => onQueryChange(event.currentTarget.value),
            }}
          />

          <ScrollArea
            className={styles.stockListScroll}
            viewportProps={{
              'aria-label': '종목 목록',
              'data-testid': 'stock-list-scroll',
              role: 'region',
            }}
          >
            <div className={styles.stockList} data-testid="stock-list">
              {filteredStocks.length > 0 ? (
                filteredStocks.map((stock) => (
                  <button
                    className={styles.stockButton}
                    type="button"
                    aria-pressed={(selectedStock?.id ?? selectedStockId) === stock.id}
                    data-selected={(selectedStock?.id ?? selectedStockId) === stock.id}
                    data-testid={`stock-card-${stock.id}`}
                    key={stock.id}
                    onClick={() => onSelectStock(stock.id)}
                  >
                    <div className={styles.stockHead}>
                      <div>
                        <b>{stock.name}</b>
                        <small>{stock.theme}</small>
                      </div>
                      <code>{stock.ticker}</code>
                    </div>
                    <span className={styles.returnLine}>
                      {stock.change}
                      <i className={styles.stockFlag}>{stock.holding ? '보유' : '검색'}</i>
                    </span>
                  </button>
                ))
              ) : (
                <EmptyState className={styles.empty}>{stockSearchEmptyCopy.text}</EmptyState>
              )}
            </div>
          </ScrollArea>
        </section>

        <ScrollArea
          className={styles.stockDetail}
          viewportProps={{
            'aria-label': '종목 상세',
            'data-testid': 'stock-detail',
            role: 'region',
          }}
        >
          <div className={styles.detailInner}>
            {selectedStock ? (
              <StockDetail stock={selectedStock} />
            ) : (
              <EmptyState className={styles.empty}>{selectedStockEmptyCopy.text}</EmptyState>
            )}
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}

function ThemeView({ themes }: Readonly<{ themes: ThemeNode[] }>) {
  return (
    <section className={styles.view} aria-label="테마 지도">
      <SectionHead
        title="테마 지도"
        description="AI 테마가 어떤 병목을 따라 이동하는지 정보 제공용 리서치 흐름으로 봅니다."
      />
      <article className={`${styles.card} ${styles.themeChartCard}`} data-reveal>
        <h3>테마 흐름 그래프</h3>
        <Suspense fallback={<Skeleton className={styles.themeChart} height={220} />}>
          <LazyThemeFlowChart themes={themes} />
        </Suspense>
      </article>
      <div className={styles.themeFlow}>
        {themes.map((theme) => (
          <article className={styles.themeCard} data-reveal key={theme.id}>
            <h3>{theme.title}</h3>
            <p>{theme.description}</p>
            <meter
              className={styles.themeMeter}
              aria-label={`${theme.title} 강도`}
              min={0}
              max={100}
              value={theme.strength}
            >
              {theme.strength}%
            </meter>
          </article>
        ))}
      </div>
    </section>
  );
}

function PortfolioView({
  manualPortfolioData,
  manualPortfolioStatus,
  onManualPortfolioAction,
  portfolio,
  portfolioAvailability,
  portfolioDigest,
  portfolioDigestAvailability,
  portfolioDigestSource,
  portfolioSource,
}: Readonly<{
  manualPortfolioData: MeBootstrap | undefined;
  manualPortfolioStatus: ManualPortfolioMutationStatus;
  onManualPortfolioAction: ((action: ManualPortfolioAction) => Promise<boolean>) | undefined;
  portfolio: PortfolioSnapshot;
  portfolioAvailability: DataAvailability;
  portfolioDigest: PortfolioDigest | undefined;
  portfolioDigestAvailability: DataAvailability;
  portfolioDigestSource: ResponseMeta['source'];
  portfolioSource: ResponseMeta['source'];
}>) {
  const [watchMarket, setWatchMarket] = useState<'KR' | 'US'>('KR');
  const [watchTicker, setWatchTicker] = useState('');
  const [watchName, setWatchName] = useState('');
  const [positionMarket, setPositionMarket] = useState<'KR' | 'US'>('KR');
  const [positionTicker, setPositionTicker] = useState('');
  const [positionName, setPositionName] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const isSaving = manualPortfolioStatus === 'saving';
  const watchlist = manualPortfolioData?.watchlist ?? [];
  const positions = manualPortfolioData?.positions ?? [];

  const submitWatchlist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticker = watchTicker.trim();
    if (!ticker || !onManualPortfolioAction) return;

    void onManualPortfolioAction({
      type: 'upsert-watchlist',
      input: {
        market: watchMarket,
        ticker,
        ...(watchName.trim() ? { displayName: watchName.trim() } : {}),
      },
    }).then((ok) => {
      if (!ok) return;
      setWatchTicker('');
      setWatchName('');
    });
  };

  const submitPosition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticker = positionTicker.trim();
    if (!ticker || !onManualPortfolioAction) return;

    const parsedAvgPrice = avgPrice.trim() ? Number(avgPrice) : undefined;
    const parsedQuantity = quantity.trim() ? Number(quantity) : undefined;

    void onManualPortfolioAction({
      type: 'upsert-position',
      input: {
        market: positionMarket,
        ticker,
        ...(positionName.trim() ? { displayName: positionName.trim() } : {}),
        ...(Number.isFinite(parsedAvgPrice) ? { avgPrice: parsedAvgPrice } : {}),
        ...(Number.isFinite(parsedQuantity) ? { quantity: parsedQuantity } : {}),
      },
    }).then((ok) => {
      if (!ok) return;
      setPositionTicker('');
      setPositionName('');
      setAvgPrice('');
      setQuantity('');
    });
  };

  return (
    <section
      className={styles.view}
      aria-label="포트폴리오"
      data-portfolio-availability={portfolioAvailability}
      data-portfolio-source={portfolioSource}
      data-testid="portfolio-view"
    >
      <div className={styles.newsHead} data-reveal>
        <SectionHead
          title="포트폴리오"
          description="수동 관심종목·보유종목 입력 원장을 기준으로 리서치 범위를 요약합니다."
        />
        <StatusQualityStack
          availability={portfolioAvailability}
          label="포트폴리오"
          qualityId="portfolio"
          source={portfolioSource}
          testId="portfolio-status"
        />
      </div>
      <div className={styles.metricStrip}>
        <Kpi label="총 평가" value={portfolio.value} icon={PieChart} />
        <Kpi label="오늘 변화" value={portfolio.dailyChange} icon={Bolt} />
        <Kpi label="관련 이슈" value={`${portfolio.relatedIssueCount}건`} icon={Newspaper} />
        <Kpi label="주의 신호" value={portfolio.cautionLevel} icon={TriangleAlert} />
      </div>
      <Suspense fallback={<Skeleton height={240} />}>
        <LazyPortfolioThemeShareChart portfolio={portfolio} portfolioSource={portfolioSource} />
      </Suspense>
      <PortfolioDigestPanel
        digest={portfolioDigest}
        availability={portfolioDigestAvailability}
        source={portfolioDigestSource}
      />
      <div className={styles.manualPortfolioGrid} data-reveal>
        <article className={styles.card}>
          <h3>관심종목 직접 추가</h3>
          <p>KR 6자리 코드 또는 US 티커만 저장합니다. 주문·브로커 연결은 없습니다.</p>
          <form className={styles.manualForm} onSubmit={submitWatchlist}>
            <select
              aria-label="관심종목 시장"
              value={watchMarket}
              onChange={(event) => setWatchMarket(event.currentTarget.value as 'KR' | 'US')}
            >
              <option value="KR">KR</option>
              <option value="US">US</option>
            </select>
            <input
              aria-label="관심종목 티커"
              placeholder={watchMarket === 'KR' ? '005930' : 'NVDA'}
              value={watchTicker}
              onChange={(event) => setWatchTicker(event.currentTarget.value)}
            />
            <input
              aria-label="관심종목 표시명"
              placeholder="표시명 선택"
              value={watchName}
              onChange={(event) => setWatchName(event.currentTarget.value)}
            />
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={isSaving || !watchTicker.trim()}
            >
              관심 추가
            </Button>
          </form>
          <ManualPortfolioList
            emptyText={
              buildEmptyStateCopy({
                label: '관심종목 원장',
                reason: '직접 저장한 관심종목이 없습니다.',
                nextAction: '시장과 티커를 입력한 뒤 관심 추가를 누르세요.',
              }).text
            }
            items={watchlist.map((item) => ({
              entityKey: item.entityKey,
              label: item.displayName,
              meta: `${item.market} · ${item.ticker}`,
            }))}
            actionLabel="관심 해제"
            disabled={isSaving || !onManualPortfolioAction}
            onAction={(entityKey) =>
              onManualPortfolioAction?.({ type: 'remove-watchlist', entityKey }) ??
              Promise.resolve(false)
            }
          />
        </article>
        <article className={styles.card}>
          <h3>보유종목 직접 입력</h3>
          <p>평단·수량은 리서치 노출 계산용 수동 값입니다. 주문 실행 기능은 없습니다.</p>
          <form className={styles.manualForm} onSubmit={submitPosition}>
            <select
              aria-label="보유종목 시장"
              value={positionMarket}
              onChange={(event) => setPositionMarket(event.currentTarget.value as 'KR' | 'US')}
            >
              <option value="KR">KR</option>
              <option value="US">US</option>
            </select>
            <input
              aria-label="보유종목 티커"
              placeholder={positionMarket === 'KR' ? '005930' : 'NVDA'}
              value={positionTicker}
              onChange={(event) => setPositionTicker(event.currentTarget.value)}
            />
            <input
              aria-label="보유종목 표시명"
              placeholder="표시명 선택"
              value={positionName}
              onChange={(event) => setPositionName(event.currentTarget.value)}
            />
            <input
              aria-label="평균 단가"
              inputMode="decimal"
              placeholder="평단 선택"
              value={avgPrice}
              onChange={(event) => setAvgPrice(event.currentTarget.value)}
            />
            <input
              aria-label="수량"
              inputMode="decimal"
              placeholder="수량 선택"
              value={quantity}
              onChange={(event) => setQuantity(event.currentTarget.value)}
            />
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={isSaving || !positionTicker.trim()}
            >
              보유 저장
            </Button>
          </form>
          <ManualPortfolioList
            emptyText={
              buildEmptyStateCopy({
                label: '보유종목 원장',
                reason: '직접 저장한 보유종목이 없습니다.',
                nextAction: '시장과 티커를 입력한 뒤 보유 저장을 누르세요.',
              }).text
            }
            items={positions.map((item) => ({
              entityKey: item.entityKey,
              label: item.displayName,
              meta: [
                `${item.market} · ${item.ticker}`,
                item.quantity !== undefined ? `수량 ${item.quantity}` : null,
                item.avgPrice !== undefined ? `평단 ${item.avgPrice}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
            actionLabel="보유 마감"
            disabled={isSaving || !onManualPortfolioAction}
            onAction={(entityKey) =>
              onManualPortfolioAction?.({ type: 'close-position', entityKey }) ??
              Promise.resolve(false)
            }
          />
        </article>
      </div>
      <p className={styles.manualStatus} data-status={manualPortfolioStatus}>
        {manualPortfolioStatus === 'saving'
          ? '저장 중입니다.'
          : manualPortfolioStatus === 'success'
            ? '저장 후 최신 원장으로 갱신했습니다.'
            : manualPortfolioStatus === 'error'
              ? '저장에 실패했습니다. 입력 형식과 DB 권한을 확인하세요.'
              : '수동 입력은 리서치 원장에만 반영됩니다.'}
      </p>
    </section>
  );
}

function severityLabel(severity: PortfolioDigest['alerts'][number]['severity']) {
  if (severity === 'high') return '높음';
  if (severity === 'medium') return '중간';
  return '낮음';
}

function riskLabel(riskLevel: PortfolioDigest['exposures'][number]['riskLevel']) {
  if (riskLevel === 'high') return '집중';
  if (riskLevel === 'medium') return '주의';
  return '분산';
}

function PortfolioDigestPanel({
  availability,
  digest,
  source,
}: Readonly<{
  availability: DataAvailability;
  digest: PortfolioDigest | undefined;
  source: ResponseMeta['source'];
}>) {
  const alerts = digest?.alerts ?? [];
  const exposures = digest?.exposures ?? [];
  const freshness = digest?.freshness ?? [];
  const stats = digest?.stats;
  const alertsEmptyCopy = buildEmptyStateCopy({
    label: '변화 알림',
    reason: '새로 계산된 변화 또는 주의 항목이 없습니다.',
    nextAction: '원장을 수정했거나 시간이 지났다면 Digest 수집 상태를 확인하세요.',
  });
  const exposuresEmptyCopy = buildEmptyStateCopy({
    label: '포트폴리오 노출',
    reason: '노출 계산에 사용할 보유종목 원장이 없습니다.',
    nextAction: '보유종목을 저장하거나 포트폴리오 데이터 품질 상태를 확인하세요.',
  });
  const freshnessEmptyCopy = buildEmptyStateCopy({
    label: '데이터 신선도',
    reason: '신선도 비교에 사용할 수집 기록이 없습니다.',
    nextAction: 'Digest 수집 상태를 확인하고 다음 수집 주기를 기다리세요.',
  });

  return (
    <section className={styles.digestPanel} data-reveal data-testid="portfolio-digest-panel">
      <div className={styles.digestHead}>
        <div>
          <h3>변화 알림·노출·신선도</h3>
          <p>매수·매도 지시가 아니라 내 원장 기준으로 달라진 점과 확인 필요 항목만 보여줍니다.</p>
        </div>
        <StatusQualityStack
          availability={availability}
          label="Digest"
          qualityId="portfolio-digest"
          qualityPlacement="above"
          source={source}
          testId="portfolio-digest-status"
        />
      </div>
      <div className={styles.digestGrid}>
        <article className={styles.digestCard}>
          <h4>변화 알림</h4>
          {alerts.length > 0 ? (
            <div className={styles.digestList}>
              {alerts.slice(0, 4).map((alert) => (
                <div className={styles.digestItem} data-severity={alert.severity} key={alert.id}>
                  <span>{severityLabel(alert.severity)}</span>
                  <div>
                    <b>{alert.title}</b>
                    <p>{alert.summary}</p>
                    {alert.entityKey ? <small>{alert.entityKey}</small> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState className={styles.empty}>{alertsEmptyCopy.text}</EmptyState>
          )}
        </article>
        <article className={styles.digestCard}>
          <h4>포트폴리오 노출</h4>
          {exposures.length > 0 ? (
            <div className={styles.exposureList}>
              {exposures.slice(0, 6).map((exposure) => (
                <div className={styles.exposureRow} key={exposure.id}>
                  <div>
                    <b>{exposure.label}</b>
                    <small>
                      {riskLabel(exposure.riskLevel)} · {exposure.summary}
                    </small>
                  </div>
                  <span>{Math.round(exposure.value)}%</span>
                  <div className={styles.exposureTrack} aria-hidden="true">
                    <i style={{ width: `${Math.max(2, Math.min(100, exposure.value))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState className={styles.empty}>{exposuresEmptyCopy.text}</EmptyState>
          )}
        </article>
        <article className={styles.digestCard}>
          <h4>데이터 신선도</h4>
          {freshness.length > 0 ? (
            <div className={styles.freshnessList}>
              {freshness.map((item) => (
                <div className={styles.freshnessItem} data-status={item.status} key={item.id}>
                  <b>{item.label}</b>
                  <span>{item.summary}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState className={styles.empty}>{freshnessEmptyCopy.text}</EmptyState>
          )}
          <p className={styles.digestFootnote}>
            {stats
              ? `알림 ${stats.alertCount}건 · 변화 이벤트 ${stats.changeEventCount}건 · 비주식 누수 ${stats.nonStockFilteredCount}건`
              : 'Digest 수집 대기 중'}
          </p>
        </article>
      </div>
    </section>
  );
}

function ManualPortfolioList({
  actionLabel,
  disabled,
  emptyText,
  items,
  onAction,
}: Readonly<{
  actionLabel: string;
  disabled: boolean;
  emptyText: string;
  items: Array<{ entityKey: string; label: string; meta: string }>;
  onAction: (entityKey: string) => Promise<boolean>;
}>) {
  if (items.length === 0) return <EmptyState className={styles.empty}>{emptyText}</EmptyState>;

  return (
    <div className={styles.manualList}>
      {items.map((item) => (
        <div className={styles.manualListItem} key={item.entityKey}>
          <div>
            <b>{item.label}</b>
            <span>{item.meta}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => void onAction(item.entityKey)}
          >
            {actionLabel}
          </Button>
        </div>
      ))}
    </div>
  );
}

function SettingsView() {
  return (
    <section className={styles.view} aria-label="설정">
      <SectionHead title="설정" description="초기 MVP의 보안·표현 정책을 명확히 보여줍니다." />
      <div className={styles.grid}>
        <article className={styles.card} data-reveal>
          <h3>키 저장 정책</h3>
          <p>
            증권사 app key/secret 원문을 서버에 저장하지 않고, 조회 요약 데이터 중심으로 분석합니다.
          </p>
        </article>
        <article className={styles.card} data-reveal>
          <h3>표현 정책</h3>
          <p>
            관심 있게 볼 만한 종목, 확인할 리스크, 매수 당시 조건 복기처럼 정보 제공 표현만
            사용합니다.
          </p>
        </article>
        <article className={styles.card} data-reveal>
          <h3>발행 방식</h3>
          <p>배치 분석 내용을 검증 후 피드로 발행하는 구조를 전제로 합니다.</p>
        </article>
      </div>
    </section>
  );
}

function SectionHead({ description, title }: Readonly<{ description: string; title: string }>) {
  return (
    <div className={styles.head} data-reveal>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className={styles.headMeta}>조회 전용</span>
    </div>
  );
}

function StatusQualityStack({
  availability,
  label,
  qualityId,
  qualityPlacement = 'below',
  source,
  testId,
}: Readonly<{
  availability: DataAvailability;
  label: string;
  qualityId?: string;
  qualityPlacement?: 'above' | 'below';
  source: ResponseMeta['source'];
  testId: string;
}>) {
  return (
    <div className={styles.statusQualityStack}>
      <StatusBadge
        availability={availability}
        className={styles.headMeta}
        label={label}
        source={source}
        testId={testId}
      />
      <DataQualityPopover
        availability={availability}
        label={label}
        placement={qualityPlacement}
        source={source}
        testId={buildQualityTestId(qualityId ?? label)}
      />
    </div>
  );
}
