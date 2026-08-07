import type {
  MarketConnectionDetail,
  MarketConnectionItem,
  MarketConnectionLoader,
  MarketConnectionsModel,
} from '@/pages/research-workspace/model/market-connections';
import type { ResearchWorkspaceViewPayload } from '@/pages/research-workspace/model/workspace-view-payload';
import {
  computeGeoSnapshotDigest,
  deriveGeoSnapshotId,
  type GeoSnapshot,
  type GeoSnapshotSealMaterial,
} from '@stock-insight/contracts/geo-api-contract';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

export type MarketConnectionsPreviewScenario =
  | 'default'
  | 'no-personalized'
  | 'empty'
  | 'partial'
  | 'detail-error';

type RadarPreviewPayload = Extract<ResearchWorkspaceViewPayload, { view: 'radar' }>;
type PreviewStory = {
  detail: Omit<MarketConnectionDetail, 'item'>;
  item: MarketConnectionItem;
  relation: EntityRelationGraph;
};

const generatedAt = '2026-08-08T00:30:00.000Z';
const analyzedAt = '2026-08-08T00:20:00.000Z';

const entity = (
  entityKey: string,
  displayName: string,
  holding: boolean,
  watched: boolean,
): MarketConnectionItem['connectedEntities'][number] => ({
  displayName,
  entityKey,
  holding,
  watched,
});

const samsung = entity('KR:005930', '삼성전자', true, false);
const skHynix = entity('KR:000660', 'SK하이닉스', true, false);
const nvidia = entity('US:NVDA', 'NVIDIA', false, true);
const micron = entity('US:MU', 'Micron', false, true);
const naver = entity('KR:035420', 'NAVER', true, false);
const hyundai = entity('KR:005380', '현대자동차', true, false);
const lgChem = entity('KR:051910', 'LG화학', true, false);
const microsoft = entity('US:MSFT', 'Microsoft', false, true);

function item(
  value: Omit<MarketConnectionItem, 'connectedEntities'> & {
    connectedEntities: MarketConnectionItem['connectedEntities'];
  },
): MarketConnectionItem {
  return value;
}

const semiconductorStory = item({
  connectionKey: 'preview:semiconductor-ai-supply',
  priority: 1,
  market: 'GLOBAL',
  regionLabel: '한국 · 미국 · 대만 공급망',
  title: 'AI 인프라 증설과 메모리 공급 조절이 한 경로에 모였습니다',
  summary:
    '삼성전자와 SK하이닉스의 HBM 공급, NVIDIA 가속기 출하, Micron 증설 신호를 하나의 공급 경로로 묶어 봅니다.',
  whyNow: '클라우드 설비투자 계획과 메모리 업체의 공급 일정이 같은 주기에 갱신됐습니다.',
  scope: 'holding',
  strength: 'high',
  rawStrength: 0.91,
  occurredAt: '2026-08-08T00:10:00.000Z',
  connectedEntities: [samsung, skHynix, nvidia, micron],
  primaryPath: '클라우드 AI 투자 → 가속기 출하 → HBM 수요 → 메모리 공급 조절',
  riskSummary: '고객 인증과 증설 일정이 실제 출하로 이어지는 시차를 함께 확인해야 합니다.',
});

const naverStory = item({
  connectionKey: 'preview:naver-ad-commerce',
  priority: 2,
  market: 'KR',
  regionLabel: '한국 디지털 플랫폼',
  title: '검색 광고 회복과 커머스 전환 신호가 NAVER에 함께 연결됩니다',
  summary:
    '검색 광고 단가, 커머스 거래 흐름, 생성형 AI 적용 비용이 플랫폼 수익성에 미칠 수 있는 경로를 구분합니다.',
  whyNow: '광고 경기 지표와 플랫폼의 분기 운영 지표가 가까운 시점에 공개됐습니다.',
  scope: 'holding',
  strength: 'high',
  rawStrength: 0.78,
  occurredAt: '2026-08-07T23:40:00.000Z',
  connectedEntities: [naver],
  primaryPath: '광고 수요 → 검색 단가와 전환율 → 커머스 매출 → AI 운영비',
  riskSummary: '트래픽 증가가 광고 단가와 영업이익 개선으로 이어지는지는 별도 확인이 필요합니다.',
});

