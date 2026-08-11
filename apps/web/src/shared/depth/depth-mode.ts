/**
 * 깊이 3모드 — `REQ-PROD-002`.
 *
 * 초보/표준/연구는 **분석 결과가 아니라 설명 깊이만** 바꾼다. K6
 * (`serving.common_asset_view`)는 깊이와 무관하게 12블록을 전부 적재하고,
 * `REQ-REC-001` 이 personalization 조인을 금지하므로 깊이는 서버가 만드는 것이
 * 아니라 **깊이-불변 패킷 위의 렌더 타임 선택**이다.
 * (`docs/design/information-architecture.md` §9 결정 2 — 전역 토글 + 클라이언트 저장)
 *
 * 여기서 정의하는 것은 "무엇을 숨기는가"가 아니라 **"무엇을 펼친 채로 두는가"**다.
 * IA 36줄: "research 는 숨김이 아니라 배치다. 도달 경로가 없으면 그건 삭제이고
 * 정본 위반이다." 그래서 `isExpandedAt()` 이 false 를 돌려준다는 것은 접힘이지
 * 제거가 아니며, `DepthGate` 가 그 계약을 강제한다.
 */

/** 사용자가 고르는 모드. */
export const DEPTH_MODES = ['beginner', 'standard', 'research'] as const;
export type DepthMode = (typeof DEPTH_MODES)[number];

/** 콘텐츠에 배정되는 깊이. IA §1 "깊이 세 단계". */
export const DEPTH_LEVELS = ['essential', 'standard', 'research'] as const;
export type DepthLevel = (typeof DEPTH_LEVELS)[number];

/** SSR 은 저장소를 읽을 수 없다. 첫 렌더는 항상 이 값이고 복원은 마운트 후에 한다. */
export const DEFAULT_DEPTH_MODE: DepthMode = 'standard';

/**
 * 클라이언트 저장(IA §9 결정 2). 서버 저장을 택하면 신규 마이그레이션 +
 * `stock_insight_app_reader` GRANT + `EXPECTED_CATALOG_DIGESTS` 갱신이 한 묶음이
 * 되므로 기기 간 동기화를 포기하고 그 경로 전체를 피한다.
 * 워크스페이스 사이드바 모드와 달리 세션이 아니라 **선호**라서 `localStorage` 다.
 */
export const DEPTH_MODE_STORAGE_KEY = 'stock-insight:depth-mode';

export type DepthModeOption = {
  description: string;
  label: string;
  value: DepthMode;
};

/**
 * UX 헌법 7번: 내부 enum(`beginner`/`standard`/`research`)은 `value` 에만 두고
 * 사용자에게는 한국어 라벨만 보인다.
 */
export const DEPTH_MODE_OPTIONS: readonly DepthModeOption[] = [
  { value: 'beginner', label: '초보', description: '핵심만 펼칩니다' },
  { value: 'standard', label: '표준', description: '핵심과 해설을 펼칩니다' },
  { value: 'research', label: '연구', description: '도출 근거까지 펼칩니다' },
];

/**
 * 모드별로 **펼친 채 두는** 깊이 집합. 단조성(essential ⊆ standard ⊆ research)이
 * 이 표 하나에서 나온다 — 계산이 아니라 데이터라서 표류할 자리가 없다.
 */
const EXPANDED_LEVELS: Record<DepthMode, readonly DepthLevel[]> = {
  beginner: ['essential'],
  standard: ['essential', 'standard'],
  research: ['essential', 'standard', 'research'],
};

export function expandedLevelsAt(mode: DepthMode): readonly DepthLevel[] {
  return EXPANDED_LEVELS[mode];
}

/** true = 펼침, false = **접힘**(제거 아님). `DepthGate` 만 이 함수를 부른다. */
export function isExpandedAt(mode: DepthMode, level: DepthLevel): boolean {
  return EXPANDED_LEVELS[mode].includes(level);
}

export function isDepthMode(value: unknown): value is DepthMode {
  return typeof value === 'string' && (DEPTH_MODES as readonly string[]).includes(value);
}

/** SSR 안전. 저장소가 없거나(서버) 막혀 있으면(프라이버시 모드) 기본값. */
export function readStoredDepthMode(): DepthMode {
  if (typeof window === 'undefined') return DEFAULT_DEPTH_MODE;
  try {
    const stored = window.localStorage.getItem(DEPTH_MODE_STORAGE_KEY);
    return isDepthMode(stored) ? stored : DEFAULT_DEPTH_MODE;
  } catch {
    // 프라이버시 제한 컨텍스트에서는 저장소 접근 자체가 던진다.
    return DEFAULT_DEPTH_MODE;
  }
}

export function writeStoredDepthMode(mode: DepthMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEPTH_MODE_STORAGE_KEY, mode);
  } catch {
    // 저장에 실패해도 이번 세션의 선택은 메모리에 남는다.
  }
}
