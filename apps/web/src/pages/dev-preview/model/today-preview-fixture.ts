import type { ResearchWorkspaceViewPayload } from '@/pages/research-workspace/model/workspace-view-payload';
import type {
  ResearchFeedItem,
  ResearchRecordDetail,
} from '@stock-insight/contracts/research-workspace';

type TodayPreviewPayload = Extract<ResearchWorkspaceViewPayload, { view: 'today' }>;

function previewNews(
  recordKey: string,
  title: string,
  summary: string,
  affectedEntityKeys: ResearchFeedItem['affectedEntityKeys'],
  relevance: ResearchFeedItem['relevance'],
  whySurfaced: string,
  publishedAt: string,
  market: ResearchFeedItem['market'] = 'US',
): ResearchFeedItem {
  return {
    recordKey,
    recordType: 'briefing',
    market,
    title,
    summary,
    publishedAt,
    affectedEntityKeys,
    whySurfaced,
    relevance,
    confidence: relevance.kind === 'discovery' ? 'medium' : 'high',
    sourceCoverage: { linked: 2, clickable: 2, total: 2 },
    qualityFlags: [],
  };
}

const mustKnowItems = [
  previewNews(
    'preview:must:memory',
    '메모리 가격 반등 기대와 공급 조절 신호가 동시에 포착됐습니다',
    '주요 메모리 업체의 공급 계획과 현물 가격 흐름을 함께 확인할 필요가 있습니다.',
    ['KR:005930'],
    { kind: 'direct', hops: 0 },
    '보유 종목과 직접 연결',
    '2026-08-06T07:45:00.000Z',
    'KR',
  ),
  previewNews(
    'preview:must:ai-capex',
    '북미 클라우드 기업의 AI 설비투자 기조가 이어지고 있습니다',
    '데이터센터 투자 속도와 GPU 공급 일정이 반도체 수요의 핵심 확인 지점입니다.',
    ['US:NVDA'],
    { kind: 'direct', hops: 0 },
    '관심 종목과 직접 연결',
    '2026-08-06T06:40:00.000Z',
  ),
  previewNews(
    'preview:must:rates',
    '미국 장기금리 변동성이 성장주 밸류에이션에 다시 영향을 주고 있습니다',
    '금리 방향보다 변동 폭이 커지는지와 기술주 실적 기대의 변화를 함께 봐야 합니다.',
    ['US:NVDA'],
    { kind: 'related', hops: 1 },
    '관심 종목과 한 단계 관계',
    '2026-08-06T05:55:00.000Z',
    'MACRO',
  ),
  previewNews(
    'preview:list:platform',
    '플랫폼 광고 시장의 회복 속도가 지역별로 엇갈리고 있습니다',
    '검색과 커머스 광고의 성장 차이를 다음 실적 발표에서 확인할 수 있습니다.',
    ['KR:035420'],
    { kind: 'indirect', hops: 2 },
    '관심 산업의 간접 변화',
    '2026-08-06T04:30:00.000Z',
    'KR',
  ),
  previewNews(
    'preview:list:oil',
    '원유 가격 조정이 운송비와 제조업 원가 기대에 반영되고 있습니다',
    '유가 변화가 기업 마진으로 전달되는 시차를 업종별로 확인해야 합니다.',
    [],
    { kind: 'market', hops: null },
    '시장 전체에 영향을 줄 수 있는 변화',
    '2026-08-06T03:20:00.000Z',
    'GLOBAL',
  ),
] satisfies ResearchFeedItem[];

const forYouItems = [
  previewNews(
    'preview:for-you:foundry',
    '첨단 공정 수율과 고객사 다변화가 파운드리 회복의 관건으로 꼽힙니다',
    '단기 가동률보다 수율 개선과 신규 고객 인증 일정을 우선 확인할 필요가 있습니다.',
    ['KR:005930'],
    { kind: 'direct', hops: 0 },
    '보유 종목 삼성전자와 직접 연결',
    '2026-08-06T02:15:00.000Z',
    'KR',
  ),
  previewNews(
    'preview:for-you:search-ai',
    '검색 서비스의 생성형 AI 적용이 광고 상품 구조를 바꾸고 있습니다',
    '트래픽 증가가 실제 광고 단가와 전환율 개선으로 이어지는지 확인해야 합니다.',
    ['KR:035420'],
    { kind: 'related', hops: 1 },
    '관심 종목 NAVER와 한 단계 관계',
    '2026-08-06T01:35:00.000Z',
    'KR',
  ),
] satisfies ResearchFeedItem[];