const macroStory = item({
  connectionKey: 'preview:rates-fx-commodity',
  priority: 3,
  market: 'GLOBAL',
  regionLabel: '미국 금리 · 원화 · 원자재',
  title: '금리·환율·원자재 변화가 국내 보유 종목으로 전파될 수 있습니다',
  summary:
    '미국 장기금리, 원화 환율, 원유와 산업금속 가격이 할인율과 수입 원가를 통해 서로 다른 업종에 전달되는 경로입니다.',
  whyNow: '금리 변동성과 달러 강도, 주요 원자재 가격이 같은 기간에 방향을 달리했습니다.',
  scope: 'indirect',
  strength: 'medium',
  rawStrength: 0.64,
  occurredAt: '2026-08-07T22:55:00.000Z',
  connectedEntities: [samsung, naver, hyundai, lgChem],
  primaryPath: '미국 금리 → 달러·원화 → 수입 원가와 할인율 → 업종별 이익 기대',
  riskSummary: '기업별 환헤지와 원가 전가 능력이 달라 단일 방향으로 해석하기 어렵습니다.',
});

const powerStory = item({
  connectionKey: 'preview:ai-power-infrastructure',
  market: 'GLOBAL',
  regionLabel: '북미 데이터센터',
  title: 'AI 데이터센터 전력 수요가 관심 종목의 공급 일정과 연결됩니다',
  summary:
    '데이터센터 전력 확보와 냉각 설비 일정이 Microsoft의 투자 집행과 NVIDIA 가속기 설치 속도에 영향을 줄 수 있습니다.',
  whyNow: '전력망 접속 대기와 데이터센터 투자 계획이 동시에 갱신됐습니다.',
  scope: 'watchlist',
  strength: 'medium',
  rawStrength: 0.57,
  occurredAt: '2026-08-07T21:35:00.000Z',
  connectedEntities: [microsoft, nvidia],
  primaryPath: '전력망 접속 → 데이터센터 준공 → 가속기 설치 → AI 서비스 공급',
  riskSummary: '승인된 투자 계획과 실제 전력 공급 시점 사이에 지연이 생길 수 있습니다.',
});

const freightStory = item({
  connectionKey: 'preview:oil-freight-cost',
  market: 'GLOBAL',
  regionLabel: '글로벌 운송·제조 원가',
  title: '유가와 운임 변화가 제조업 원가에 반영되는 시차를 확인합니다',
  summary:
    '원유 가격과 해상 운임의 변화가 자동차와 화학 업종의 비용 구조에 서로 다른 속도로 전달될 수 있습니다.',
  scope: 'market',
  strength: 'medium',
  rawStrength: 0.48,
  occurredAt: '2026-08-07T20:20:00.000Z',
  connectedEntities: [hyundai, lgChem],
  primaryPath: '원유·운임 → 원재료와 물류비 → 재고 반영 → 제조 원가',
  riskSummary: '장기 운송 계약과 재고 수준 때문에 현물 가격 변화가 즉시 반영되지 않을 수 있습니다.',
});

const dollarStory = item({
  connectionKey: 'preview:dollar-liquidity',
  market: 'GLOBAL',
  regionLabel: '글로벌 달러 유동성',
  title: '달러 유동성 변화가 성장주와 수출주의 변동성을 넓힐 수 있습니다',
  summary:
    '달러 강도와 단기 자금시장 변화가 성장주 할인율과 수출기업 환산 실적에 다른 방향으로 작용할 수 있습니다.',
  scope: 'market',
  strength: 'low',
  rawStrength: 0.31,
  occurredAt: '2026-08-07T19:10:00.000Z',
  connectedEntities: [nvidia, naver, samsung],
  primaryPath: '달러 유동성 → 금리와 환율 → 밸류에이션·환산 실적 → 시장 변동성',
  riskSummary: '달러 강세가 모든 기업에 같은 방향의 영향을 준다고 볼 수 없습니다.',
});

