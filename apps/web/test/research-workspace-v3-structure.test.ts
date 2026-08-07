import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  'utf8',
);
const viewBoundarySource = readFileSync(
  new URL('../src/pages/research-workspace/ui/workspace-view-boundary.tsx', import.meta.url),
  'utf8',
);
const workspaceShell = [
  readFileSync(
    new URL('../src/widgets/workspace-shell/ui/workspace-navigation.tsx', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/widgets/workspace-shell/ui/workspace-topbar.tsx', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/widgets/workspace-shell/ui/workspace-shell.tsx', import.meta.url),
    'utf8',
  ),
].join('\n');
const workspace = [
  pageSource,
  readFileSync(
    new URL('../src/pages/research-workspace/ui/workspace-presenters.ts', import.meta.url),
    'utf8',
  ),
  workspaceShell,
  readFileSync(
    new URL('../src/pages/research-workspace/ui/evidence-inspector.tsx', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/pages/research-workspace/ui/detail-inspector-frame.tsx', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/pages/research-workspace/ui/workspace-search.tsx', import.meta.url),
    'utf8',
  ),
  viewBoundarySource,
  readFileSync(
    new URL('../src/pages/research-workspace/ui/relation-sigma-graph.tsx', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/pages/research-workspace/ui/stock-briefing-inspector.tsx', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/pages/research-workspace/ui/stock-briefing-sections.tsx', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/pages/research-workspace/ui/market-connection-sections.tsx', import.meta.url),
    'utf8',
  ),
  ...[
    'today-view.tsx',
    'market-connections-view.tsx',
    'stocks-view.tsx',
    'themes-view.tsx',
    'my-research-view.tsx',
    'history-view.tsx',
    'status-view.tsx',
  ].map((fileName) =>
    readFileSync(
      new URL(`../src/pages/research-workspace/ui/views/${fileName}`, import.meta.url),
      'utf8',
    ),
  ),
].join('\n');
const page = workspace;
const css = readFileSync(
  new URL('../src/pages/research-workspace/ui/research-workspace-page.module.css', import.meta.url),
  'utf8',
);
const relationCss = readFileSync(
  new URL('../src/pages/research-workspace/ui/relation-detail.module.css', import.meta.url),
  'utf8',
);
const feedCss = readFileSync(
  new URL('../src/pages/research-workspace/ui/feed-ledger.module.css', import.meta.url),
  'utf8',
);
const workspaceStyles = [
  css,
  relationCss,
  feedCss,
  readFileSync(
    new URL('../src/pages/research-workspace/ui/market-overview.module.css', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/pages/research-workspace/ui/personalization.module.css', import.meta.url),
    'utf8',
  ),
  readFileSync(
    new URL('../src/widgets/workspace-shell/ui/workspace-shell.module.css', import.meta.url),
    'utf8',
  ),
].join('\n');
const workspaceState = readFileSync(
  new URL('../src/shared/ui/workspace/workspace-state.tsx', import.meta.url),
  'utf8',
);
const marketOverviewSource = readFileSync(
  new URL('../src/pages/research-workspace/ui/market-overview-panel.tsx', import.meta.url),
  'utf8',
);
const geoMarketMapSource = readFileSync(
  new URL('../src/pages/research-workspace/ui/geo-market-map.tsx', import.meta.url),
  'utf8',
);
const historySource = readFileSync(
  new URL('../src/pages/research-workspace/ui/views/history-view.tsx', import.meta.url),
  'utf8',
);
const statusSource = readFileSync(
  new URL('../src/pages/research-workspace/ui/views/status-view.tsx', import.meta.url),
  'utf8',
);
const availabilityNotice = readFileSync(
  new URL('../src/shared/ui/workspace/availability-notice.tsx', import.meta.url),
  'utf8',
);
const workspaceCss = readFileSync(
  new URL('../src/shared/ui/workspace/workspace.module.css', import.meta.url),
  'utf8',
);
const authRoute = readFileSync(
  new URL('../src/routes/_authenticated.tsx', import.meta.url),
  'utf8',
);
const workspaceRoute = readFileSync(
  new URL('../src/pages/research-workspace/ui/workspace-view-route.tsx', import.meta.url),
  'utf8',
);
// The tab split moved shared route config into the layout, and per-tab config
// into each view route; assert each contract where it actually lives.
const workspaceLayout = readFileSync(
  new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url),
  'utf8',
);
const todayRoute = readFileSync(
  new URL('../src/routes/_authenticated/workspace/today.tsx', import.meta.url),
  'utf8',
);
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

describe('v3 research workspace structure', () => {
  it('exposes every real-data workspace section and the run-bound inspector', () => {
    for (const label of [
      '오늘',
      '내 종목에 영향을 줄 시장 변화',
      '종목',
      '테마·관계',
      '내 리서치',
      '판단 이력',
      '데이터 상태',
    ]) {
      assert.match(workspace, new RegExp(label.replace('·', '\\·')));
    }
    assert.match(workspace, /researchRecord\(recordKey\)/);
    assert.match(workspace, /evidence\.map/);
    assert.match(workspace, /sources\.map/);
    assert.match(workspace, /limitations\.map/);
  });

  it('binds view, lane, record, and cursor to a pathless authenticated route', () => {
    assert.match(authRoute, /createFileRoute\('\/_authenticated'\)/);
    assert.match(authRoute, /getCurrentSession/);
    assert.match(authRoute, /throw redirect/);
    // Search validation moved to the workspace LAYOUT route; the per-tab routes
    // inherit it, so the contract is asserted where it now lives.
    assert.match(workspaceLayout, /validateSearch: validateWorkspaceSearch/);
    assert.match(workspaceRoute, /onUrlStateChange/);
    assert.match(page, /researchFeed\(\{ lane, cursor, limit: 20 \}\)/);
    assert.match(page, /timeZone:\s*'Asia\/Seoul'/);
    assert.match(todayRoute, /pendingMs:\s*Number\.POSITIVE_INFINITY/);
    assert.doesNotMatch(workspaceRoute, /pendingComponent:\s*WorkspaceRoutePending/);
    assert.match(workspaceLayout, /errorComponent:\s*WorkspaceRouteError/);
    assert.match(workspaceLayout, /workspace-route-error/);
    assert.match(page, /workspace-view-load-error/);
    assert.match(workspaceLayout, /window\.location\.reload\(\)/);
  });

  it('keeps stable workspace navigation and view-region contracts', () => {
    assert.match(page, /<WorkspaceShell/);
    assert.match(workspace, /function WorkspaceNavigation/);
    assert.match(workspace, /function WorkspaceTopbar/);
    assert.match(page, /data-testid="workspace-content"/);
    assert.match(page, /data-testid=\{`workspace-nav-\$\{item\.id\}`\}/);
    assert.match(page, /<SideList[\s\S]*?value=\{activeSection\}/);
    assert.match(page, /navigationSequence=\{navigationIntent\.sequence\}/);
    assert.match(page, /viewKey=\{section\}/);
    assert.doesNotMatch(page, /const sections:\s*Array/);
  });

  it('loads route-specific workspace views behind one semantic suspense boundary', () => {
    assert.match(pageSource, /import \{[^}]*lazy[^}]*Suspense[^}]*\} from 'react'/s);
    for (const view of [
      'crypto-workspace-view',
      'history-view',
      'my-research-view',
      'market-connections-view',
      'status-view',
      'stocks-view',
      'themes-view',
      'today-view',
    ]) {
      assert.match(pageSource, new RegExp(`import\\('\\./views/${view}'\\)`));
    }
    assert.doesNotMatch(
      pageSource,
      /import \{ (?:Today|Radar|Stocks|Themes|History|Status)View \} from/,
    );
    assert.match(pageSource, /<Suspense fallback=\{<WorkspaceViewLoading \/>\}>/);
    assert.match(pageSource, /function WorkspaceViewLoading\(\)[\s\S]*kind="loading"/);
    assert.match(pageSource, /delayMs=\{0\}/);
  });

  it('loads the workspace API client only when an interaction needs it', () => {
    assert.doesNotMatch(
      pageSource,
      /import \{ createApiClient \} from '@stock-insight\/api-client'/,
    );
    assert.match(pageSource, /import\('@stock-insight\/api-client'\)/);
    assert.match(
      pageSource,
      /const getWorkspaceApiClient = createRetryablePromiseCache\(createWorkspaceApiClient\)/,
    );
    assert.match(pageSource, /await getWorkspaceApiClient\(\)/);
  });

  it('keeps lazy load errors and retries inside the persistent view region', () => {
    assert.match(pageSource, /WorkspaceViewErrorBoundary/);
    assert.match(pageSource, /WorkspaceViewReady/);
    assert.match(pageSource, /resolvedViewKey=\{resolvedViewKey\}/);
    assert.match(pageSource, /key=\{`\$\{section\}:\$\{viewRetryKeys\[section\]\}`\}/);
    assert.match(pageSource, /retryWorkspaceView/);
    assert.match(viewBoundarySource, /화면 다시 불러오기/);
    assert.match(viewBoundarySource, /kind="error"/);
  });

  it('maps every machine-facing value to stable Korean workspace copy', () => {
    assert.match(page, /presentResearchSummary\(item\.(?:summary|thesis)\)/);
    assert.match(page, /placeholder:\s*'종목명·티커 검색'/);
    assert.doesNotMatch(page, /종목·테마·사건 검색/);
    for (const formatter of [
      'whySurfacedLabel',
      'signalTypeLabel',
      'analysisStatusLabel',
      'historyStatusLabel',
      'relationTypeLabel',
      'sourceBindingLabel',
      'datasetLabel',
    ]) {
      assert.match(page, new RegExp(`function ${formatter}\\(`));
    }
    for (const rawInterpolation of [
      /\{item\.whySurfaced\}/,
      /\{item\.signalType\}/,
      /\{stock\.analysisStatus\}/,
      /\{item\.status\}/,
      /\{edge\.relationType\}/,
      /\{source\.bindingState\}/,
      /\{dataset\.datasetName\}/,
      /\{dataset\.domain\}/,
      /\{item\.summary\}/,
      /\{item\.thesis\}/,
      /\{detail\.body\}/,
      /\{item\.claim\}/,
      /\{source\.attributionText\}/,
      /\{theme\.title\}/,
      /topEntityKeys\.join/,
    ]) {
      assert.doesNotMatch(page, rawInterpolation);
    }
  });

  it('gives empty, loading, error, and stale data distinct user-facing states', () => {
    assert.match(page, /unsupported:\s*'지원하지 않음'/);
    assert.match(page, /error:\s*'오류'/);
    assert.doesNotMatch(page, /unsupported:\s*'지원 준비 중'|error:\s*'확인 필요'/);
    assert.match(workspaceState, /function WorkspaceState\(/);
    assert.match(page, /kind="empty"/);
    assert.match(page, /kind="loading"/);
    assert.match(page, /kind="error"/);
    assert.match(availabilityNotice, /kind="stale"/);
    assert.match(workspaceState, /empty[\s\S]*error[\s\S]*stale[\s\S]*partial[\s\S]*unavailable/);
    assert.match(workspaceState, /const ownsAnnouncement = announcement === 'self'/);
    assert.match(
      workspaceState,
      /role=\{ownsAnnouncement \? \(kind === 'error' \? 'alert' : 'status'\) : undefined\}/,
    );
    assert.match(workspaceState, /aria-atomic=\{ownsAnnouncement \? 'true' : undefined\}/);
    assert.match(workspaceState, /aria-live=\{ownsAnnouncement \? liveMode\[kind\] : undefined\}/);
    assert.match(workspaceCss, /\.stateSurface\s*\{/);
    assert.match(workspaceCss, /\.stateSurface\[data-kind='stale'\]/);
    assert.doesNotMatch(css, /\.stateSurface\s*\{/);
  });

  it('blocks pre-hydration clicks and lets the desktop inspector switch presentation', () => {
    assert.match(page, /useSyncExternalStore\(/);
    assert.match(page, /const inspectorModalOpen = isMobileViewport && inspectorVisible/);
    assert.match(page, /modal=\{isMobileViewport\}/);
    assert.match(page, /<Dialog\s+modal\s/);
    assert.match(page, /<DialogContent[\s\S]*?portalled/);
    assert.match(
      page,
      /mobile\s*\?\s*'bottom-sheet'\s*:\s*desktopPresentation === 'modal'[\s\S]*?\?\s*'modal'[\s\S]*?:\s*'inspector'/,
    );
    assert.match(page, /\bshowOverlay\s/);
    assert.doesNotMatch(page, /useFocusTrap|aria-modal=/);
    assert.doesNotMatch(page, /inert=\{mobileNavHidden \|\| inspectorVisible/);
  });

  it('implements APG keyboard navigation for the feed lane tabs', () => {
    assert.match(workspace, /<Tabs[^>]*value=\{lane\}/);
    assert.match(workspace, /<MetricStrip/);
    assert.match(workspace, /<StructuredList/);
    assert.match(workspace, /<DataTable/);
    assert.match(workspace, /useWorkspaceAppendReveal/);
    assert.match(page, /activationMode="manual"/);
    assert.match(page, /<TabsTrigger/);
    assert.match(page, /id=\{`lane-tab-\$\{item\.lane\}`\}/);
    assert.match(page, /aria-controls="research-feed-panel"/);
    assert.match(page, /role="tabpanel"/);
    assert.match(page, /aria-labelledby=\{`lane-tab-\$\{lane\}`\}/);
  });

  it('adopts shared semantic Radar surfaces without animating mode content', () => {
    assert.match(marketOverviewSource, /<ToggleGroup/);
    assert.match(marketOverviewSource, /<DataTable/);
    assert.match(marketOverviewSource, /<StructuredList/);
    assert.match(geoMarketMapSource, /<PropertyList/);
    assert.match(geoMarketMapSource, /<DataTable/);
    assert.match(marketOverviewSource, /kind="partial"/);
    assert.match(marketOverviewSource, /kind="stale"/);
    assert.match(marketOverviewSource, /kind="error"/);
    assert.match(marketOverviewSource, /kind=\{displayState\.kind === 'missing'/);
    assert.doesNotMatch(marketOverviewSource, /<TabsContent/);
  });

  it('consumes Radar and History cursors without presenting partial lists as complete', () => {
    assert.match(page, /api\.radarSignals\(\{ cursor, limit: 30 \}\)/);
    assert.match(page, /api\.decisionHistory\(\{ cursor, limit: 30 \}\)/);
    assert.match(page, /data-testid="radar-load-more"/);
    assert.match(page, /data-testid="history-load-more"/);
    assert.match(page, /data\.items\.length\}건 표시 · 전체/);
    assert.match(historySource, /<Timeline ref=\{ledgerRef\}/);
    assert.match(historySource, /<li[\s\S]*?data-append-key=\{item\.historyId\}/);
    assert.doesNotMatch(historySource, /<Timeline[\s\S]*?<div\s+key=\{item\.historyId\}/);
  });

  it('keeps status counts separate from honest availability and limitation detail', () => {
    assert.match(statusSource, /<StatusSummary/);
    assert.match(statusSource, /label: '연결 출처'/);
    assert.match(statusSource, /label: '클릭 가능 출처'/);
    assert.match(statusSource, /<PropertyList[\s\S]*?aria-label="데이터 상태 세부 정보"/);
    assert.match(statusSource, /label: '전체 가용성'/);
    assert.match(statusSource, /label: '최신 확인 시각'/);
    assert.match(statusSource, /label: '제약'/);
    assert.match(statusSource, /<DataTable caption="데이터 영역별 상태"/);
    assert.doesNotMatch(statusSource, /StatusSummary[\s\S]*?label: '전체 상태'/);
  });

  it('keeps the relation graph bounded, accessible, and text-readable', () => {
    assert.match(page, /data-testid="relation-graph"/);
    assert.match(page, /className=\{styles\.sigmaCanvas\}/);
    assert.match(page, /aria-label=\{`\$\{relationRootLabel\(source\)\} 관계 지도`\}/);
    assert.match(page, /data-root-entity=\{source\.rootEntityKey\}/);
    assert.match(page, /data-directed-edges=\{directedEdgeCount\}/);
    assert.match(page, /aria-describedby=\{descriptionId\}/);
    assert.doesNotMatch(page, /<title id="relation-graph-title"/);
    assert.match(page, /사람이 확인한 관계/);
    assert.match(page, /graph\?\.edges\.every\(isVerifiedRelationEdge\)/);
    assert.match(page, /state === 'loading' && !graph/);
    assert.match(page, /aria-busy=\{state === 'loading'\}/);
    assert.match(page, /edge\.direction === 'directed'/);
    assert.match(page, /와 방향 없는 관계/);
    assert.doesNotMatch(page, /approved=true · inferred=false/);
    assert.doesNotMatch(page, /분석 cutoff|비추론 관계/);
    assert.match(page, /<Accordion type="single" defaultValue="relations">/);
    assert.match(page, /<AccordionTrigger[^>]*showArrow=\{false\}[^>]*>\s*관계를 텍스트로 보기/);
    assert.match(page, /<AccordionContent/);
    assert.match(page, /initial=\{\{ height: 0 \}\}/);
    assert.match(page, /animate=\{\{ height: 'auto' \}\}/);
    assert.match(page, /exit=\{\{ height: 0 \}\}/);
    assert.doesNotMatch(relationCss, /transition-transform|rotate-180/);
    assert.match(page, /graph\.evidenceSummary\.limitation/);
  });

  it('shows decision-time provenance instead of hiding snapshot clocks', () => {
    assert.match(page, /detail\.meta\.contentSnapshot\.analysisCutoffAt/);
    assert.match(page, /detail\.meta\.marketSnapshot\.marketDataAsOf/);
    assert.match(page, /detail\.meta\.contentSnapshot\.analysisRevision/);
    assert.match(page, /source\.publishedAt/);
  });

  it('keeps theme selection and relation evidence connected without fixing layout mechanics', () => {
    assert.match(page, /styles\.themeLedger/);
    assert.match(page, /styles\.relationPanel/);
    assert.match(page, /themeTitleLabel\(theme\.title\)/);
    assert.match(page, /className=\{styles\.themeSelect\}/);
    assert.match(page, /<StructuredList[\s\S]*?className=\{styles\.themeLedger\}/);
    assert.match(page, /aria-pressed=\{isActive\}/);
    assert.match(page, /motion="none"/);
    assert.match(page, /<StructuredList[\s\S]*?className=\{styles\.edgeList\}/);
    assert.match(page, /onSelectEntity\(entityKey\)/);
    const relationPanel = relationCss.match(/\.relationPanel\s*\{[^}]*\}/)?.[0] ?? '';
    assert.match(relationPanel, /overflow-y:\s*auto/);
    assert.match(relationPanel, /overscroll-behavior:\s*contain/);
    assert.match(relationPanel, /scrollbar-gutter:\s*stable/);
  });

  it('uses shared selected-row, detail, property, and evidence-list anatomy', () => {
    assert.match(workspace, /className=\{styles\.stockRow\}/);
    assert.match(workspace, /aria-current=\{selected \? 'true' : undefined\}/);
    assert.match(workspace, /aria-label=\{`\$\{stock\.displayName\} 종목 브리핑 열기`\}/);
    assert.match(workspace, /<DetailSurface/);
    assert.match(workspace, /<PropertyList/);
    assert.match(workspace, /useWorkspaceRelationCrossfade/);
    assert.match(workspace, /관계를 텍스트로 보기/);
    assert.match(workspace, /aria-label="검증 근거 목록"/);
    assert.match(workspace, /aria-label="출처 목록"/);
  });

  it('consumes the stable semantic interface without banning profile styling choices', () => {
    for (const token of [
      '--color-canvas',
      '--color-surface',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-border',
      '--color-accent',
    ]) {
      assert.ok(workspaceStyles.includes(`var(${token})`), `workspace CSS must consume ${token}`);
    }
    assert.doesNotMatch(workspaceStyles, /--canvas:/);
  });

  it('keeps hover effects pointer-safe', () => {
    assert.match(workspaceStyles, /@media \(hover: hover\) and \(pointer: fine\)/);
  });

  it('uses one inset full-border selected surface for every Today evidence entry', () => {
    assert.match(
      page,
      /className=\{styles\.connectionRow\}[\s\S]*?aria-current=\{selectedRecordKey === item\.recordKey\}/,
    );
    assert.match(
      feedCss,
      /\.headlineCard\[data-slot='button-control'\]\[aria-current='true'\],\s*\.feedRow\[data-slot='button-control'\]\[aria-current='true'\],\s*\.connectionRow\[data-slot='button-control'\]\[aria-current='true'\]\s*\{[\s\S]*?border-color:[\s\S]*?background:[\s\S]*?box-shadow:/,
    );
    assert.match(
      feedCss,
      /\.curatedList,\s*\.feedList,\s*\.connectionList\s*\{[\s\S]*?padding:\s*4px/,
    );
    assert.match(
      feedCss,
      /\.curatedList\s*>\s*li,\s*\.feedList\s*>\s*li,\s*\.connectionList\s*>\s*li\s*\{\s*border-bottom:\s*0/,
    );
    assert.doesNotMatch(feedCss, /box-shadow:\s*0\s+3px\s+0\s+var\(--color-accent\)\s+inset/);
    assert.doesNotMatch(feedCss, /box-shadow:\s*3px\s+0\s+0\s+var\(--color-accent\)\s+inset/);
  });

  it('provides a reduced-motion safety fallback independent of layout recipe', () => {
    assert.match(workspaceStyles, /prefers-reduced-motion:\s*reduce/);
    assert.match(workspaceStyles, /animation-iteration-count: 1 !important/);
  });

  it('applies clickjacking, MIME, referrer, permissions, and CSP headers globally', () => {
    assert.match(viteConfig, /'\/\*\*': \{ headers: securityHeaders \}/);
    for (const header of [
      'Content-Security-Policy',
      'Permissions-Policy',
      'Referrer-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
    ]) {
      assert.match(viteConfig, new RegExp(header));
    }
    assert.match(viteConfig, /frame-ancestors 'none'/);
  });
});
