import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const page = readFileSync(
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(
  new URL('../src/pages/research-workspace/ui/research-workspace-page.module.css', import.meta.url),
  'utf8',
);
const authRoute = readFileSync(
  new URL('../src/routes/_authenticated.tsx', import.meta.url),
  'utf8',
);
const workspaceRoute = readFileSync(
  new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url),
  'utf8',
);
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

describe('v3 research workspace structure', () => {
  it('exposes every real-data workspace section and the run-bound inspector', () => {
    for (const label of [
      '오늘',
      '세계 레이더',
      '종목',
      '테마·관계',
      '내 리서치',
      '판단 이력',
      '데이터 상태',
    ]) {
      assert.match(page, new RegExp(label.replace('·', '\\·')));
    }
    assert.match(page, /researchRecord\(recordKey\)/);
    assert.match(page, /evidence\.map/);
    assert.match(page, /sources\.map/);
    assert.match(page, /limitations\.map/);
  });

  it('binds view, lane, record, and cursor to a pathless authenticated route', () => {
    assert.match(authRoute, /createFileRoute\('\/_authenticated'\)/);
    assert.match(authRoute, /getCurrentSession/);
    assert.match(authRoute, /throw redirect/);
    assert.match(workspaceRoute, /validateSearch: validateWorkspaceSearch/);
    assert.match(workspaceRoute, /onUrlStateChange/);
    assert.match(page, /researchFeed\(\{ lane, cursor, limit: 20 \}\)/);
    assert.match(page, /timeZone:\s*'Asia\/Seoul'/);
    assert.match(workspaceRoute, /pendingComponent:\s*WorkspaceRoutePending/);
    assert.match(workspaceRoute, /errorComponent:\s*WorkspaceRouteError/);
    assert.match(workspaceRoute, /workspace-route-error/);
    assert.match(workspaceRoute, /window\.location\.reload\(\)/);
  });

  it('maps every machine-facing value to stable Korean workspace copy', () => {
    assert.match(page, /presentResearchSummary\(item\.(?:summary|thesis)\)/);
    assert.match(page, /placeholder="종목명·티커 검색"/);
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
    assert.match(page, /function WorkspaceState\(/);
    assert.match(page, /kind="empty"/);
    assert.match(page, /kind="loading"/);
    assert.match(page, /kind="error"/);
    assert.match(page, /kind="stale"/);
    assert.match(page, /role=\{kind === 'error' \? 'alert' : 'status'\}/);
    assert.match(css, /\.stateSurface\s*\{/);
    assert.match(css, /\.stateSurface\[data-kind='stale'\]/);
  });

  it('blocks pre-hydration clicks and keeps the inspector modal only on mobile', () => {
    assert.match(page, /useSyncExternalStore\(/);
    assert.match(page, /const inspectorModalOpen = isMobileViewport && inspectorVisible/);
    assert.match(page, /useFocusTrap\(modal, inspectorRef, onClose\)/);
    assert.match(page, /aria-modal=\{modal \|\| undefined\}/);
    assert.doesNotMatch(page, /inert=\{mobileNavHidden \|\| inspectorVisible/);
  });

  it('implements APG keyboard navigation for the feed lane tabs', () => {
    assert.match(page, /tabIndex=\{lane === item\.lane \? 0 : -1\}/);
    assert.match(page, /event\.key === 'ArrowRight'/);
    assert.match(page, /event\.key === 'ArrowLeft'/);
    assert.match(page, /event\.key === 'Home'/);
    assert.match(page, /event\.key === 'End'/);
    assert.match(page, /role="tabpanel"/);
    assert.match(page, /aria-labelledby=\{`lane-tab-\$\{lane\}`\}/);
  });

  it('consumes Radar and History cursors without presenting partial lists as complete', () => {
    assert.match(page, /api\.radarSignals\(\{ cursor, limit: 30 \}\)/);
    assert.match(page, /api\.decisionHistory\(\{ cursor, limit: 30 \}\)/);
    assert.match(page, /data-testid="radar-load-more"/);
    assert.match(page, /data-testid="history-load-more"/);
    assert.match(page, /data\.items\.length\}건 표시 · 전체/);
  });

  it('keeps the relation graph bounded, accessible, and text-readable', () => {
    assert.match(page, /viewBox="0 0 560 300"/);
    assert.match(
      page,
      /aria-label=\{`\$\{relationNodeLabel\(graph, graph\.rootEntityKey\)\} 관계 지도`\}/,
    );
    assert.match(page, /aria-describedby="relation-graph-desc"/);
    assert.doesNotMatch(page, /<title id="relation-graph-title"/);
    assert.match(page, /사람이 확인한 관계/);
    assert.doesNotMatch(page, /approved=true · inferred=false/);
    assert.doesNotMatch(page, /분석 cutoff|비추론 관계/);
    assert.match(page, /<details open className=\{styles\.relationFallback\}>/);
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
    assert.match(page, /onSelectEntity\(entityKey\)/);
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
      assert.ok(css.includes(`var(${token})`), `workspace CSS must consume ${token}`);
    }
    assert.doesNotMatch(css, /--canvas:/);
  });

  it('keeps hover effects pointer-safe', () => {
    assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  });

  it('provides a reduced-motion safety fallback independent of layout recipe', () => {
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /animation-iteration-count: 1 !important/);
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
