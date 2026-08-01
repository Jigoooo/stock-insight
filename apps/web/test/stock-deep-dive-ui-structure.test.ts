import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const panelUrl = new URL(
  '../src/pages/research-workspace/ui/stock-deep-dive-panel.tsx',
  import.meta.url,
);
const stocksUrl = new URL(
  '../src/pages/research-workspace/ui/views/stocks-view.tsx',
  import.meta.url,
);
const modelUrl = new URL(
  '../src/pages/research-workspace/model/stock-deep-dive.ts',
  import.meta.url,
);
const panelStylesUrl = new URL(
  '../src/pages/research-workspace/ui/stock-deep-dive-panel.module.css',
  import.meta.url,
);

describe('P3-WB Deep Dive UI structure', () => {
  it('renders all twelve canonical sections with the official height-only accordion', async () => {
    const source = await readFile(panelUrl, 'utf8');
    assert.match(source, /DEEP_DIVE_SECTION_IDS/);
    assert.match(source, /<Accordion[^>]*type="multiple"/);
    assert.match(source, /<AccordionItem/);
    assert.match(source, /<AccordionTrigger[^>]*showArrow=\{false\}/);
    assert.match(source, /<AccordionContent/);
    assert.match(source, /initial=\{\{ height: 0 \}\}/);
    assert.match(source, /animate=\{\{ height: 'auto' \}\}/);
    assert.match(source, /exit=\{\{ height: 0 \}\}/);
    assert.doesNotMatch(source, /opacity:|\by:|scale:/);
    assert.doesNotMatch(source, /transition-transform|rotate-180/);
    assert.match(source, /data-deep-dive-section=\{section\.id\}/);
    assert.doesNotMatch(source, /section\.id === 'performance'/);
  });

  it('renders the Sigma relation graph inside the direct-relations section', async () => {
    const source = await readFile(panelUrl, 'utf8');
    assert.match(source, /RelationSigmaGraph/);
    assert.match(source, /section\.id === 'direct_relations'/);
    assert.match(source, /section\.availability !== 'missing'/);
    assert.match(source, /relation\.edges\.length > 0/);
    assert.match(source, /onSelectEntity=\{onSelectEntity\}/);
  });

  it('exposes loading, error and retry states without replacing the stock list', async () => {
    const source = await readFile(panelUrl, 'utf8');
    assert.match(source, /state === 'loading'/);
    assert.match(source, /state === 'error'/);
    assert.match(source, /onRetry/);
    assert.match(source, /aria-busy/);
  });

  it('makes stock rows keyboard-selectable and loads detail+depth-2 relations together', async () => {
    const source = await readFile(stocksUrl, 'utf8');
    const modelSource = await readFile(modelUrl, 'utf8');
    assert.match(source, /api\.stockDetail\(key\)/);
    assert.match(source, /api\.entityRelations\(key, 2\)/);
    assert.match(modelSource, /Promise\.all/);
    assert.match(modelSource, /Entity relations failed with 404/);
    assert.match(source, /selectionMode="single"/);
    assert.match(source, /selectedKeys=\{selectedStockKey \? \[selectedStockKey\] : \[\]\}/);
    assert.match(source, /<TableRow/);
    assert.match(source, /selectionLabel=\{`\$\{stock\.displayName\} 종목 선택`\}/);
    assert.match(source, /<DataTable/);
    assert.match(source, /containerProps=\{\{/);
    assert.match(source, /'aria-label': '종목 커버리지 표 가로 스크롤 영역'/);
    assert.match(source, /tabIndex: 0/);
    assert.match(source, /StockDeepDivePanel/);
  });

  it('uses sequence gating so a slow prior request cannot overwrite a newer selection', async () => {
    const source = await readFile(stocksUrl, 'utf8');
    assert.match(source, /createLatestRequestGate/);
    assert.match(source, /requestGateRef\.current\.invalidate\(\)/);
    assert.match(source, /requestGateRef\.current\.isCurrent\(sequence\)/);
  });

  it('keeps DOM, visual and keyboard order aligned at both responsive layouts', async () => {
    const stocksSource = await readFile(stocksUrl, 'utf8');
    const panelStyles = await readFile(panelStylesUrl, 'utf8');
    assert.doesNotMatch(stocksSource, /useCompactWorkspaceLayout/);
    assert.doesNotMatch(stocksSource, /compactLayout \? detailRegion/);
    assert.match(stocksSource, /tabIndex=\{-1\}/);
    assert.match(stocksSource, /deepDiveRegionRef\.current\?\.focus/);
    assert.match(stocksSource, /scrollIntoView/);
    assert.match(stocksSource, /prefers-reduced-motion: reduce/);
    assert.match(stocksSource, /caption="종목 커버리지"/);
    assert.match(panelStyles, /grid-template-areas:\s*'table detail'/);
    assert.match(panelStyles, /grid-template-areas:\s*'table'\s*'detail'/);
    assert.doesNotMatch(panelStyles, /\.deepDiveRegion\s*\{[^}]*order:\s*-1/);
    assert.match(panelStyles, /\.deepDiveRegion\s*\{[^}]*scroll-margin-top:\s*84px/);
    assert.match(
      panelStyles,
      /@media \(max-width: 420px\)[\s\S]*?\.deepDiveRegion\s*\{[^}]*scroll-margin-top:\s*124px/,
    );
    assert.match(panelStyles, /\.deepDiveRegion\[data-state='idle'\]/);
    assert.match(panelStyles, /\.deepDiveRegion:focus-visible\s*\{[^}]*box-shadow:[^}]*inset/);
    assert.match(panelStyles, /position:\s*sticky/);
    assert.match(panelStyles, /scrollbar-gutter:\s*stable/);
    assert.match(panelStyles, /any-pointer:\s*coarse/);
    assert.match(panelStyles, /\.retryButton\s*\{[^}]*min-height:\s*44px/);
    assert.doesNotMatch(panelStyles, /\.stockTable thead\s*\{[^}]*clip:/);
    assert.match(panelStyles, /\.stockTable\s*\{[^}]*min-width:/);
  });

  it('uses shared detail and property surfaces for the selected stock', async () => {
    const source = await readFile(panelUrl, 'utf8');
    assert.match(source, /<DetailSurface/);
    assert.match(source, /<PropertyList/);
  });
});
