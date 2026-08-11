/**
 * 용어 색인과 본문 주석 계획 — **순수 함수만 있는 파일이다.**
 *
 * ## 왜 공유 가변 상태를 두지 않는가
 *
 * "섹션당 첫 등장만" · "블록당 5개 상한" 은 여러 주석 사이에 공유되는 예산이라
 * provider + `Set` 으로 만들고 싶어진다. 그렇게 하면 두 가지가 깨진다.
 *
 * 1. 모듈 레벨에 두면 **SSR 요청 사이로 샌다.** 종목 A 를 그린 이력이 종목 B 의
 *    렌더를 바꾸고, 같은 입력이 같은 출력을 내지 않는다.
 * 2. provider 안에 둬도 자식만 다시 렌더하는 순간(팝오버 열기 같은) 예산이
 *    이미 소진된 것으로 보여 주석이 통째로 사라진다.
 *
 * 그래서 예산은 **렌더 전에 한 번 계산**한다. `annotateSection()` 이 그 섹션의
 * 본문들을 순서대로 받아 주석 계획을 통째로 돌려주고, 컴포넌트는 그 계획을
 * 그리기만 한다. 몇 번을 다시 렌더해도 결과가 같다.
 *
 * ## `normalizedTerm` 은 서버가 주지 않는다
 *
 * `public.entity_glossary_terms` 에는 `normalized_term` 열이 있지만
 * `apps/api/src/stocks/read-model.ts` 의 `glossary_terms` CTE 가 그 열을
 * **select 하지 않는다**(`term` · `definition` · `source_refs_json` 만 싣는다).
 * 계약(`entityGlossaryTermSchema`)에도 없다. 계약을 넓히는 대신 여기서 같은
 * 규칙으로 정규화한다 — 서버 규칙은 소문자화이므로 그것을 그대로 따르고,
 * 앞뒤 공백과 연속 공백만 더 접는다.
 */

import type { EntityGlossaryTerm, SourceLink } from '@stock-insight/contracts';

/**
 * DB `normalized_term` 과 같은 자리를 채우는 클라이언트 정규화.
 * 한국어에는 낱말 경계가 없어 대소문자와 공백만 다룬다.
 */
export function normalizeGlossaryTerm(term: string): string {
  return term.trim().toLowerCase().replaceAll(/\s+/g, ' ');
}

export type GlossaryEntry = {
  term: string;
  normalized: string;
  definition: string;
  /** 사람이 읽는 출처 이름. 라이브에서는 전부 비어 있다. */
  sourceNames: string[];
  /**
   * 출처가 하나도 없으면 `text_only`. 계약의 `entityGlossaryTermSchema` 에는
   * availability 가 없으므로 **여기서 파생한다** — 근거 없는 정의를 근거 있는
   * 정의와 같은 모습으로 그리면 검증된 것처럼 보인다.
   */
  availability: 'available' | 'text_only';
};

/**
 * 세 상태를 구분한다(UX 헌법 6번과 같은 정직함).
 *
 * - `unsupported`: 계약 필드가 `undefined` — 이 종목에 용어 행이 아예 없다.
 * - `empty`: 빈 배열 — 정리된 용어가 있었으나 표시할 수 있는 것이 남지 않았다.
 *   (`apps/api` 의 `sanitizeStockDetail` 이 `undefined` 는 지우고 `[]` 는 남긴다.)
 * - `ready`: 하나 이상.
 */
export type GlossaryIndexState = 'unsupported' | 'empty' | 'ready';

export type GlossaryIndex = {
  state: GlossaryIndexState;
  entries: GlossaryEntry[];
  /** 정규화된 이름 → 항목. 같은 이름이 둘이면 먼저 온 것이 이긴다. */
  byNormalized: ReadonlyMap<string, GlossaryEntry>;
};

const EMPTY_INDEX: GlossaryIndex = {
  state: 'unsupported',
  entries: [],
  byNormalized: new Map(),
};

function sourceName(source: SourceLink): string {
  return source.label.trim();
}

export function buildGlossaryIndex(
  terms: readonly EntityGlossaryTerm[] | undefined,
): GlossaryIndex {
  if (terms === undefined) return EMPTY_INDEX;

  const byNormalized = new Map<string, GlossaryEntry>();
  const entries: GlossaryEntry[] = [];
  for (const term of terms) {
    const normalized = normalizeGlossaryTerm(term.term);
    if (normalized.length === 0 || byNormalized.has(normalized)) continue;
    const sourceNames = term.sources.map(sourceName).filter((name) => name.length > 0);
    const entry: GlossaryEntry = {
      term: term.term.trim(),
      normalized,
      definition: term.definition.trim(),
      sourceNames,
      availability: sourceNames.length > 0 ? 'available' : 'text_only',
    };
    byNormalized.set(normalized, entry);
    entries.push(entry);
  }

  return {
    state: entries.length > 0 ? 'ready' : 'empty',
    entries,
    byNormalized,
  };
}

// ── 본문 주석 계획 ───────────────────────────────────────────────────────────

/**
 * `start` 는 원문에서의 시작 위치다. 목록 key 로 쓰라고 싣는다 — 배열 인덱스는
 * 계획이 바뀌면 같은 값이 다른 조각을 가리키지만, 시작 위치는 그 조각 자신의
 * 사실이라 조각을 따라 움직인다.
 */
export type GlossarySegment =
  | { kind: 'text'; text: string; start: number }
  | { kind: 'term'; text: string; start: number; entry: GlossaryEntry };

