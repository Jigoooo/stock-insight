'use client';

import { DepthGate } from './depth-gate';

export type StateReasonProps = {
  className?: string;
  /** 사람이 읽는 쉬운 말. 항상 보인다. */
  plain: string;
  /** 빌더가 낸 `state_reason` 원문. 내부 식별자를 포함할 수 있다. */
  raw?: string | null;
};

/**
 * `state_reason` 의 깊이 표현.
 *
 * 임무표는 초보/표준에 "쉬운 말", 연구에 "빌더 원문 그대로"를 요구한다. 이걸
 * `if (mode === 'research')` 로 쓰면 뷰가 모드를 읽게 되므로, **원문을
 * `research` 깊이로 배정**해서 같은 결과를 분기 없이 얻는다.
 *
 * - 연구 모드: 쉬운 말 + 원문이 펼쳐진다.
 * - 초보·표준: 쉬운 말이 보이고 원문은 접힌 accordion 으로 도달 가능하다.
 *
 * 원문에 내부 식별자가 섞여도 UX 헌법 7번을 어기지 않는 이유가 이 배치다 —
 * 기본 UI 가 아니라 명시적으로 펼친 자리에서만 나온다.
 *
 * **한계**: 임무표는 초보("쉬운 말 의역")와 표준("쉬운 말")을 구분하지만 패킷은
 * 평문을 하나만 싣는다. 둘은 지금 같은 문장을 본다. 초보용 별도 문장이 생기면
 * `plain` 을 두 갈래로 나누는 게 아니라 패킷에 필드를 늘려야 한다.
 */
export function StateReason({ className, plain, raw }: StateReasonProps) {
  return (
    <div className={className} data-slot="state-reason">
      <p data-slot="state-reason-plain">{plain}</p>
      {raw ? (
        <DepthGate at="research" label="판정 근거 원문">
          <p data-slot="state-reason-raw">{raw}</p>
        </DepthGate>
      ) : null}
    </div>
  );
}