const priorityChanges = [semiconductorStory, naverStory, macroStory];
const marketChanges = [powerStory, freightStory, dollarStory];
const allItems = [...priorityChanges, ...marketChanges];

function relationFor(itemValue: MarketConnectionItem): EntityRelationGraph {
  const [root, ...connected] = itemValue.connectedEntities;
  if (!root)
    throw new Error(`Preview story requires a connected entity: ${itemValue.connectionKey}`);
  return {
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt,
      freshness: 'available',
      contentSnapshot: {
        analysisRunId: `preview-${itemValue.connectionKey}`,
        analysisRevision: 1,
        analysisCutoffAt: analyzedAt,
        sourceWatermarkAt: analyzedAt,
        freshUntil: '2026-08-08T01:30:00.000Z',
      },
      graphSnapshot: {
        requestedAsOf: analyzedAt,
        knownThroughAt: analyzedAt,
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: { marketDataAsOf: analyzedAt },
      sourceCoverage: {
        linked: Math.max(1, connected.length * 2),
        clickable: Math.max(1, connected.length * 2),
        total: Math.max(1, connected.length * 2),
      },
      qualityFlags: [],
    },
    rootEntityKey: root.entityKey,
    depth: connected.length > 0 ? 1 : 0,
    nodes: itemValue.connectedEntities.map((connectedEntity) => ({
      entityKey: connectedEntity.entityKey,
      label: connectedEntity.displayName,
      market: connectedEntity.entityKey.startsWith('KR:') ? 'KR' : 'US',
      watched: connectedEntity.watched,
      holding: connectedEntity.holding,
    })),
    edges: connected.map((connectedEntity, index) => ({
      edgeId: `${itemValue.connectionKey}:edge:${index + 1}`,
      from: root.entityKey,
      to: connectedEntity.entityKey,
      relationType: index % 2 === 0 ? ('corroborates' as const) : ('news_co_mention' as const),
      direction: 'directed' as const,
      weight: Math.max(0.45, 0.82 - index * 0.09),
      approved: true as const,
      inferred: false as const,
      evidenceQuality: index === 0 ? ('high' as const) : ('medium' as const),
      evidenceCount: 2,
      clickableSourceCount: 2,
    })),
    evidenceSummary: {
      evidenceCount: Math.max(1, connected.length * 2),
      clickableSourceCount: Math.max(1, connected.length * 2),
      limitation: '개발 미리보기의 결정적 관계 데이터이며 실제 투자 판단 자료가 아닙니다.',
    },
  };
}

