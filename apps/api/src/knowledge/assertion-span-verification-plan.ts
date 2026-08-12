/**
 * 인용 검증 — `extracted` 에 머문 주장이 원문에 실제로 있는지 확인한다.
 *
 * 블록 10(`catalysts_risks_counter_evidence`)은 이 저장소에서 가장 오래 어두웠던
 * 자리다. 진단은 두 번 틀렸다:
 *
 *   1차 — "생산자가 없다."  아니다. 주장은 97건 있었다.
 *   2차 — "승격 경로가 없다." 절반만 맞다. 승격 경로도 없었지만, 그것을 받는
 *          쪽의 필터가 `verificationState === 'verified'` 였다. 그런 상태는
 *          CHECK 제약에 없다. 경로가 생겨도 화면은 그대로였을 것이다.
 *
 * 두 번째는 이미 고쳤다. 이 모듈이 첫 번째다.
 *
 * ## 무엇을 "검증" 이라 부르는가
 *
 * `verified_span` 은 승격 사다리의 첫 칸이고, 뜻이 하나뿐이어야 쓸모가 있다:
 * **인용한 문구가 인용된 원문 조각 안에 실제로 있다.** 그 이상도 이하도 아니다.
 * 문구가 사실인지(`verified_semantics`), 우리가 받아들이는지(`accepted`)는
 * 다른 칸이고 다른 근거를 요구한다.
 *
 * 그래서 규칙은 둘뿐이다:
 *
 * | 규칙 | 뜻 | 실측(2026-08-13) |
 * | --- | --- | --- |
 * | `exact` | 원문에 글자 그대로 있다 | 89 / 97 |
 * | `case_insensitive` | 대소문자만 다르다 | 4 / 97 |
 *
 * **`object_entity_name` 규칙은 넣지 않았다.** 계획서에는 있었고 2건을 더 올릴
 * 수 있었다(claim:421 `Micron` · claim:458 `NVIDIA`). 그 2건은 `literal_value`
 * 가 null 이라 **인용한 문구 자체가 없다.** 확인할 수 있는 것은 "그 회사 이름이
 * 인용된 조각에 나온다" 뿐인데, 그것은 이 주장이 그 조각에 근거한다는 말이
 * 아니다. 같은 상태 이름 아래 서로 다른 강도의 확인을 섞으면 `verified_span` 은
 * 아무 뜻도 없는 라벨이 된다. 두 건은 `extracted` 로 남는다 — 정직한 결과다.
 *
 * 남는 2건은 규칙이 약해서가 아니라 **추출기가 원문에 없는 말을 지어냈기**
 * 때문이다(`85% returns` · `3.6% cost-of-living adjustment` — 둘 다 원문은 다른
 * 표현을 쓴다). 그것을 잡아내는 것이 이 검증의 존재 이유이므로, 이 2건이 계속
 * `extracted` 인 것은 실패가 아니라 **작동 증거**다.
 *
 * ## 시점
 *
 * 인용된 조각이 컷오프보다 늦게 도착했다면 그때는 대조할 수 없었다. 조각의
 * `available_at` 을 컷오프로 자른다 — 주장 자신의 시각만 보면 REQ-PIT-003 을
 * 통과하면서도 실제로는 미래 정보를 쓰게 된다.
 */

export type SpanVerificationRule = 'exact' | 'case_insensitive';

export type SpanVerificationCandidate = {
  assertionId: number;
  assertionKey: string;
  revisionNo: number;
  quotedText: string | null;
  chunkContent: string | null;
  chunkContentHash: string | null;
  availableAt: string;
};

export type SpanVerificationSkipReason =
  | 'no_quoted_text'
  | 'chunk_unreachable'
  | 'quote_absent_from_source';

export type PlannedSpanVerification = {
  assertionId: number;
  assertionKey: string;
  nextRevisionNo: number;
  rule: SpanVerificationRule;
  /** 원문에서 문구가 시작하는 위치. 0-기반, 코드포인트가 아니라 JS 문자열 인덱스다. */
  matchOffset: number;
  chunkContentHash: string | null;
};

export type SpanVerificationSkip = {
  assertionKey: string;
  reason: SpanVerificationSkipReason;
};

/**
 * 한 주장에 대한 판정. 순수 함수인 이유는 DB 없이 규칙만 시험할 수 있어야 하기
 * 때문이고, 그것이 오늘 이 파일에서 유일하게 재현 가능한 부분이기 때문이다.
 */
export function planSpanVerification(candidate: SpanVerificationCandidate): {
  plan: PlannedSpanVerification | null;
  skip: SpanVerificationSkip | null;
} {
  const skip = (reason: SpanVerificationSkipReason) => ({
    plan: null,
    skip: { assertionKey: candidate.assertionKey, reason },
  });

  const quoted = candidate.quotedText?.trim();
  // 빈 문자열은 "인용이 없다" 와 같다. 빈 문구는 어떤 원문에도 포함되므로
  // indexOf 가 0 을 돌려주고, 검증하지 않은 것이 검증된 것으로 통과한다.
  if (!quoted) return skip('no_quoted_text');
  if (candidate.chunkContent === null) return skip('chunk_unreachable');

  const exactOffset = candidate.chunkContent.indexOf(quoted);
  if (exactOffset >= 0) {
    return {
      plan: {
        assertionId: candidate.assertionId,
        assertionKey: candidate.assertionKey,
        nextRevisionNo: candidate.revisionNo + 1,
        rule: 'exact',
        matchOffset: exactOffset,
        chunkContentHash: candidate.chunkContentHash,
      },
      skip: null,
    };
  }

  const insensitiveOffset = candidate.chunkContent.toLowerCase().indexOf(quoted.toLowerCase());
  if (insensitiveOffset >= 0) {
    return {
      plan: {
        assertionId: candidate.assertionId,
        assertionKey: candidate.assertionKey,
        nextRevisionNo: candidate.revisionNo + 1,
        rule: 'case_insensitive',
        matchOffset: insensitiveOffset,
        chunkContentHash: candidate.chunkContentHash,
      },
      skip: null,
    };
  }

  return skip('quote_absent_from_source');
}
