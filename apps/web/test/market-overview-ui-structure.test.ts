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

describe('market secondary exploration UI structure', () => {
  it('owns one four-option local toggle with factor map as the default', async () => {
    const exploration = await read('market-exploration.tsx');
    assert.match(exploration, /useState<MarketExplorationId>\(MARKET_EXPLORATION_IDS\[0\]\)/);
    assert.match(exploration, /<ToggleGroup/);
    assert.match(exploration, /aria-label="시장 보조 탐색 선택"/);
    assert.match(exploration, /items=\{overview\.explorations\.map/);
    assert.doesNotMatch(exploration, /localStorage|sessionStorage/);
    assert.doesNotMatch(exploration, /event_radar|heatmap_matrix/);
  });

  it('renders heatmap rows inside the factor comparison table', async () => {
    const exploration = await read('market-exploration.tsx');
    assert.match(exploration, /mode\.id === 'factor_map'/);
    assert.match(exploration, /overview\.signalTypeGroups\.map/);
    assert.match(exploration, /caption="종목별 시장 신호 강도와 관심·보유 연결 상태"/);
    assert.match(exploration, /data-testid="market-heatmap-row"/);
    assert.match(exploration, /containerProps=\{\{ className: styles\.marketTableWrap \}\}/);
  });

  it('renders propagation, timeline and Geo snapshot from retained source data', async () => {
    const exploration = await read('market-exploration.tsx');
    assert.match(exploration, /overview\.propagationItems\.map/);
    assert.match(exploration, /data-testid="market-propagation-group"/);
    assert.match(exploration, /<StructuredList className=\{styles\.marketTimeline\}/);
    assert.match(exploration, /data-testid="market-timeline-row"/);
    assert.match(exploration, /<GeoMarketMap snapshot=\{geoSnapshot\}/);
  });

  it('announces each active component state, row count and as-of time', async () => {
    const exploration = await read('market-exploration.tsx');
    assert.match(exploration, /resolveMarketExplorationState/);
    assert.match(exploration, /data-testid="market-component-watermark"/);
    assert.match(exploration, /data-component-availability=\{componentState\.availability\}/);
    assert.match(exploration, /componentState\.watermarkAt/);
    assert.match(exploration, /componentState\.rowCount/);
    assert.match(exploration, /갱신 지연/);
    assert.match(exploration, /kind="partial"/);
    assert.match(exploration, /kind="error"/);
    assert.match(exploration, /kind="unavailable"/);
  });

  it('keeps aggregates, heatmap cells and map markers read-only', async () => {
    const [exploration, map] = await Promise.all([
      read('market-exploration.tsx'),
      read('geo-market-map.tsx'),
    ]);
    assert.match(exploration, /<article[\s\S]*?data-testid="market-factor-group"/);
    assert.match(exploration, /<tr key=\{item\.signalKey\} data-testid="market-heatmap-row">/);
    assert.doesNotMatch(map, /onSelectConnection|connectionKey/);
  });

  it('only selects a timeline source item with an exact page-model key', async () => {
    const exploration = await read('market-exploration.tsx');
    assert.match(exploration, /connectionsByKey\.get\(item\.signalKey\)/);
    assert.match(exploration, /connection \? \(/);
    assert.match(exploration, /onSelectConnection\(connection, event\.currentTarget\)/);
    assert.doesNotMatch(exploration, /connectionKey:\s*item\.signalKey/);
  });

  it('keeps stable overflow, 44px toggle targets and reduced motion', async () => {
    const css = await read('market-overview.module.css');
    assert.match(extractCssBlock(css, '.marketModeNav'), /overflow:\s*hidden/);
    const tab = extractCssBlock(css, ".marketModeNav [data-slot='toggle-group-item']");
    assert.match(tab, /min-height:\s*44px/);
    assert.match(extractCssBlock(css, '.marketModePanel'), /min-width:\s*0/);
    assert.match(extractCssBlock(css, '.marketTableWrap'), /overflow-x:\s*auto/);
    const reducedMotion = extractCssBlock(css, '@media (prefers-reduced-motion: reduce)');
    const reducedStrength = extractCssBlock(reducedMotion, '.marketStrengthTrack > span');
    assert.match(reducedStrength, /animation:\s*none !important/);
  });
});