const sourcesByKey: Record<string, MarketConnectionDetail['sources']> = {
  [semiconductorStory.connectionKey]: [
    {
      id: 'semiconductor-source-1',
      title: 'AI 인프라 투자와 반도체 공급 일정',
      summary: '설비투자 계획과 공급사 일정을 비교하는 미리보기 근거입니다.',
      sourceName: 'NVIDIA Investor Relations (preview reference)',
      publishedAt: '2026-08-07T18:00:00.000Z',
      url: 'https://investor.nvidia.com/',
    },
    {
      id: 'semiconductor-source-2',
      title: '메모리 공급 계획과 HBM 수요',
      sourceName: 'Samsung Electronics Newsroom (preview reference)',
      publishedAt: '2026-08-07T17:30:00.000Z',
      url: 'https://news.samsung.com/global/',
    },
  ],
  [naverStory.connectionKey]: [
    {
      id: 'naver-source-1',
      title: '플랫폼 광고와 커머스 운영 지표',
      sourceName: 'NAVER Investor Relations (preview reference)',
      publishedAt: '2026-08-07T16:00:00.000Z',
      url: 'https://www.navercorp.com/investment/irEvents',
    },
  ],
  [macroStory.connectionKey]: [
    {
      id: 'macro-source-1',
      title: '미국 통화정책과 금리 경로',
      sourceName: 'Federal Reserve (preview reference)',
      publishedAt: '2026-08-07T15:00:00.000Z',
      url: 'https://www.federalreserve.gov/monetarypolicy.htm',
    },
    {
      id: 'macro-source-2',
      title: '에너지·원자재 시장 지표',
      sourceName: 'U.S. Energy Information Administration (preview reference)',
      publishedAt: '2026-08-07T14:30:00.000Z',
      url: 'https://www.eia.gov/petroleum/',
    },
  ],
  [powerStory.connectionKey]: [
    {
      id: 'power-source-1',
      title: '데이터센터 전력 수요와 공급 제약',
      sourceName: 'U.S. Department of Energy (preview reference)',
      publishedAt: '2026-08-07T14:00:00.000Z',
      url: 'https://www.energy.gov/',
    },
  ],
  [freightStory.connectionKey]: [
    {
      id: 'freight-source-1',
      title: '원유 가격과 운송 비용 지표',
      sourceName: 'U.S. Energy Information Administration (preview reference)',
      publishedAt: '2026-08-07T13:30:00.000Z',
      url: 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm',
    },
  ],
  [dollarStory.connectionKey]: [
    {
      id: 'dollar-source-1',
      title: '달러 금융시장 통계',
      sourceName: 'Federal Reserve Economic Data (preview reference)',
      publishedAt: '2026-08-07T13:00:00.000Z',
      url: 'https://fred.stlouisfed.org/',
    },
  ],
};

function relatedEvent(itemValue: MarketConnectionItem): MarketConnectionItem {
  return {
    ...itemValue,
    connectionKey: `${itemValue.connectionKey}:history`,
    priority: undefined,
    title: `${itemValue.title}의 이전 확인 기록`,
    summary: '직전 관측에서는 경로의 일부 지표만 움직여 후속 확인 대상으로 남았습니다.',
    occurredAt: '2026-07-31T00:00:00.000Z',
  };
}

function detailFor(itemValue: MarketConnectionItem): Omit<MarketConnectionDetail, 'item'> {
  return {
    generatedAt,
    availability: 'available',
    evidenceLevel: itemValue.strength === 'high' ? 'high' : 'medium',
    paths: [
      {
        id: `${itemValue.connectionKey}:path:primary`,
        label: '주요 전파 경로',
        summary: itemValue.primaryPath,
      },
      {
        id: `${itemValue.connectionKey}:path:geo`,
        label: '지역 연결',
        summary: `${itemValue.regionLabel ?? '관련 시장'}의 공개 지표가 연결된 순서를 확인합니다.`,
      },
    ],
    sources: sourcesByKey[itemValue.connectionKey] ?? [],
    risks: [itemValue.riskSummary ?? '경로의 전달 시차와 데이터 범위를 확인해야 합니다.'],
    counterEvidence: [
      '같은 기간 일부 선행지표는 반대 방향이어서 현재 경로가 계속된다고 단정할 수 없습니다.',
    ],
    checkpoints: [
      '다음 공개 일정에서 경로의 첫 단계와 마지막 단계가 함께 갱신되는지 확인합니다.',
      `${itemValue.regionLabel ?? '관련 시장'}의 지역별 차이가 확대되는지 확인합니다.`,
    ],
    relatedEvents: [relatedEvent(itemValue)],
    partialFailures: {},
  };
}

const storyByKey = new Map<string, PreviewStory>(
  allItems.map((itemValue) => [
    itemValue.connectionKey,
    {
      detail: detailFor(itemValue),
      item: itemValue,
      relation: relationFor(itemValue),
    },
  ]),
);

const marketConnections: MarketConnectionsModel = {
  summary: {
    changeCount: allItems.length,
    directConnectionCount: 4,
    riskCount: allItems.length,
    analyzedAt,
  },
  priorityChanges,
  marketChanges,
};

const noPersonalizedMarketConnections: MarketConnectionsModel = {
  summary: {
    changeCount: 2,
    directConnectionCount: 0,
    riskCount: 2,
    analyzedAt,
  },
  priorityChanges: [],
  marketChanges: [freightStory, dollarStory],
};

