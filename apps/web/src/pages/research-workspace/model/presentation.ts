const INTERNAL_HIERARCHY = /계층\s+\d+(?:\s*\/\s*\d+)+\s*\.?\s*/giu;
const LOCAL_HIERARCHY = /로컬\s+계층\s+신뢰\d+\s*\/\s*촉매\d+\s*\.?\s*/giu;
const RANKING_HIERARCHY =
  /계층정렬\s+데이터신뢰\s*\d+\s*[·/]\s*촉매\s*\d+(?:와|과|이며)?\s*\.?\s*/giu;
const ALPHA_RANKING_HIERARCHY = /\d+-[A-Z]\s+계층정렬\s+최상단이고\s*/giu;
const RELATED_TICKER_PATH = /\s*related_ticker:[^.?!]*(?:[.?!]|$)\s*/giu;
const RETURN_RATIO_SENTENCE =
  /(^|[.!?]\s*)[^.!?]*(?:R\/R|기대 손익비)\s*[0-9]+(?:\.[0-9]+)?(?:이다|다)?\s*\.?/giu;
const TARGET_PRICE = /(전일|기존)\s+목표\s+[0-9,.]+\s*(?:달러|원)([를을])?/gu;

const SOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  stock_candidate: '종목 후보 분석',
  sec_companyfacts: 'SEC 기업 공시',
  sec_filing: 'SEC 공시',
  market_price: '시장 가격 데이터',
  research_record: '리서치 기록',
});

const THEME_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ev: '전기차',
  ai_semi: 'AI 반도체',
  megacap_ai: '대형 AI 기업',
  defense: '방산',
  kr_auto: '국내 자동차',
  battery: '배터리',
  consumer: '소비재',
  shipbuilding: '조선',
  aerospace: '우주·항공',
  finance_bank: '금융·은행',
  electronic_components: '전자부품',
  cybersecurity: '사이버보안',
  renewable_energy: '재생에너지',
  cloud_computing: '클라우드 컴퓨팅',
  kr_energy: '국내 에너지',
  bio_pharma: '바이오·제약',
  healthcare: '헬스케어',
  hardware: '하드웨어',
  enterprise_software: '기업용 소프트웨어',
  kr_platform: '국내 플랫폼',
  materials_mining: '소재·광업',
  internet_platform: '인터넷 플랫폼',
  entertainment_media: '엔터테인먼트·미디어',
  cleanroom_technology: '클린룸 기술',
  data_center_infrastructure: '데이터센터 인프라',
  industrial_construction: '산업 건설',
  retail: '유통',
  energy_oil: '에너지·정유',
});

export function presentResearchSummary(value: string): string {
  return value
    .trim()
    .replace(RANKING_HIERARCHY, '')
    .replace(ALPHA_RANKING_HIERARCHY, '')
    .replace(LOCAL_HIERARCHY, '')
    .replace(INTERNAL_HIERARCHY, '')
    .replace(RELATED_TICKER_PATH, '')
    .replace(/\bfresh\s+GraphRAG\b/giu, '최근 관계 분석')
    .replace(/\bSEC\s+Companyfacts\s+XBRL\b/giu, 'SEC 공시')
    .replace(/SEC\s+XBRL\/세그먼트/giu, 'SEC 공시')
    .replace(/SEC\s+XBRL\b/giu, 'SEC 공시')
    .replace(/\bSEC\s+segment\b/giu, 'SEC 사업부 공시의')
    .replace(/\bnews-bullish\s*(\d+)\s*채널[이가]/giu, '긍정 뉴스 $1개 출처가')
    .replace(/\bnews-bullish\s*(\d+)\s*채널/giu, '긍정 뉴스 $1개 출처')
    .replace(RETURN_RATIO_SENTENCE, '$1')
    .replace(/이며(?:이)?다(?=[.!?]|$)/gu, '입니다')
    .replace(/하며이다(?=[.!?]|$)/gu, '합니다')
    .replace(/([가-힣]+)했고다(?=[.!?]|$)/gu, '$1했습니다')
    .replace(
      TARGET_PRICE,
      (_match, prefix: string, particle: string | undefined) =>
        `${prefix} 확인 기준${particle ? '을' : ''}`,
    )
    .replace(/감시로\s+강등했다/gu, '추가 확인이 필요하다')
    .replace(/추격을\s+피한다/gu, '가격 부담을 함께 확인한다')
    .replace(/추격하지\s+않는다/gu, '가격 부담을 함께 확인한다')
    .replace(/추격\s+구간이다/gu, '가격 부담을 확인할 구간이다')
    .replace(/승격\s+진입\s+기준/gu, '다시 확인할 기준')
    .replace(/승격합니다/gu, '다시 확인합니다')
    .replace(/\s+([,.!?])/gu, '$1')
    .replace(/([.!?]){2,}/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

export function sourceAttributionLabel(value: string): string {
  const trimmed = value.trim();
  const mapped = SOURCE_LABELS[trimmed.toLowerCase()];
  if (mapped) return mapped;
  if (/[가-힣]/.test(trimmed)) return trimmed;
  if (/^[A-Za-z][A-Za-z0-9 .&()-]{1,80}$/.test(trimmed)) return trimmed;
  return '리서치 출처';
}

export function themeTitleLabel(value: string): string {
  const trimmed = value.trim();
  if (/[가-힣]/.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/^THEME:/i, '').toLowerCase();
  const mapped = THEME_LABELS[normalized];
  if (mapped) return mapped;
  return normalized
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((token) =>
      token.toUpperCase() === token ? token : `${token[0]?.toUpperCase() ?? ''}${token.slice(1)}`,
    )
    .join(' ');
}
