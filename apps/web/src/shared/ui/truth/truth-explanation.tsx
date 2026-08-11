import type { TruthBinding } from './truth-binding-state';
import { truthCopyFor } from './truth-class-labels';
import { assertRenderableInCommonView } from './truth-render-guard';
import styles from './truth.module.css';

import { DepthGate } from '@/shared/depth';

export type TruthExplanationProps = {
  binding: TruthBinding;
  /**
   * 이 화면이 왜 이 분류를 다는지. 연구 깊이에서만 펼쳐진다.
   * `governance.truth_class_binding.basis` 와 같은 성격의 문장이다.
   */
  basis?: string;
  /** 이 표시가 걸린 항목 수. 연구 깊이에서만 펼쳐진다. */
  itemCount?: number;
};

/**
 * 깊이 연동 — 초보=칩만 · 표준=칩+한 줄 설명 · 연구=칩+설명+분류 근거.
 *
 * **숫자는 어느 모드에서도 동일하다.** 깊이는 설명의 양만 바꾸고 값이나 순서를
 * 바꾸지 않는다. 그리고 접힘은 제거가 아니다 — `DepthGate` 가 접힌 콘텐츠도
 * DOM 에 남기므로 초보 모드에서도 도달 경로가 있다.
 *
 * 모드를 직접 읽지 않는다. 깊이 모드 API 의 소비자는 `DepthGate` 와 토글
 * 둘뿐이라는 P6 의 하드 게이트를 이 파일도 지킨다.
 *
 * 2026-08-11 정정 — 이 컴포넌트만 문지기를 통과하지 않고 `truthCopyFor()` 를
 * 직접 불렀다. `TRUTH_CLASS_COPY` 는 `PERSONAL_DECISION` 에도 한국어 문구를
 * 갖고 있으므로(“내 판단 기록 · 본인에게만 보이는 개인 기록입니다”),
 * `TruthChip`·`TruthClaimRow`·`TruthLegend` 가 모두 던지는 바인딩에서 이 파일만
 * 그 문구를 그대로 렌더했다. 지금 경로가 네 값만 만들어 살아있는 유출은 아니었지만
 * 배럴이 가드 없는 렌더러를 내보내는 상태였다 — `REQ-REC-001`.
 *
 * 형태는 `truthRuleFor`·`requiresDistributionRendering` 와 같다: `bound` 일 때만
 * 클래스가 있으므로 상태를 먼저 좁힌 뒤 문지기를 부른다.
 */
export function TruthExplanation({ basis, binding, itemCount }: TruthExplanationProps) {
  if (binding.state === 'bound') assertRenderableInCommonView(binding.truthClass);
  const copy = truthCopyFor(binding);
  const research = [basis, itemCount === undefined ? null : `이 표시가 걸린 항목 ${itemCount}건`]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  return (
    <>
      {/* 라벨에 조사를 붙이면 받침에 따라 문법이 깨진다. 붙이지 않는 형태로 쓴다. */}
      <DepthGate at="standard" className={styles.explanation} label={`‘${copy.label}’ 표시의 뜻`}>
        <p className={styles.explanationText}>{copy.description}</p>
      </DepthGate>
      {research.length > 0 && (
        <DepthGate at="research" className={styles.explanation} label={`‘${copy.label}’ 분류 근거`}>
          <p className={styles.explanationText}>{research}</p>
        </DepthGate>
      )}
    </>
  );
}