const emptyMarketConnections: MarketConnectionsModel = {
  summary: { changeCount: 0, directConnectionCount: 0, riskCount: 0, analyzedAt },
  priorityChanges: [],
  marketChanges: [],
};

const geoSnapshotMaterial = {
  version: 1,
  knownAt: analyzedAt,
  validAt: analyzedAt,
  sourceAsOf: '2026-08-07T23:50:00.000Z',
  availability: 'available',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [127.0276, 37.4979] },
        properties: {
          geoEntityKey: 'geo:region:seoul-preview',
          label: '서울 시장 연결 기준점',
          geoKind: 'city',
          precisionClass: 'approximate',
          longitude: 127.0276,
          latitude: 37.4979,
          uncertaintyRadiusKm: 15,
          evidenceLocator: {
            geoEntityRevisionId: 'preview-geo-revision-1',
            sourceRevisionId: 'preview-source-revision-1',
            sourceId: 'dev-preview-market-connections',
          },
        },
      },
    ],
  },
  mvt: {
    contentType: 'application/vnd.mapbox-vector-tile',
    minZoom: 0,
    maxZoom: 14,
  },
  h3: {
    resolution: 3,
    cells: [
      {
        cellId: '8330e1fffffffff',
        featureCount: 1,
        geoEntityKeys: ['geo:region:seoul-preview'],
      },
    ],
  },
  rejected: { count: 0, reasons: [] },
  limitations: ['개발 미리보기 좌표는 지역 연결 표현을 위한 결정적 fixture입니다.'],
} satisfies GeoSnapshotSealMaterial;

function sealAvailableGeoSnapshot(material: GeoSnapshotSealMaterial): GeoSnapshot {
  const digest = computeGeoSnapshotDigest(material);
  const snapshotId = deriveGeoSnapshotId(digest);
  return {
    ...material,
    snapshotId,
    digest,
    generatedAt,
    mvt: {
      ...material.mvt,
      available: true,
      urlTemplate: `https://preview.stock-insight.invalid/api/geo/tiles/{z}/{x}/{y}.mvt?snapshot=${snapshotId}&knownAt=${encodeURIComponent(material.knownAt)}&validAt=${encodeURIComponent(material.validAt)}`,
    },
  } satisfies GeoSnapshot;
}

const marketConnectionsGeoSnapshot = sealAvailableGeoSnapshot(geoSnapshotMaterial);

const unavailableGeoSnapshotMaterial = {
  version: 1,
  knownAt: analyzedAt,
  validAt: analyzedAt,
  sourceAsOf: null,
  availability: 'unavailable',
  geojson: { type: 'FeatureCollection', features: [] },
  mvt: {
    contentType: 'application/vnd.mapbox-vector-tile',
    minZoom: 0,
    maxZoom: 0,
  },
  h3: { resolution: 3, cells: [] },
  rejected: { count: 0, reasons: [] },
  limitations: ['partial scenario에서 지역 데이터 실패를 재현합니다.'],
} satisfies GeoSnapshotSealMaterial;

const unavailableGeoSnapshotDigest = computeGeoSnapshotDigest(unavailableGeoSnapshotMaterial);
const unavailableGeoSnapshot = {
  ...unavailableGeoSnapshotMaterial,
  snapshotId: deriveGeoSnapshotId(unavailableGeoSnapshotDigest),
  digest: unavailableGeoSnapshotDigest,
  generatedAt,
  mvt: {
    ...unavailableGeoSnapshotMaterial.mvt,
    available: false,
    urlTemplate: null,
  },
} satisfies GeoSnapshot;

type ConnectionGeoEvidence = {
  coordinates: [number, number];
  geoEntityKey: string;
  geoKind: GeoSnapshot['geojson']['features'][number]['properties']['geoKind'];
  h3CellId: string;
  label: string;
  precisionClass: GeoSnapshot['geojson']['features'][number]['properties']['precisionClass'];
  uncertaintyRadiusKm?: number;
};

