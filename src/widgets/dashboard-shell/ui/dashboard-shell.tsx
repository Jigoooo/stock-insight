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
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import styles from './dashboard-shell.module.css';

import type { Insight } from '@/entities/insight';
import type { PortfolioSnapshot } from '@/entities/portfolio';
import { StockDetail, type Stock } from '@/entities/stock';
import type { ThemeNode } from '@/entities/theme';
import { dashboardSections, type DashboardSectionId } from '@/features/dashboard-navigation';
import { filterStocks } from '@/features/stock-search';
import { useDashboardReveal } from '@/shared/motion/use-dashboard-reveal';
import { chartPalette, themeShareColors } from '@/shared/theme/tokens';
import { ChartFrame, ChartLegend, ChartTooltipContent, type ChartConfig } from '@/shared/ui/chart';
import { EChart } from '@/shared/ui/echarts';
import { ScrollArea } from '@/shared/ui/scroll';
import { createThemeFlowOption } from '@/widgets/dashboard-shell/model/chart-options';

type DashboardShellProps = {
  insights: Insight[];
  portfolio: PortfolioSnapshot;
  stocks: Stock[];
  themes: ThemeNode[];
};

const insightIcons: Record<Insight['icon'], LucideIcon> = {
  bolt: Bolt,
  cpu: Cpu,
  newspaper: Newspaper,
  'triangle-alert': TriangleAlert,
};

export function DashboardShell({ insights, portfolio, stocks, themes }: DashboardShellProps) {
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
      <section className={styles.shell} data-testid="dashboard-shell">
        <h1 className={styles.srOnly}>Futur Insight</h1>
        <div className={styles.app}>
          <aside className={styles.sidebar} aria-label="데스크톱 내비게이션">
            <Brand />
            <Navigation activeSection={activeSection} onSelect={setActiveSection} />
            <SecurityNote />
          </aside>

          <section className={styles.main}>
            <div className={styles.top}>
              <label className={styles.search}>
                <Search aria-hidden="true" />
                <input
                  aria-label="종목·티커·테마 전체 검색"
                  placeholder="종목·티커·테마 검색 후 Enter"
                  onKeyDown={handleGlobalSearchKeyDown}
                />
              </label>
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
                {activeSection === 'news' ? <NewsView insights={insights} /> : null}
                {activeSection === 'stocks' ? (
                  <StocksView
                    filteredStocks={filteredStocks}
                    query={query}
                    selectedStock={selectedStock}
                    selectedStockId={selectedStockId}
                    onQueryChange={setQuery}
                    onSelectStock={setSelectedStockId}
                  />
                ) : null}
                {activeSection === 'theme' ? <ThemeView themes={themes} /> : null}
                {activeSection === 'portfolio' ? <PortfolioView portfolio={portfolio} /> : null}
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
            <button className={styles.primaryButton} type="button" onClick={onShowStocks}>
              종목 분석 보기
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onShowNews}>
              뉴스 보기
            </button>
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

function NewsView({ insights }: Readonly<{ insights: Insight[] }>) {
  return (
    <section className={styles.view} aria-label="뉴스">
      <SectionHead title="뉴스" description="종목과 연결된 뉴스 클러스터입니다." />
      <div className={styles.grid}>
        <article className={styles.card} data-reveal>
          <h3>전력 인프라</h3>
          <p>데이터센터 전력 수요와 변압기 업황을 연결합니다.</p>
        </article>
        <article className={styles.card} data-reveal>
          <h3>HBM 공급망</h3>
          <p>메모리 제조사와 후공정 장비 기업을 같이 봅니다.</p>
        </article>
        <article className={styles.card} data-reveal>
          <h3>발행된 코멘트</h3>
          <InsightFeed insights={insights} />
        </article>
      </div>
    </section>
  );
}