/** 노이즈 방지 상한. 과제가 못 박은 값이라 호출부가 바꾸지 못하게 여기 둔다. */
export const GLOSSARY_ANNOTATION_LIMIT = 5;

/**
 * 라틴 문자·숫자로 시작하거나 끝나는 용어는 낱말 안쪽에서 매치되면 안 된다.
 * (`EV` 가 `SEVEN` 안에서 잡히는 것을 막는다.) 한국어는 낱말 경계가 없으므로
 * 이 검사는 라틴/숫자 경계에만 건다.
 */
const latinOrDigit = /[a-z0-9]/i;

function boundaryOk(text: string, start: number, end: number): boolean {
  const first = text[start] ?? '';
  const last = text[end - 1] ?? '';
  const before = start > 0 ? (text[start - 1] ?? '') : '';
  const after = text[end] ?? '';
  if (latinOrDigit.test(first) && latinOrDigit.test(before)) return false;
  if (latinOrDigit.test(last) && latinOrDigit.test(after)) return false;
  return true;
}

export type AnnotateOptions = {
  /** 이미 다른 곳에서 주석된 정규화 이름. 섹션 안에서 첫 등장만 남긴다. */
  exclude?: ReadonlySet<string>;
  /** 남은 주석 예산. 기본값은 상한 그대로. */
  budget?: number;
};

export type AnnotateResult = {
  segments: GlossarySegment[];
  /** 이 본문에서 실제로 주석된 정규화 이름. 다음 본문의 `exclude` 로 넘긴다. */
  used: string[];
};

/**
 * 본문 하나를 주석한다. **최장일치 · 겹치지 않음 · 용어당 첫 등장 한 번.**
 *
 * 링크나 헤딩 안에서 부르지 않는 것은 호출부의 책임이다 — prop 이
 * `text: string` 이라 `ReactNode` 트리를 걸을 방법이 애초에 없고, 그래서
 * "링크 안 금지" 는 element 타입 검사가 아니라 호출 위치의 규칙이 된다.
 */
export function annotateText(
  index: GlossaryIndex,
  text: string,
  options: AnnotateOptions = {},
): AnnotateResult {
  const budget = options.budget ?? GLOSSARY_ANNOTATION_LIMIT;
  if (index.state !== 'ready' || text.length === 0 || budget <= 0) {
    return { segments: text.length > 0 ? [{ kind: 'text', text, start: 0 }] : [], used: [] };
  }

  // 최장일치: 긴 이름부터 시도한다. 같은 길이면 사전순으로 고정해 출력이
  // 입력 순서에 흔들리지 않게 한다.
  const candidates = [...index.byNormalized.values()].sort(
    (left, right) =>
      right.normalized.length - left.normalized.length ||
      left.normalized.localeCompare(right.normalized),
  );
  const excluded = new Set(options.exclude ?? []);
  const lowered = text.toLowerCase();

  const segments: GlossarySegment[] = [];
  const used: string[] = [];
  let cursor = 0;
  let plain = 0;
  let remaining = budget;

  const flush = (upto: number) => {
    if (upto > plain) segments.push({ kind: 'text', text: text.slice(plain, upto), start: plain });
  };

  while (cursor < text.length && remaining > 0) {
    let matched: GlossaryEntry | null = null;
    for (const entry of candidates) {
      if (excluded.has(entry.normalized)) continue;
      const end = cursor + entry.normalized.length;
      if (end > text.length) continue;
      // 정규화가 연속 공백을 접으므로 원문과 길이가 다를 수 있다. 길이가 같은
      // 경우만 매치로 인정한다 — 위치를 어긋나게 자르는 것보다 놓치는 편이 낫다.
      if (lowered.slice(cursor, end) !== entry.normalized) continue;
      if (!boundaryOk(text, cursor, end)) continue;
      matched = entry;
      break;
    }

    if (matched === null) {
      cursor += 1;
      continue;
    }

    const end = cursor + matched.normalized.length;
    flush(cursor);
    segments.push({ kind: 'term', text: text.slice(cursor, end), start: cursor, entry: matched });
    excluded.add(matched.normalized);
    used.push(matched.normalized);
    remaining -= 1;
    plain = end;
    cursor = end;
  }

  flush(text.length);
  return { segments, used };
}

/**
 * 섹션 하나의 본문들을 **한 번에** 계획한다. 예산과 "첫 등장만" 이 본문들
 * 사이로 이어지고, 결과는 렌더 전에 확정되므로 다시 렌더해도 같다.
 */
export function annotateSection(
  index: GlossaryIndex,
  texts: readonly string[],
  options: AnnotateOptions = {},
): GlossarySegment[][] {
  const excluded = new Set(options.exclude ?? []);
  let remaining = options.budget ?? GLOSSARY_ANNOTATION_LIMIT;
  return texts.map((text) => {
    const result = annotateText(index, text, { exclude: excluded, budget: remaining });
    for (const normalized of result.used) excluded.add(normalized);
    remaining -= result.used.length;
    return result.segments;
  });
}

/**
 * 종목 이름과 같은 용어는 주석하지 않는다(과제 규칙). 이름이 없으면 빈 집합.
 */
export function excludedByAssetName(displayName: string | null | undefined): Set<string> {
  const normalized = displayName ? normalizeGlossaryTerm(displayName) : '';
  return normalized.length > 0 ? new Set([normalized]) : new Set();
}
