import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const uiRoot = new URL('../src/pages/research-workspace/ui/', import.meta.url);
const read = (path: string) => readFile(new URL(path, uiRoot), 'utf8');

describe('market connections workspace structure', () => {
  it('renders the market-change summary, priority cards, and remaining rows in reading order', async () => {
    const [view, sections] = await Promise.all([
      read('views/market-connections-view.tsx'),
      read('market-connection-sections.tsx'),
    ]);

    assert.match(view, /title="내 종목에 영향을 줄 시장 변화"/);
    assert.match(
      view,
      /<MarketConnectionSummary[\s\S]*?<PriorityMarketChanges[\s\S]*?<MarketChangeList/,
    );
    assert.match(sections, /오늘 감지한 변화/);
    assert.match(sections, /직접 연결/);
    assert.match(sections, /확인할 리스크/);
    assert.match(sections, /분석 기준/);
    assert.match(sections, /내 종목에 연결된 주요 변화/);
    assert.match(sections, /items\.slice\(0, 3\)/);
    assert.match(sections, /그 밖의 시장 변화/);
    assert.match(view, /<MarketExploration/);
    assert.match(view, /<PriorityMarketChanges[\s\S]*?<MarketChangeList[\s\S]*?<MarketExploration/);
  });

  it('shares exact keyed selection with exploration without changing the Radar page contract', async () => {
    const [page, view] = await Promise.all([
      read('research-workspace-page.tsx'),
      read('views/market-connections-view.tsx'),
    ]);

    assert.match(view, /geoSnapshot: GeoSnapshot/);
    assert.match(view, /data=\{radarPage\}/);
    assert.match(view, /geoSnapshot=\{geoSnapshot\}/);
    assert.match(view, /marketConnections=\{marketConnections\}/);
    assert.match(
      view,
      /onSelectConnection=\{\(item, opener\) => void loadConnection\(item, opener\)\}/,
    );
    assert.match(page, /geoSnapshot=\{data\.geoSnapshot\}/);
    assert.match(page, /radarPage=\{visibleRadarPage \?\? data\.radar\}/);
    assert.match(page, /pageState=\{visibleRadarPageState\}/);
    assert.match(page, /onLoadMore=\{\(\) => void loadMoreRadar\(\)\}/);
  });

  it('shares one opener-aware selection contract without exposing advice or raw strength', async () => {
    const sections = await read('market-connection-sections.tsx');

    assert.match(
      sections,
      /type MarketConnectionSelectionProps = \{[\s\S]*?selectedConnectionKey\?: string;[\s\S]*?onSelectConnection: \(item: MarketConnectionItem, opener: HTMLButtonElement\) => void;/,
    );
    assert.match(sections, /aria-current=\{selected \? 'true' : undefined\}/);
    assert.match(sections, /styles\.selected/);
    assert.match(sections, /event\.currentTarget/);
    assert.match(sections, /holding[\s\S]*?watched/);
    assert.doesNotMatch(sections, /rawStrength|매수|매도|목표가|손절가|내일 오를/);
  });

  it('keeps honest empty states, cursor controls, and unavailable summary values', async () => {
    const sections = await read('market-connection-sections.tsx');

    assert.match(sections, /aria-label="집계 데이터 없음"/);
    assert.match(sections, />—</);
    assert.match(sections, /priorityChanges?\S*\.length|items\.length/);
    assert.match(sections, /개인화된 주요 변화가 없습니다/);
    assert.match(sections, /kind="empty"/);
    assert.match(sections, /data-testid="radar-load-more"/);
    assert.match(sections, /pageState === 'error'/);
    assert.match(sections, /pageState === 'loading'/);
  });

  it('derives live data from the accumulated radar page while allowing preview overrides', async () => {
    const [page, view, payload] = await Promise.all([
      read('research-workspace-page.tsx'),
      read('views/market-connections-view.tsx'),
      read('../model/workspace-view-payload.ts'),
    ]);

    assert.match(page, /loadMarketConnectionDetail\?: MarketConnectionLoader;/);
    assert.match(page, /marketConnections\?: MarketConnectionsModel;/);
    assert.match(
      page,
      /const resolvedMarketConnections =\s*data\.view === 'radar'\s*\? \(marketConnections \?\? buildMarketConnectionsModel\(visibleRadarPage \?\? data\.radar\)\)\s*: null;/,
    );
    assert.match(page, /marketConnections=\{resolvedMarketConnections\}/);
    assert.match(page, /radarPage=\{visibleRadarPage \?\? data\.radar\}/);
    assert.doesNotMatch(payload, /marketConnections|loadMarketConnectionDetail/);
    assert.match(view, /signalKey === item\.connectionKey/);
    assert.match(view, /loadMarketConnectionData\(signal,/);
    assert.match(view, /import\('@stock-insight\/api-client'\)/);
  });

  it('owns hydration-safe selection, stale request rejection, and explicit opener focus return', async () => {
    const view = await read('views/market-connections-view.tsx');

    assert.match(
      view,
      /const \[selectedConnectionKey, setSelectedConnectionKey\] = useState<string>\(\);/,
    );
    assert.match(view, /const \[detailOpen, setDetailOpen\] = useState\(false\);/);
    assert.match(view, /const \[detailState, setDetailState\] = useState<DetailState>\('error'\);/);
    assert.match(
      view,
      /const \[detailResult, setDetailResult\] = useState<MarketConnectionLoadResult \| null>\(null\);/,
    );
    assert.match(view, /const openerRef = useRef<HTMLButtonElement \| null>\(null\);/);
    assert.match(view, /const requestSequenceRef = useRef\(0\);/);
    assert.match(view, /requestSequenceRef\.current !== sequence/);
    assert.match(view, /openerRef\.current = opener/);
    assert.match(view, /opener\?\.isConnected/);
    assert.match(view, /opener\.focus\(\)/);
    assert.match(view, /interactive=\{interactive\}/);
  });
});
