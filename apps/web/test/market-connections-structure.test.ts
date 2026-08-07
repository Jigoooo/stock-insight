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

  it('renders the approved compact inspector sections in order and omits absent optional data', async () => {
    const inspector = await read('market-connection-inspector.tsx');

    assert.match(
      inspector,
      /시장 변화 요약[\s\S]*?detail\.item\.whyNow &&[\s\S]*?왜 지금 중요한가[\s\S]*?detail\.item\.connectedEntities\.length > 0 &&[\s\S]*?연결된 내 보유·관심 종목[\s\S]*?detail\.paths\.length > 0 \|\| detail\.partialFailures\.impact[\s\S]*?시장 변화가 종목까지 이어지는 영향 경로[\s\S]*?detail\.sources\.length > 0 &&[\s\S]*?관련 뉴스·공시·근거 출처[\s\S]*?detail\.counterEvidence\.length > 0 \|\|[\s\S]*?detail\.risks\.length > 0 \|\|[\s\S]*?detail\.checkpoints\.length > 0[\s\S]*?반대 근거와 확인할 리스크[\s\S]*?데이터 기준 시각과 근거 수준/,
    );
    assert.match(inspector, /detail\.availability === 'missing'/);
    assert.doesNotMatch(inspector, /일부 상세 데이터가 준비되지 않았습니다|styles\.partialState/);
  });

  it('keeps partial failures in their owning sections and links only valid HTTPS sources', async () => {
    const inspector = await read('market-connection-inspector.tsx');

    assert.match(
      inspector,
      /detail\.partialFailures\.impact[\s\S]*?영향 경로를 확인하지 못했습니다/,
    );
    assert.match(
      inspector,
      /detail\.partialFailures\.relation[\s\S]*?관계 그래프를 확인하지 못했습니다/,
    );
    assert.match(inspector, /detail\.partialFailures\.geo[\s\S]*?지역 정보를 확인하지 못했습니다/);
    assert.match(
      inspector,
      /detail\.partialFailures\.history[\s\S]*?이전 사건을 확인하지 못했습니다/,
    );
    assert.match(
      inspector,
      /function isValidHttpsUrl\([\s\S]*?new URL\([\s\S]*?protocol === 'https:'/,
    );
    assert.match(inspector, /isValidHttpsUrl\(source\.url\) \? \(/);
    assert.match(inspector, /target="_blank" rel="noreferrer"/);
  });

  it('shows raw strength only in metadata with the non-forecast boundary', async () => {
    const [inspector, sections] = await Promise.all([
      read('market-connection-inspector.tsx'),
      read('market-connection-sections.tsx'),
    ]);

    assert.equal(inspector.match(/detail\.item\.rawStrength/g)?.length, 1);
    assert.match(
      inspector,
      /관측된 신호의 상대 강도이며 상승·하락 확률이나 가격 전망이 아닙니다\./,
    );
    assert.doesNotMatch(sections, /rawStrength/);
  });

  it('adds data-backed relation, geo, path, company, history, and factor detail only in modal', async () => {
    const inspector = await read('market-connection-inspector.tsx');

    assert.match(inspector, /presentation === 'modal'/);
    assert.match(inspector, /relation \|\| detail\.partialFailures\.relation/);
    assert.match(inspector, /<RelationSigmaGraph graph=\{relation\}/);
    assert.match(inspector, /const geoSnapshot = result\.geo/);
    assert.match(
      inspector,
      /hasMarketConnectionGeoSection\(geoSnapshot, detail\.partialFailures\.geo\)/,
    );
    assert.doesNotMatch(inspector, /geoSnapshot: GeoSnapshot/);
    assert.match(inspector, /전체 영향 경로/);
    assert.match(
      inspector,
      /relation\.nodes\.filter\(\(\{ entityKey \}\) => entityKey !== relation\.rootEntityKey\)/,
    );
    assert.match(inspector, /relatedEntities\.length > 0[\s\S]*?연관 기업/);
    assert.doesNotMatch(inspector, /연관 기업과 테마/);
    assert.match(
      inspector,
      /detail\.relatedEvents\.length > 0 \|\| detail\.partialFailures\.history/,
    );
    assert.match(inspector, /같은 유형의 이전 사건/);
    assert.match(inspector, /factorRows\.length > 0[\s\S]*?요인별 비교/);
  });

  it('connects every presentation to the same loaded result without moving loading into the frame', async () => {
    const [inspector, view] = await Promise.all([
      read('market-connection-inspector.tsx'),
      read('views/market-connections-view.tsx'),
    ]);

    assert.match(inspector, /<DetailInspectorFrame/);
    assert.match(inspector, /\{\(presentation\) => \(/);
    assert.match(inspector, /result=\{result\}/);
    assert.doesNotMatch(inspector, /MarketConnectionLoader|loadMarketConnectionDetail/);
    assert.match(view, /<MarketConnectionInspector[\s\S]*?result=\{detailResult\}/);
    assert.doesNotMatch(view, /<MarketConnectionInspector[\s\S]*?geoSnapshot=\{geoSnapshot\}/);
    assert.equal(view.match(/loadMarketConnectionDetail\(item\.connectionKey\)/g)?.length, 1);
  });

  it('uses the page-local contract precision mapper instead of invented values', async () => {
    const inspector = await read('market-connection-inspector.tsx');

    assert.match(inspector, /marketConnectionGeoPrecisionLabel/);
    assert.doesNotMatch(inspector, /centroid|region_only/);
  });

  it('keeps Korean prose and metadata readable at the minimum drawer width', async () => {
    const css = await read('market-connection-inspector.module.css');

    assert.match(css, /word-break:\s*keep-all/);
    assert.match(
      css,
      /\.readyContent\[data-presentation='drawer'\] \.metadata\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});