function StocksView({
  filteredStocks,
  query,
  selectedStock,
  selectedStockId,
  onQueryChange,
  onSelectStock,
}: Readonly<{
  filteredStocks: Stock[];
  query: string;
  selectedStock: Stock | undefined;
  selectedStockId: string;
  onQueryChange: (query: string) => void;
  onSelectStock: (stockId: string) => void;
}>) {
  return (
    <section className={styles.view} aria-label="종목 분석">
      <div className={styles.head} data-reveal>
        <div>
          <h2>종목 분석</h2>
          <p>
            보유종목과 관심 후보를 같은 리서치 기준으로 비교합니다. 상세 영역은 독립 스크롤됩니다.
          </p>
        </div>
        <span className={styles.headMeta}>공통 리서치 기준</span>
      </div>

      <div className={styles.stockLayout}>
        <section className={styles.stockPanel}>
          <label className={`${styles.search} ${styles.stockSearch}`}>
            <Search aria-hidden="true" />
            <input
              aria-label="종목 검색"
              data-testid="stock-search"
              placeholder="삼성전자, HBM, 전력기기, NAVER"
              value={query}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </label>

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
                <div className={styles.empty}>
                  검색 결과가 없습니다. 삼성전자, HBM, 전력기기, NAVER를 입력해보세요.
                </div>
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
              <div className={styles.empty}>선택 가능한 종목이 없습니다.</div>
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
        <ThemeFlowChart themes={themes} />
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

function ThemeFlowChart({ themes }: Readonly<{ themes: ThemeNode[] }>) {
  const option = useMemo(() => createThemeFlowOption(themes), [themes]);

  return (
    <EChart
      ariaLabel="AI에서 HBM, 전력 인프라, 냉각으로 이어지는 테마 흐름"
      className={styles.themeChart}
      minHeight={220}
      option={option}
      testId="theme-flow-chart"
    />
  );
}

function PortfolioView({ portfolio }: Readonly<{ portfolio: PortfolioSnapshot }>) {
  return (
    <section className={styles.view} aria-label="포트폴리오">
      <SectionHead
        title="포트폴리오"
        description="보유종목의 테마 집중도와 확인 일정을 요약합니다."
      />
      <div className={styles.metricStrip}>
        <Kpi label="총 평가" value={portfolio.value} icon={PieChart} />
        <Kpi label="오늘 변화" value={portfolio.dailyChange} icon={Bolt} />
        <Kpi label="관련 이슈" value={`${portfolio.relatedIssueCount}건`} icon={Newspaper} />
        <Kpi label="주의 신호" value={portfolio.cautionLevel} icon={TriangleAlert} />
      </div>
      <PortfolioThemeShareChart portfolio={portfolio} />
    </section>
  );
}

function PortfolioThemeShareChart({ portfolio }: Readonly<{ portfolio: PortfolioSnapshot }>) {
  const legendConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        portfolio.themeShare.map((item) => [
          item.id,
          {
            label: `${item.label} ${item.value}%`,
            color: themeShareColors[item.colorRole],
          },
        ]),
      ),
    [portfolio.themeShare],
  );
  const tooltipConfig = useMemo<ChartConfig>(
    () => ({
      value: {
        label: '비중',
        color: themeShareColors.semiconductor,
      },
    }),
    [],
  );

  return (
    <ChartFrame
      title="테마 비중"
      description="보유종목을 테마 관점으로 묶은 목업 요약입니다."
      testId="portfolio-theme-share-chart"
    >
      <div className={styles.themeShareChart}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={portfolio.themeShare}
            layout="vertical"
            margin={{ top: 2, right: 10, bottom: 2, left: 8 }}
          >
            <XAxis type="number" hide domain={[0, 50]} />
            <YAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              tick={{ fill: chartPalette.axis, fontSize: 11 }}
              type="category"
              width={82}
            />
            <Tooltip
              cursor={{ fill: chartPalette.surface }}
              content={<ChartTooltipContent config={tooltipConfig} />}
            />
            <Bar dataKey="value" isAnimationActive={false} radius={[0, 3, 3, 0]}>
              {portfolio.themeShare.map((item) => (
                <Cell fill={themeShareColors[item.colorRole]} key={item.id} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend config={legendConfig} />
    </ChartFrame>
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
      <span className={styles.headMeta}>조회 전용 목업</span>
    </div>
  );
}
