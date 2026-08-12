import { createRoot } from 'react-dom/client';

import '../../../apps/web/public/styles/index.css';
import '../../../apps/web/public/styles/profiles/market-graphite.css';

import {
  type MarketConnectionItem,
  type MarketConnectionLoadResult,
  type MarketConnectionsModel,
} from '../../../apps/web/src/pages/research-workspace/model/market-connections';
import { MarketConnectionsView } from '../../../apps/web/src/pages/research-workspace/ui/views/market-connections-view';

import {
  computeGeoSnapshotDigest,
  deriveGeoSnapshotId,
  type GeoSnapshot,
  type GeoSnapshotSealMaterial,
} from '@stock-insight/contracts/geo-api-contract';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

type DeferredRequest = {
  reject: (error: Error) => void;
  resolve: (result: MarketConnectionLoadResult) => void;
};

declare global {
  interface Window {
    __marketConnectionsFixture: {
      reject: (connectionKey: string) => void;
      resolve: (connectionKey: string) => void;
    };
  }
}

const occurredAt = '2026-08-08T01:00:00.000Z';

function item(connectionKey: string, priority: 1 | 2 | 3): MarketConnectionItem {
  return {
    connectionKey,
    priority,
    market: 'US',
    title: `변화 ${connectionKey}`,
    summary: `${connectionKey} 시장 변화 요약`,
    scope: 'holding',
    strength: 'high',
    occurredAt,
    connectedEntities: [
      {
        entityKey: `US:${connectionKey}`,
        displayName: `종목 ${connectionKey}`,
        holding: true,
        watched: connectionKey === 'A',
      },
    ],
  };
}

const items = [item('A', 1), item('B', 2), item('C', 3)];
const itemByKey = new Map(items.map((value) => [value.connectionKey, value]));
const pending = new Map<string, DeferredRequest[]>();

function detailResult(connectionKey: string): MarketConnectionLoadResult {
  const selected = itemByKey.get(connectionKey);
  if (!selected) throw new Error(`Unknown fixture connection: ${connectionKey}`);
  return {
    relation: null,
    detail: {
      item: selected,
      generatedAt: occurredAt,
      availability: 'available',
      paths: [],
      sources: [],
      relatedEvents: [],
      partialFailures: {},
    },
  };
}

function takeRequest(connectionKey: string) {
  const requests = pending.get(connectionKey);
  const request = requests?.shift();
  if (!request) throw new Error(`No pending fixture request for ${connectionKey}`);
  if (requests?.length === 0) pending.delete(connectionKey);
  return request;
}

function loadMarketConnectionDetail(connectionKey: string) {
  return new Promise<MarketConnectionLoadResult>((resolve, reject) => {
    const requests = pending.get(connectionKey) ?? [];
    requests.push({ reject, resolve });
    pending.set(connectionKey, requests);
  });
}

window.__marketConnectionsFixture = {
  reject(connectionKey) {
    takeRequest(connectionKey).reject(new Error(`Fixture rejected ${connectionKey}`));
  },
  resolve(connectionKey) {
    takeRequest(connectionKey).resolve(detailResult(connectionKey));
  },
};

const marketConnections: MarketConnectionsModel = {
  summary: {
    changeCount: 3,
    directConnectionCount: null,
    riskCount: null,
    analyzedAt: occurredAt,
  },
  priorityChanges: items,
  marketChanges: [],
};

const watermark = { availability: 'available' as const, watermarkAt: occurredAt, rowCount: 0 };
const radarPage: RadarSignalPage = {
  generatedAt: occurredAt,
  signalAsOf: occurredAt,
  scopeTotal: 3,
  componentWatermarks: {
    event_radar: watermark,
    factor_map: watermark,
    propagation_map: watermark,
    theme_community: watermark,
    heatmap_matrix: watermark,
    timeline: watermark,
    map_globe: watermark,
    value_chain: watermark,
  },
  items: [],
  nextCursor: null,
};

const emptyGeoSnapshotMaterial = {
  version: 1,
  knownAt: occurredAt,
  validAt: occurredAt,
  sourceAsOf: null,
  availability: 'empty',
  geojson: { type: 'FeatureCollection', features: [] },
  mvt: {
    contentType: 'application/vnd.mapbox-vector-tile',
    minZoom: 0,
    maxZoom: 0,
  },
  h3: { resolution: 3, cells: [] },
  rejected: { count: 0, reasons: [] },
  limitations: ['시장 연결 컴포넌트 fixture에는 표시할 지역 데이터가 없습니다.'],
} satisfies GeoSnapshotSealMaterial;
const emptyGeoSnapshotDigest = computeGeoSnapshotDigest(emptyGeoSnapshotMaterial);
const emptyGeoSnapshot = {
  ...emptyGeoSnapshotMaterial,
  snapshotId: deriveGeoSnapshotId(emptyGeoSnapshotDigest),
  digest: emptyGeoSnapshotDigest,
  generatedAt: occurredAt,
  mvt: {
    ...emptyGeoSnapshotMaterial.mvt,
    available: false,
    urlTemplate: null,
  },
} satisfies GeoSnapshot;

const root = document.getElementById('root');
if (!root) throw new Error('Market connections fixture root is missing');
createRoot(root).render(
  <MarketConnectionsView
    geoSnapshot={emptyGeoSnapshot}
    interactive
    loadMarketConnectionDetail={loadMarketConnectionDetail}
    marketConnections={marketConnections}
    onLoadMore={() => undefined}
    pageState="ready"
    radarPage={radarPage}
  />,
);
