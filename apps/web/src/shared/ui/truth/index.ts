export {
  boundTruth,
  CONTENT_PACK_EVIDENCE_SUBKINDS,
  CONTENT_PACK_ITEM_KINDS,
  isContentPackEvidenceSubkind,
  isContentPackItemKind,
  NOT_A_TRUTH_OBJECT,
  TRUTH_BINDING_STATES,
  truthBindingForContentPackItem,
  UNDECIDED,
  type BoundTruth,
  type ContentPackEvidenceSubkind,
  type ContentPackItemKind,
  type TruthBinding,
  type TruthBindingState,
} from './truth-binding-state';
/**
 * 문구 표(`TRUTH_CLASS_COPY`·`truthClassCopy`·`truthCopyFor`)는 **의도적으로
 * 배럴에 없다** — 2026-08-11.
 *
 * 그 표는 `PERSONAL_DECISION` 에도 한국어 문구를 갖고 있고 문지기를 통과하지
 * 않는다. 배럴에 두면 새 호출자가 `truthCopyFor(binding).label` 한 줄로
 * `assertRenderableInCommonView()` 를 우회해 개인 범위 문구를 공통 화면에
 * 그릴 수 있다(`REQ-REC-001`). `TruthExplanation` 이 정확히 그렇게 되어 있었다.
 *
 * 그래서 이 배럴이 내보내는 것은 **전부 문지기를 통과한 표면**이다. 표 자체는
 * `./truth-class-labels` 파일 export 로 남아 있어 폴더 안 렌더러와 계약 테스트가
 * 직접 가져다 쓴다 — 배럴 밖 소비자는 grep 상 0개였으므로 이 좁히기로 끊기는
 * 호출자는 없다.
 */
export type { TruthCopy } from './truth-class-labels';
export { TruthChip, type TruthChipProps } from './truth-chip';
export { TruthClaimRow, type TruthClaimRowProps } from './truth-claim-row';
export { TruthExplanation, type TruthExplanationProps } from './truth-explanation';
export {
  TruthLegend,
  truthLegendLabel,
  type TruthLegendEntry,
  type TruthLegendProps,
} from './truth-legend';
export {
  assertRenderableInCommonView,
  requiresCausalLabel,
  requiresDistributionRendering,
  truthRuleFor,
  type TruthRule,
} from './truth-render-guard';
