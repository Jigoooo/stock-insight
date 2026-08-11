const SAFE_BOUNDARY_PATTERN =
  /(?:조회\s*전용|주문\s*(?:기능|실행|브로커|연결)?\s*(?:없|없습니다)|매수[·\s]*매도\s*지시\s*(?:없|없음|없습니다)|(?:not|no)\s+(?:investment\s+)?advice|no\s+order)/giu;

// `목표가` 가 아니라 `목표\s*주?가` 인 이유.
//
// 2026-08-11, 학습 카드가 처음으로 화면에 그려지면서 이 게이트를 통과한 문장이
// 드러났다: 현대차 카드의 불릿 `선행 PER 10.1배 / 애널리스트 컨센서스 'buy' /
// 목표주가 평균 약 748,755원 (현재가 대비 +50.7% 여력)`. `목표가` 는 `목표주가`
// 의 부분 문자열이 아니므로 이 게이트는 **더 표준적인 철자를 통째로 놓치고
// 있었다** — CLAUDE.md 가 이름으로 금지한 바로 그 낱말이다.
//
// 라이브 전수 대조(학습 카드 불릿 48개 · 용어 정의 16개 · deep_cache 리포트
// 8개 · stock.candidates.risks 1722개 · crypto.candidates.risks 1045개)에서
// 판정이 바뀌는 문자열은 둘뿐이다. 하나는 위 불릿(막아야 할 것), 다른 하나는
// 삼성전자 deep_cache 리포트의 `목표주가만 근거로 저평가를 단정할 수 없습니다`
// 라는 **경고 문장**이다. 후자까지 막는 것은 이 게이트가 원래 감수하는 무딤과
// 같은 종류다 — `목표가` 도 숫자 없이 낱말만으로 이미 막는다. 문맥을 읽어
// 구별하려 들면 정규식이 영리해지고, 영리한 안전 게이트는 조용히 뚫린다.
//
// `\s*` 이지 `\s+` 가 아니고 `[0-9,.]*` 이지 `+` 가 아닌 것은 기존 동작 그대로다.
// 숫자를 필수로 만들면 게이트가 약해지고, 그것은 이 변경의 방향이 아니다.
//
// ── 2026-08-11 2차 확장: 리포트 요약이 쓰는 나머지 네 어휘 ───────────────────
//
// 이 게이트가 `목표(주)가` 만 알던 동안 같은 문장의 다른 철자는 그대로
// 지나갔다. 오늘 라이브가 그 패턴들에서 깨끗한 것은 **데이터의 우연**이지
// 게이트의 성질이 아니다 — 아래는 라이브 실측이다.
//
//   적정(주)가   knowledge.event 0건 · 학습 카드 0건 · 용어 정의 0건
//   상승/하락여력 0건
//   TP           0건
//   비중 확대     1건
//   투자의견      31건 (전부 `목표가 N/A 투자의견없음`, 이미 막히던 문자열)
//
// 두 패턴은 모양을 좁혀 넣었고, 그 이유가 곧 라이브 근거다.
//
// `비중\s*확대` 를 낱말만으로 막지 않는다. 라이브의 유일한 한 건이
// `국내 조선 3사가 … 고부가가치 선박 비중 확대로 2분기 호실적을 기록하자` —
// **사업 구성 서술**이고 투자의견이 아니다. 그래서 `투자의견` 이 앞에 붙은
// 형태만 막는다. `투자의견없음` 은 이 목록에 없으므로 그대로 지나간다.
//
// `TP` 는 두 글자라 `목표주가` 와 같은 무딤을 감당하지 못한다. `\bTP\b` 는
// `TP-Link` 같은 고유명사도 함께 문다. 그래서 값이나 조정 방향이 붙은
// 형태(`TP 56,000`, `TP 상향`)만 막는다 — 이것이 리포트가 실제로 쓰는 꼴이다.
//
// `\s*주?가` 는 좁혔다. 그 형태로 두면 `주` 가 선택적인데 공백은 허용되므로
// `목표`/`적정` 뒤에 오는 **가로 시작하는 아무 낱말이나** 문다. 라이브 반증:
// `AI 에이전트의 적정 가격은 얼마인가` (source_documents id=52181, rss_news) 가
// 차단됐다. `적정 가치`·`적정 가동률`·`목표 가운데`·`목표 가격대` 도 같은 구멍이다.
//
// 그래서 공백은 `주` 가 붙을 때만 허용한다 — `(?:목표|적정)\s*주가|목표가|적정가`.
// `목표주가`·`목표 주가`·`적정주가`·`적정 주가`·`목표가`·`적정가` 는 그대로 막히고
// 위 넷은 풀린다. `적정가치`(공백 없음)는 여전히 막힌다 — 감수한 무딤이고 테스트가
// 못박고 있다.
//
// 이 좁힘이 "영리한 게이트" 가 아닌 이유: 조건이 문맥이 아니라 **철자**에 붙는다.
// 게이트가 문장의 뜻을 읽으려 들면 영리해지는 것이고, 어느 글자열이 목표가를
// 뜻하는지 고르는 것은 그것과 다르다.
//
// `상승\s*여력` 은 좁히지 않았다. 그쪽은 `여력` 자체가 이 문맥 밖에서 잘 쓰이지 않는다.
//
// 라이브 전수 대조(사건 제목 · 학습 카드 본문/불릿 · 용어 정의 · 회사 프로필 ·
// stock/crypto candidates 의 thesis·risks · 원문 문서 제목/요약 · 링크 맥락,
// 중복 제거 후 29,604 문자열)에서 **판정이 바뀌는 문자열은 7개이고 전부 새로
// 막히는 쪽**이다. 풀리는 것은 하나도 없다 — 이 확장은 게이트를 어디서도
// 약하게 만들지 않는다. 7개의 정체:
//
//   6건  `…최대 54% 상승 여력`, `33배 상승 여력`, `큰 폭 상승 여력` 류.
//        전형적인 목표가 문장의 다른 철자다. 막아야 할 것.
//   1건  `현 주가($38)는 내재가치($35) 대비 저평가가 아닌 '적정가치'` —
//        특정 종목의 밸류에이션 단정이므로 역시 막아야 할 것.
//
// `적정가치` 가 중립적 개념어로 쓰이는 문장까지 함께 물리는 것은 감수한 무딤이고
// 테스트에 그렇게 못박아 뒀다. 라이브에는 그런 용례가 없다.
//
// ── `Should you buy X?` ──────────────────────────────────────────────────────
//
// 사건 제목을 CAV 빌더에 물리면서 드러났다. `Netflix … Should You Buy the Dip?`,
// `Should You Buy Lockheed Martin After Its Strong Q2 Earnings Rally?` 처럼
// **질문 형태로 쓴 추천**은 `buy\s*(?:now|recommendation|…)` 을 지나간다.
// 같은 전수 대조에서 8건이 걸리고 전부 추천 헤드라인이며 오탐은 0이다.
//
// `순매수`·`장내매수`·`ARK Buys More Coinbase` 는 여전히 지나간다. 그것은 공시된
// 매매 사실이지 권고가 아니고, 2026-08-03 에 그 구별을 잃었을 때 파이프라인
// 전체가 멈췄다(`action-advice-gate-single-source.test.ts` 헤더).
const ACTION_ADVICE_PATTERN =
  /(?:\b(?:buy|sell)\s*(?:now|recommendation|timing|signal)\b|\bshould\s+(?:you|i|we)\s+(?:buy|sell)\b|지금\s*(?:사세요|파세요|매수|매도)|(?:매수|매도)\s*(?:하세요|하라|추천|시점|타이밍|지시|신호)|(?:(?:목표|적정)\s*주가|목표가|적정가|손절가|익절가)\s*[0-9,.]*|(?:상승|하락)\s*여력|투자\s*의견\s*[:：]?\s*(?:적극\s*)?(?:매수|매도|비중\s*(?:확대|축소)|중립|보유|strong\s*buy|buy|sell|hold|overweight|underweight)|\bTP\s*(?:[0-9]|상향|하향|제시)|\b(?:target\s*price|stop[-\s]*loss|take[-\s]*profit)\b)/iu;

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

export function containsActionAdvice(...values: unknown[]): boolean {
  return values.some((value) => {
    const text = stringify(value).trim();
    if (!text) return false;
    const textWithoutSafeBoundaries = text.replace(SAFE_BOUNDARY_PATTERN, ' ');
    return ACTION_ADVICE_PATTERN.test(textWithoutSafeBoundaries);
  });
}

export function actionSafeText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  if (!text || containsActionAdvice(text)) return undefined;
  return text;
}

export function filterActionSafeTexts(values: readonly string[]): string[] {
  return values.filter((value) => !containsActionAdvice(value));
}