const connectionGeoEvidence = {
  [semiconductorStory.connectionKey]: {
    coordinates: [127.0276, 37.4979],
    geoEntityKey: 'geo:region:semiconductor-supply-preview',
    geoKind: 'region',
    h3CellId: '8330e1fffffffff',
    label: '한국·미국·대만 반도체 공급 경로',
    precisionClass: 'approximate',
    uncertaintyRadiusKm: 120,
  },
  [naverStory.connectionKey]: {
    coordinates: [127.1054, 37.3595],
    geoEntityKey: 'geo:facility:naver-preview',
    geoKind: 'facility',
    h3CellId: '8330e1fffffffff',
    label: 'NAVER 플랫폼 운영 기준점',
    precisionClass: 'exact',
    uncertaintyRadiusKm: 2,
  },
  [macroStory.connectionKey]: {
    coordinates: [-98.5795, 39.8283],
    geoEntityKey: 'geo:country:us-macro-preview',
    geoKind: 'country',
    h3CellId: '83261bfffffffff',
    label: '미국 금리·달러 기준 지역',
    precisionClass: 'country',
  },
  [powerStory.connectionKey]: {
    coordinates: [-77.4874, 37.4316],
    geoEntityKey: 'geo:admin-area:virginia-power-preview',
    geoKind: 'admin_area',
    h3CellId: '832a8dfffffffff',
    label: '버지니아 데이터센터 전력 지역',
    precisionClass: 'admin_area',
  },
  [freightStory.connectionKey]: {
    coordinates: [103.8198, 1.3521],
    geoEntityKey: 'geo:city:singapore-freight-preview',
    geoKind: 'city',
    h3CellId: '836526fffffffff',
    label: '싱가포르 운임 관측 기준점',
    precisionClass: 'approximate',
    uncertaintyRadiusKm: 25,
  },
  [dollarStory.connectionKey]: {
    coordinates: [-98.5795, 39.8283],
    geoEntityKey: 'geo:country:us-dollar-preview',
    geoKind: 'country',
    h3CellId: '83261bfffffffff',
    label: '미국 달러 유동성 기준 지역',
    precisionClass: 'country',
  },
} satisfies Record<string, ConnectionGeoEvidence>;

function connectionGeoSnapshot(itemValue: MarketConnectionItem): GeoSnapshot | null {
  const evidence = connectionGeoEvidence[itemValue.connectionKey];
  if (!evidence) return null;
  const [longitude, latitude] = evidence.coordinates;
  const material = {
    version: 1,
    knownAt: analyzedAt,
    validAt: analyzedAt,
    sourceAsOf: itemValue.occurredAt,
    availability: 'available',
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: evidence.coordinates },
          properties: {
            geoEntityKey: evidence.geoEntityKey,
            label: evidence.label,
            geoKind: evidence.geoKind,
            precisionClass: evidence.precisionClass,
            longitude,
            latitude,
            ...(evidence.uncertaintyRadiusKm === undefined
              ? {}
              : { uncertaintyRadiusKm: evidence.uncertaintyRadiusKm }),
            evidenceLocator: {
              geoEntityRevisionId: `${itemValue.connectionKey}:geo-revision`,
              sourceRevisionId: `${itemValue.connectionKey}:source-revision`,
              sourceId: itemValue.connectionKey,
            },
          },
        },
      ],
    },
    mvt: {
      contentType: 'application/vnd.mapbox-vector-tile',
      minZoom: 0,
      maxZoom: 14,
    },
    h3: {
      resolution: 3,
      cells: [
        {
          cellId: evidence.h3CellId,
          featureCount: 1,
          geoEntityKeys: [evidence.geoEntityKey],
        },
      ],
    },
    rejected: { count: 0, reasons: [] },
    limitations: ['선택한 개발 미리보기 연결에 직접 귀속된 위치 근거만 표시합니다.'],
  } satisfies GeoSnapshotSealMaterial;
  return sealAvailableGeoSnapshot(material);
}

