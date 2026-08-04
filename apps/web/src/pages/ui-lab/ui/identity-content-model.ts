export type IdentityContentTabId = 'avatar' | 'badge' | 'status' | 'list' | 'timeline' | 'carousel';

export type ContentItemId = 'ai-infrastructure' | 'memory-cycle' | 'supply-risk';

export type IdentityContentVariant = {
  id: string;
  label: string;
  description: string;
};

export const identityContentTabs = [
  { id: 'avatar', label: 'Avatar' },
  { id: 'badge', label: 'Badge' },
  { id: 'status', label: 'Status' },
  { id: 'list', label: 'List' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'carousel', label: 'Carousel' },
] as const satisfies ReadonlyArray<{ id: IdentityContentTabId; label: string }>;

export const identityContentVariants = {
  avatar: [
    { id: 'monogram-ring', label: 'A · Monogram Ring', description: '얇은 원과 이니셜' },
    { id: 'soft-portrait', label: 'B · Soft Portrait', description: '낮은 배경의 인물·기업 표식' },
    { id: 'identity-pair', label: 'C · Identity Pair', description: '이름과 보조정보 결합' },
  ],
  badge: [
    { id: 'hairline-tag', label: 'A · Hairline Tag', description: '가벼운 외곽선' },
    { id: 'soft-fill', label: 'B · Soft Fill', description: '낮은 상태색 면' },
    { id: 'dot-label', label: 'C · Dot Label', description: '상태점과 텍스트' },
  ],
  status: [
    { id: 'inline-signal', label: 'A · Inline Signal', description: '문장 안 상태 표시' },
    { id: 'status-block', label: 'B · Status Block', description: '제목·설명·시각을 묶은 면' },
    { id: 'key-value-status', label: 'C · Key/Value Status', description: '원장형 상태 행' },
  ],
  list: [
    { id: 'quiet-rows', label: 'A · Quiet Rows', description: '얇은 구분선' },
    { id: 'soft-cards', label: 'B · Soft Cards', description: '연결된 낮은 카드' },
    { id: 'ledger-list', label: 'C · Ledger List', description: '압축된 행과 보조값' },
  ],
  timeline: [
    { id: 'hairline-rail', label: 'A · Hairline Rail', description: '선과 현재점' },
    { id: 'event-cards', label: 'B · Event Cards', description: '사건별 작은 면' },
    { id: 'compact-ledger', label: 'C · Compact Ledger', description: '시각·출처 중심 행' },
  ],
  carousel: [
    { id: 'edge-arrows', label: 'A · Edge Arrows', description: '좌우 탐색 중심' },
    { id: 'snap-cards', label: 'B · Snap Cards', description: '카드 스냅과 점 표시' },
    { id: 'filmstrip', label: 'C · Filmstrip', description: '축소 미리보기와 현재 항목' },
  ],
} as const satisfies Record<IdentityContentTabId, ReadonlyArray<IdentityContentVariant>>;

export const identitySamples = [
  { id: 'user', initials: '김', name: '김지구', meta: '개인 리서치 워크스페이스' },
  { id: 'nvda', initials: 'NV', name: 'NVIDIA', meta: 'NASDAQ · NVDA' },
  { id: 'samsung', initials: '삼', name: '삼성전자', meta: 'KOSPI · 005930' },
] as const;

export const statusSamples = [
  { id: 'available', label: '사용 가능', description: '구조화 데이터 연결됨', tone: 'success' },
  { id: 'collecting', label: '수집 중', description: '새 근거를 확인하는 중', tone: 'neutral' },
  { id: 'stale', label: '오래됨', description: '기준 시각을 다시 확인해야 함', tone: 'warning' },
] as const;

export const contentItems = [
  {
    id: 'ai-infrastructure',
    eyebrow: 'AI Infrastructure',
    title: 'AI 인프라 수요 확장',
    description: '데이터센터 투자와 가속기 수요가 공급망 전반에 미치는 영향을 확인합니다.',
    source: 'SEC · 기업 공시',
    time: '09:10',
  },
  {
    id: 'memory-cycle',
    eyebrow: 'Memory Cycle',
    title: '메모리 사이클 회복',
    description: '고대역폭 메모리 수요와 재고 정상화 흐름을 같은 기준 시점으로 비교합니다.',
    source: 'DART · 시장 데이터',
    time: '11:40',
  },
  {
    id: 'supply-risk',
    eyebrow: 'Supply Risk',
    title: '공급망 제약 재점검',
    description: '첨단 패키징과 지역별 생산 제약이 연결 기업에 미칠 수 있는 영향을 봅니다.',
    source: 'Reuters · 기업 발표',
    time: '14:25',
  },
] as const satisfies ReadonlyArray<{
  id: ContentItemId;
  eyebrow: string;
  title: string;
  description: string;
  source: string;
  time: string;
}>;
