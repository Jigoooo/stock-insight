const SAFE_BOUNDARY_PATTERN =
  /(?:조회\s*전용|주문\s*(?:기능|실행|브로커|연결)?\s*(?:없|없습니다)|매수[·\s]*매도\s*지시\s*(?:없|없음|없습니다)|(?:not|no)\s+(?:investment\s+)?advice|no\s+order)/giu;

const ACTION_ADVICE_PATTERN =
  /(?:지금\s*(?:사세요|파세요|매수|매도)|(?:매수|매도)\s*(?:추천|시점|타이밍|지시|신호)|(?:목표가|손절가|익절가)\s*[0-9,.]*|\b(?:buy|sell)\s*(?:recommendation|timing|signal)\b|\b(?:target\s*price|stop[-\s]*loss|take[-\s]*profit)\b)/iu;

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
