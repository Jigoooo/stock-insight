import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const uiRoot = new URL('../src/pages/research-workspace/ui/', import.meta.url);
const read = (path: string) => readFile(new URL(path, uiRoot), 'utf8');

function extractCssBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} must exist`);
  const openIndex = source.indexOf('{', markerIndex);
  assert.notEqual(openIndex, -1, `${marker} must open a block`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }
  throw new Error(`${marker} block must close`);
}

describe('P3-WC market overview UI structure', () => {
  it('connects RadarView to the eight-mode market overview owner', async () => {
    const [radar, overview] = await Promise.all([
      read('views/radar-view.tsx'),
      read('market-overview-panel.tsx'),
    ]);
    assert.match(radar, /MarketOverviewPanel/);
    assert.match(radar, /<MarketOverviewPanel[\s\S]*data=\{data\}/);
    assert.match(radar, /marketConnectionLabel\(item\)/);
    assert.doesNotMatch(radar, /item\.watched\s*\?/);
    assert.match(overview, /MARKET_MODE_IDS/);
    assert.match(overview, /buildMarketOverview\(data\.items\)/);
  });

  it('uses a keyboard-addressable tablist and a single labelled tabpanel', async () => {
    const overview = await read('market-overview-panel.tsx');
    assert.match(overview, /role="tablist"/);
    assert.match(overview, /role="tab"/);
    assert.match(overview, /aria-selected=\{item\.id === activeMode\}/);
    assert.match(overview, /const panelId = 'market-mode-panel'/);
    assert.match(overview, /aria-controls=\{panelId\}/);
    assert.match(overview, /role="tabpanel"/);
    assert.match(overview, /id=\{panelId\}/);
    assert.match(overview, /aria-labelledby=\{`market-tab-/);
    assert.match(overview, /onKeyDown=\{handleModeKeyDown\}/);
  });

  it('renders direct data with semantic table and timeline structures', async () => {
    const [radar, overview] = await Promise.all([
      read('views/radar-view.tsx'),
      read('market-overview-panel.tsx'),
    ]);
    assert.match(overview, /<table className=\{styles\.marketHeatmap\}>/);
    assert.match(overview, /<caption className=\{styles\.srOnly\}>/);
    assert.match(overview, /<ol className=\{styles\.marketTimeline\}>/);
    assert.match(radar, /data-testid="radar-row"/);
    assert.match(overview, /data-testid="market-heatmap-row"/);
    assert.match(overview, /data-testid="market-timeline-row"/);
  });

  it('labels every production market-signal taxonomy without a generic collapse', async () => {
    const page = await read('research-workspace-page.tsx');
    const labels = page.match(
      /const signalTypeLabels: Record<string, string> = \{([\s\S]*?)\n\};/,
    )?.[1];
    assert.ok(labels, 'signalTypeLabels map must exist');
    for (const signalType of [
      'fundamental',
      'insider_trade',
      'analyst',
      'sec_8k',
      'price_mover',
      'sentiment',
      'short_volume',
      'segment',
      'market_news',
      'earnings_event',
      'attention_spike',
      'gdelt_theme',
      'policy_event',
      'major_holder',
      'policy_prob',
      'valuation',
      'growth',
      'sec_filing',
      'earnings_macro',
      'price_stress',
      'quake',
      'dart_disclosure',
      'macro_indicator',
      'financial_conditions',
      'volatility',
    ]) {
      assert.match(labels, new RegExp(`\\b${signalType}:`), `${signalType} label is required`);
    }
  });

  it('keeps unavailable modes explicit instead of fabricating visual data', async () => {
    const overview = await read('market-overview-panel.tsx');
    assert.match(overview, /describeMarketModeState\(mode\)/);
    assert.match(overview, /displayState\.kind !== 'content'/);
    assert.match(overview, /<WorkspaceState/);
    assert.match(overview, /description=\{displayState\.description\}/);
    assert.match(overview, /data-display-state=\{displayState\.kind\}/);
    assert.match(overview, /mode\.evidenceBasis !== 'unavailable'/);
    assert.match(overview, /data-testid="market-mode-footer"/);
    assert.doesNotMatch(overview, /mock|placeholderData|Math\.random|dummy/i);
  });

  it('provides 44px mode targets, stable overflow and non-border-led grouping', async () => {
    const css = await read('research-workspace-page.module.css');
    assert.match(extractCssBlock(css, '.marketModeNav'), /overflow:\s*hidden/);
    const tab = extractCssBlock(css, '.marketModeTab');
    assert.match(tab, /min-height:\s*44px/);
    assert.match(tab, /user-select:\s*none/);
    assert.match(extractCssBlock(css, '.marketModePanel'), /min-width:\s*0/);
    const emptyBody = extractCssBlock(css, ".marketModeBody[data-display-state='empty']");
    assert.match(emptyBody, /align-content:\s*center/);
    assert.match(extractCssBlock(css, '.marketModeCard'), /box-shadow:\s*inset/);
    const reducedMotion = extractCssBlock(css, '@media (prefers-reduced-motion: reduce)');
    const reducedStrength = extractCssBlock(reducedMotion, '.marketStrengthTrack > span');
    assert.match(reducedStrength, /animation:\s*none !important/);
    assert.match(reducedStrength, /transform:\s*none !important/);
    assert.match(reducedStrength, /opacity:\s*1 !important/);
  });
});
