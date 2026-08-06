import type {
  EntityRelationGraph,
  ResearchFeedItem,
  ResearchFeedLaneId,
} from '@stock-insight/contracts/research-workspace';

export const laneLabels: Record<ResearchFeedLaneId, string> = {
  must_know: '꼭 봐야 할 변화',
  for_you: '관심종목 연결',
  explore: '새로 볼 변화',
};

export const availabilityLabels: Record<string, string> = {
  available: '사용 가능',
  collecting: '수집 중',
  stale: '갱신 필요',
  missing: '데이터 없음',
  text_only: '텍스트만',
  unsupported: '지원하지 않음',
  error: '오류',
};

const whySurfacedLabels: Record<string, string> = {
  direct: '관심 종목과 직접 연결',
  holding_direct: '보유 종목과 직접 연결',
  watched_direct: '관심 종목과 직접 연결',
  watchlist_direct: '관심 종목과 직접 연결',
  related: '관심 종목의 연관 기업과 연결',
  relation_one_hop: '관심 종목과 1단계 관계로 연결',
  one_hop: '관심 종목과 1단계 관계로 연결',
  indirect: '관심 종목의 관계망을 통해 연결',
  relation_two_hop: '관심 종목과 2단계 관계로 연결',
  two_hop: '관심 종목과 2단계 관계로 연결',
  market: '현재 시장에서 확인할 변화',
  market_context: '현재 시장 흐름과 연결',
  discovery: '관심 목록 밖에서 발견한 변화',
  new_discovery: '관심 목록 밖에서 발견한 변화',
};

const signalTypeLabels: Record<string, string> = {
  fundamental: '기초 재무',
  insider_trade: '내부자 거래',
  analyst: '애널리스트 변화',
  sec_8k: 'SEC 8-K 공시',
  price_mover: '가격 변화',
  sentiment: '시장 심리',
  short_volume: '공매도 거래',
  segment: '사업 부문',
  market_news: '시장 뉴스',
  earnings_event: '실적 발표',
  attention_spike: '관심 급증',
  gdelt_theme: '글로벌 뉴스 테마',
  policy_event: '정책 이벤트',
  major_holder: '주요 주주',
  policy_prob: '정책 확률',
  valuation: '가치평가',
  growth: '성장 지표',
  sec_filing: 'SEC 공시',
  earnings_macro: '실적·거시',
  price_stress: '가격 스트레스',
  quake: '지진 이벤트',
  dart_disclosure: 'DART 공시',
  macro_indicator: '거시 지표',
  financial_conditions: '금융 여건',
  volatility: '변동성',
  volume_mover: '거래량 변화',
  news: '새 소식',
  disclosure: '공시 변화',
  macro: '거시경제 변화',
  earnings: '실적 변화',
};

const analysisStatusLabels: Record<string, string> = {
  none: '분석 전',
  cached: '분석 준비됨',
  queued: '분석 대기 중',
  running: '분석 중',
  failed: '분석 확인 필요',
  stale: '분석 갱신 필요',
};

const historyStatusLabels: Record<string, string> = {
  open: '검토 중',
  reviewed: '검토 완료',
  archived: '보관됨',
};

const relationTypeLabels: Record<string, string> = {
  same_industry: '같은 산업',
  news_co_mention: '같은 소식에 등장',
  peer: '비교 기업',
  corroborates: '근거가 서로 뒷받침',
};

const datasetLabels: Record<string, string> = {
  publication_records: '리서치 발행 기록',
  market_snapshots: '시장 가격 기록',
  decision_history: '판단 기록',
  entity_relations: '기업 관계',
  source_bindings: '출처 연결',
  watchlist: '관심종목',
  positions: '보유종목',
};

export const domainLabels: Record<string, string> = {
  stock: '종목',
  market: '시장',
  research: '리서치',
  graph: '관계',
  user: '내 기록',
};

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '기준 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function confidenceLabel(value: string) {
  if (value === 'high') return '근거 높음';
  if (value === 'medium') return '근거 보통';
  return '근거 낮음';
}

export function marketLabel(value: string) {
  return (
    {
      KR: '한국',
      KRX: '한국',
      KOSDAQ: '코스닥',
      US: '미국',
      NASDAQ: '나스닥',
      NYSE: '뉴욕증권거래소',
      AMEX: '미국',
      MACRO: '거시경제',
      GLOBAL: '글로벌',
    }[value] ?? '기타 시장'
  );
}

export function signalTypeLabel(value: string) {
  return signalTypeLabels[value.toLowerCase().replace(/[\s-]+/g, '_')] ?? '시장 변화';
}

export function analysisStatusLabel(value: string) {
  return analysisStatusLabels[value] ?? '분석 상태 확인 중';
}

export function historyStatusLabel(value: string) {
  return historyStatusLabels[value] ?? '상태 확인 중';
}

export function relationTypeLabel(value: string) {
  return relationTypeLabels[value] ?? '확인된 관계';
}

export function datasetLabel(domain: string, datasetName: string) {
  return datasetLabels[datasetName] ?? `${domainLabels[domain] ?? '기타'} 데이터`;
}

export function relationNodeLabel(graph: EntityRelationGraph, entityKey: string) {
  return graph.nodes.find((node) => node.entityKey === entityKey)?.label ?? '연결 기업';
}

export function whySurfacedLabel(item: ResearchFeedItem) {
  const source = item.whySurfaced.trim();
  const normalized = source.toLowerCase().replace(/[\s-]+/g, '_');
  const mapped = whySurfacedLabels[normalized];
  if (mapped) return mapped;
  if (/[가-힣]/.test(source) && !/(?:related_ticker:|STAGE:)/i.test(source)) return source;

  if (item.relevance.kind === 'direct') return whySurfacedLabels.direct;
  if (item.relevance.kind === 'related') return whySurfacedLabels.related;
  if (item.relevance.kind === 'indirect') {
    return `${item.relevance.hops ?? 2}단계 관계를 통해 연결`;
  }
  if (item.relevance.kind === 'discovery') return whySurfacedLabels.discovery;
  return whySurfacedLabels.market;
}
