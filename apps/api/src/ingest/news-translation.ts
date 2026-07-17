export type TranslationInput = {
  id: string;
  title: string;
  summary?: string;
};

export type TranslationOutput = {
  id: string;
  titleKo: string;
  summaryKo?: string;
};

const HANGUL = /[가-힣]/;

export function isKoreanText(value: string): boolean {
  const letters = [...value].filter((char) => /[\p{L}\p{N}]/u.test(char));
  if (letters.length === 0) return false;
  const hangul = letters.filter((char) => HANGUL.test(char)).length;
  return hangul / letters.length >= 0.25;
}

export function identityTranslation(input: TranslationInput): TranslationOutput | undefined {
  if (!isKoreanText(input.title)) return undefined;
  return {
    id: input.id,
    titleKo: input.title,
    ...(input.summary && isKoreanText(input.summary) ? { summaryKo: input.summary } : {}),
  };
}

function safeTranslation(value: unknown, original: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > original.length * 5 + 200) return undefined;
  return text;
}

export function parseTranslationResponse(
  raw: unknown,
  inputs: readonly TranslationInput[],
): TranslationOutput[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const translations = (raw as { translations?: unknown }).translations;
  if (!Array.isArray(translations)) return [];
  const byId = new Map(inputs.map((input) => [input.id, input]));
  const seen = new Set<string>();
  const outputs: TranslationOutput[] = [];

  for (const row of translations) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const candidate = row as { id?: unknown; titleKo?: unknown; summaryKo?: unknown };
    if (typeof candidate.id !== 'string' || seen.has(candidate.id)) continue;
    const input = byId.get(candidate.id);
    if (!input) continue;
    const titleKo = safeTranslation(candidate.titleKo, input.title);
    if (!titleKo) continue;
    const summaryKo = input.summary
      ? safeTranslation(candidate.summaryKo, input.summary)
      : undefined;
    outputs.push({ id: candidate.id, titleKo, ...(summaryKo ? { summaryKo } : {}) });
    seen.add(candidate.id);
  }
  return outputs;
}