const exploreItems = [
  previewNews(
    'preview:explore:power-grid',
    '데이터센터 전력 수요가 전력망 투자 테마로 확장되고 있습니다',
    '반도체 수요와 전력 인프라 투자 사이의 중장기 연결을 살펴볼 수 있습니다.',
    [],
    { kind: 'discovery', hops: null },
    '관심 테마 밖의 발견 후보',
    '2026-08-06T00:50:00.000Z',
    'GLOBAL',
  ),
] satisfies ResearchFeedItem[];

export const todayPreviewFixture = {
  view: 'today',
  lane: 'must_know',
  shell: {
    radarScopeTotal: 18,
    watchlistCount: 3,
  },
  today: {
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt: '2026-08-06T08:00:00.000Z',
      freshness: 'available',
      contentSnapshot: {
        analysisRunId: 'dev-preview-today',
        analysisRevision: 1,
        analysisCutoffAt: '2026-08-06T08:00:00.000Z',
        sourceWatermarkAt: '2026-08-06T07:50:00.000Z',
        freshUntil: '2026-08-06T09:00:00.000Z',
      },
      graphSnapshot: {
        requestedAsOf: '2026-08-06T08:00:00.000Z',
        knownThroughAt: '2026-08-06T07:55:00.000Z',
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: { marketDataAsOf: null },
      sourceCoverage: { linked: 12, clickable: 12, total: 12 },
      qualityFlags: [],
    },
    summary: {
      laneItemCount: mustKnowItems.length + forYouItems.length + exploreItems.length,
      relationCount: 7,
      watchlistCount: 3,
      sourceCount: 12,
    },
    lanes: [
      {
        lane: 'must_know',
        scopeTotal: mustKnowItems.length,
        items: mustKnowItems,
        nextCursor: null,
      },
      { lane: 'for_you', scopeTotal: forYouItems.length, items: forYouItems, nextCursor: null },
      { lane: 'explore', scopeTotal: exploreItems.length, items: exploreItems, nextCursor: null },
    ],
    defaultRecordKey: null,
  },
  defaultRecord: null,
} satisfies TodayPreviewPayload;

const previewItemsByRecordKey = new Map(
  [...mustKnowItems, ...forYouItems, ...exploreItems].map((item) => [item.recordKey, item]),
);

function previewSourceUrl(item: ResearchFeedItem) {
  if (item.market === 'MACRO') return 'https://www.reuters.com/markets/rates-bonds/';
  if (item.title.includes('AI') || item.title.includes('생성형')) {
    return 'https://www.reuters.com/technology/artificial-intelligence/';
  }
  if (item.affectedEntityKeys.length > 0) return 'https://www.reuters.com/technology/';
  return 'https://www.reuters.com/markets/';
}

export async function loadTodayPreviewRecord(recordKey: string): Promise<ResearchRecordDetail> {
  const item = previewItemsByRecordKey.get(recordKey);
  if (!item) throw new Error(`Unknown Today preview record: ${recordKey}`);

  const sourceKey = `${recordKey}:source`;
  return {
    ...item,
    meta: todayPreviewFixture.today.meta,
    body: `${item.summary}\n\n${item.whySurfaced}된 변화입니다. 원문과 후속 지표를 함께 확인해 맥락을 판단하세요.`,
    category: 'news',
    sourceCoverage: { linked: 1, clickable: 1, total: 1 },
    limitations: ['개발 미리보기 데이터이므로 실제 기사 제목과 분석 결과가 아닙니다.'],
    evidence: [
      {
        evidenceId: `${recordKey}:evidence`,
        claim: item.summary,
        sourceKeys: [sourceKey],
        quality: item.confidence,
      },
    ],
    sources: [
      {
        sourceKey,
        attributionText: 'Reuters 관련 시장 뉴스 (미리보기)',
        url: previewSourceUrl(item),
        publishedAt: item.publishedAt,
        sourceContentHash: 'a'.repeat(64),
        bindingState: 'verified',
      },
    ],
  };
}
