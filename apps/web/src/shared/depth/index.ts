export {
  assignmentFor,
  detailDepthFor,
  COMMON_ASSET_VIEW_BLOCK_KEYS,
  DEPTH_ASSIGNMENTS,
  DEPTH_SURFACES,
  type CommonAssetViewBlockKey,
  type DepthAssignment,
  type DepthAssignmentKey,
  type DepthSurface,
} from './depth-assignment';
export { DepthModeProvider, type DepthModeProviderProps } from './depth-context';
export { DepthGate, type DepthGateProps } from './depth-gate';
/*
  `expandedLevelsAt`·`isDepthMode`·`isExpandedAt` 은 여기서 내보내지 않는다.
  셋 다 `shared/depth` 안에서만 쓰이는데 배럴이 공개하고 있었고, 그 공개가
  "분기 금지" 가드에 구멍을 냈다 — 제품 레이어가 `@/shared/depth` 에서 모드
  판정을 가져다 직접 분기해도 가드는 초록이었다. 배럴에서 내리면 그러려면
  `shared/depth/depth-mode` 를 이름으로 파고들어야 하고, 그때는 가드가 본다.

  테스트는 `depth-mode.ts` 를 직접 import 하므로 영향이 없다.
*/
export {
  DEFAULT_DEPTH_MODE,
  DEPTH_LEVELS,
  DEPTH_MODE_OPTIONS,
  DEPTH_MODE_STORAGE_KEY,
  DEPTH_MODES,
  type DepthLevel,
  type DepthMode,
  type DepthModeOption,
} from './depth-mode';
export { DepthModeToggle, type DepthModeToggleProps } from './depth-mode-toggle';