function radarPreviewData(
  scopeTotal: number,
  geoSnapshot: GeoSnapshot = marketConnectionsGeoSnapshot,
): RadarPreviewPayload {
  const watermark = { availability: 'available' as const, watermarkAt: analyzedAt, rowCount: 0 };
  return {
    view: 'radar',
    shell: { radarScopeTotal: scopeTotal, watchlistCount: 4 },
    geoSnapshot,
    radar: {
      generatedAt,
      signalAsOf: analyzedAt,
      scopeTotal,
      componentWatermarks: {
        event_radar: watermark,
        factor_map: watermark,
        propagation_map: watermark,
        theme_community: watermark,
        heatmap_matrix: watermark,
        timeline: watermark,
        map_globe:
          geoSnapshot.availability === 'available'
            ? {
                availability: 'available',
                watermarkAt: geoSnapshot.sourceAsOf,
                rowCount: geoSnapshot.geojson.features.length,
              }
            : { availability: 'missing', watermarkAt: null, rowCount: 0 },
        value_chain: watermark,
      },
      items: [],
      nextCursor: null,
    },
  };
}

const loadPreviewMarketConnection: MarketConnectionLoader = async (connectionKey) => {
  const story = storyByKey.get(connectionKey);
  if (!story) throw new Error(`Unknown Market Connections preview: ${connectionKey}`);
  return {
    detail: { ...story.detail, item: story.item },
    geo: connectionGeoSnapshot(story.item),
    relation: story.relation,
  };
};

const loadPartialPreviewMarketConnection: MarketConnectionLoader = async (connectionKey) => {
  const result = await loadPreviewMarketConnection(connectionKey);
  return {
    detail: {
      ...result.detail,
      availability: 'partial',
      partialFailures: {
        relation: '개발 미리보기에서 관계 그래프 일부를 불러오지 못했습니다.',
        geo: '개발 미리보기에서 지역 좌표 데이터가 준비되지 않았습니다.',
        history: '개발 미리보기에서 이전 관측 기록 일부가 준비되지 않았습니다.',
      },
      relatedEvents: [],
    },
    geo: null,
    relation: null,
  };
};

const loadFailedPreviewMarketConnection: MarketConnectionLoader = async () => {
  throw new Error('개발 미리보기에서 시장 변화 상세를 불러오지 못했습니다.');
};

function loaderForVisibleItems(
  model: MarketConnectionsModel,
  loader: MarketConnectionLoader,
): MarketConnectionLoader {
  const visibleKeys = new Set(
    [...model.priorityChanges, ...model.marketChanges].map(({ connectionKey }) => connectionKey),
  );
  return async (connectionKey) => {
    if (!visibleKeys.has(connectionKey)) {
      throw new Error(`Unknown Market Connections preview: ${connectionKey}`);
    }
    return loader(connectionKey);
  };
}

export function resolveMarketConnectionsPreview(scenario: MarketConnectionsPreviewScenario): {
  data: RadarPreviewPayload;
  marketConnections: MarketConnectionsModel;
  loader: MarketConnectionLoader;
} {
  if (scenario === 'no-personalized') {
    return {
      data: radarPreviewData(noPersonalizedMarketConnections.summary.changeCount),
      marketConnections: noPersonalizedMarketConnections,
      loader: loaderForVisibleItems(noPersonalizedMarketConnections, loadPreviewMarketConnection),
    };
  }
  if (scenario === 'empty') {
    return {
      data: radarPreviewData(0),
      marketConnections: emptyMarketConnections,
      loader: loaderForVisibleItems(emptyMarketConnections, loadPreviewMarketConnection),
    };
  }
  return {
    data: radarPreviewData(
      marketConnections.summary.changeCount,
      scenario === 'partial' ? unavailableGeoSnapshot : marketConnectionsGeoSnapshot,
    ),
    marketConnections,
    loader: loaderForVisibleItems(
      marketConnections,
      scenario === 'partial'
        ? loadPartialPreviewMarketConnection
        : scenario === 'detail-error'
          ? loadFailedPreviewMarketConnection
          : loadPreviewMarketConnection,
    ),
  };
}
