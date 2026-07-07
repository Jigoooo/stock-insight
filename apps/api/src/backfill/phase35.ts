import type { DataAvailability, SourceLink } from '@stock-insight/contracts';

export type Phase35DeepCacheRow = {
  ticker: string | null;
  market: string | null;
  name: string | null;
  report: string | null;
  durable_facts: unknown;
  sources: unknown;
  researched_at: string | Date | null;
  publication_sources?: unknown;
};

export type Phase35LearningCardSeed = {
  entityKey: string;
  cardKey: string;
  section: string;
  title: string;
  bodyMarkdown: string;
  bullets: string[];
  sources: SourceLink[];
  availability: DataAvailability;
  sourceKind: string;
  sourceUri: string;
  derivedFromDeepCache: boolean;
  publishedAt?: string;
};

export type Phase35CompanyProfileSeed = {
  entityKey: string;
  symbol: string;
  market: 'KR' | 'US';
  name: string;
  summaryText: string;
  profileJson: Record<string, unknown>;
  sourceRefs: SourceLink[];
  availability: DataAvailability;
  capturedAt?: string;
};

export type Phase35BackfillPlan = {
  sourceRows: number;
  eligibleRows: number;
  learningCards: Phase35LearningCardSeed[];
  companyProfiles: Phase35CompanyProfileSeed[];
};

export type Phase35AuditSummary = {
  deepCacheRows: number;
  eligibleRows: number;
  learningCards: number;
  companyProfiles: number;
  availableLearningCards: number;
  textOnlyLearningCards: number;
  learningCardsWithoutSourceLinks: number;
  warnings: string[];
};

export type Phase35ReadExecutor = {
  queryRows: <TRow extends Phase35DeepCacheRow = Phase35DeepCacheRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type Phase35WriteExecutor = {
  execute: (sql: string, params?: readonly unknown[]) => Promise<{ rowCount?: number | null }>;
};

export type Phase35ApplyOptions = {
  runId: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
};

export type Phase35ApplyResult = {
  audit: {
    rowsRead: number;
    rowsWritten: number;
    rowsSkipped: number;
    summary: Phase35AuditSummary;
  };
};

const URL_PATTERN = /https?:\/\/[^\s\]})>"']+/gu;

const UPSERT_LEARNING_CARD_SQL = `
INSERT INTO public.stock_learning_cards (
  entity_key,
  card_key,
  section,
  title,
  body_markdown,
  bullets_json,
  source_refs_json,
  availability,
  source_kind,
  source_uri,
  derived_from_deep_cache,
  published_at
) VALUES (
  $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12::timestamptz
)
ON CONFLICT (entity_key, card_key) DO UPDATE SET
  section = EXCLUDED.section,
  title = EXCLUDED.title,
  body_markdown = EXCLUDED.body_markdown,
  bullets_json = EXCLUDED.bullets_json,
  source_refs_json = EXCLUDED.source_refs_json,
  availability = EXCLUDED.availability,
  source_kind = EXCLUDED.source_kind,
  source_uri = EXCLUDED.source_uri,
  derived_from_deep_cache = EXCLUDED.derived_from_deep_cache,
  published_at = EXCLUDED.published_at,
  updated_at = now()
`;

const UPSERT_COMPANY_PROFILE_SQL = `
INSERT INTO public.company_profiles (
  entity_key,
  symbol,
  market,
  name,
  summary_text,
  profile_json,
  source_refs_json,
  availability,
  captured_at
) VALUES (
  $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::timestamptz
)
ON CONFLICT (entity_key) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  market = EXCLUDED.market,
  name = EXCLUDED.name,
  summary_text = EXCLUDED.summary_text,
  profile_json = EXCLUDED.profile_json,
  source_refs_json = EXCLUDED.source_refs_json,
  availability = EXCLUDED.availability,
  captured_at = EXCLUDED.captured_at,
  updated_at = now()
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id,
  job_name,
  source_system,
  status,
  started_at,
  finished_at,
  rows_read,
  rows_written,
  rows_skipped,
  error,
  summary
) VALUES (
  $1, $2, 'stock-insight-app', 'completed', $3::timestamptz, $4::timestamptz, $5, $6, $7, NULL, $8::jsonb
)
`;

export const PHASE35_SOURCE_ROWS_SQL = `
WITH normalized_deep_cache AS (
  SELECT
    concat(norm.market, ':', cache.ticker) AS entity_key,
    cache.ticker,
    norm.market,
    cache.name,
    cache.report,
    cache.durable_facts,
    cache.sources,
    cache.researched_at
  FROM watchlist.deep_cache cache
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN upper(cache.market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(cache.market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX', 'NMS', 'NYQ', 'NGM', 'NCM') THEN 'US'
      ELSE NULL
    END AS market
  ) norm
  JOIN public.entities entity
    ON entity.entity_key = concat(norm.market, ':', cache.ticker)
  WHERE norm.market IN ('KR', 'US')
    AND cache.ticker IS NOT NULL
    AND coalesce(cache.report, '') <> ''
), source_union AS (
  SELECT
    record.entity_key,
    coalesce(nullif(source.title, ''), nullif(source.source_name, ''), source.url) AS label,
    source.url
  FROM public.publication_records record
  JOIN public.record_sources source
    ON source.record_id = record.id
  WHERE record.domain = 'stock'
    AND coalesce(source.url, '') ~ '^https?://'
  UNION ALL
  SELECT
    document.entity_key,
    coalesce(nullif(document.title, ''), nullif(document.source_name, ''), document.url) AS label,
    document.url
  FROM public.source_documents document
  WHERE coalesce(document.url, '') ~ '^https?://'
), source_refs AS (
  SELECT
    entity_key,
    jsonb_agg(DISTINCT jsonb_build_object('label', label, 'url', url)) AS publication_sources
  FROM source_union
  GROUP BY entity_key
)
SELECT
  cache.ticker,
  cache.market,
  cache.name,
  cache.report,
  cache.durable_facts,
  cache.sources,
  cache.researched_at,
  coalesce(refs.publication_sources, '[]'::jsonb) AS publication_sources
FROM normalized_deep_cache cache
LEFT JOIN source_refs refs
  ON refs.entity_key = cache.entity_key
ORDER BY cache.entity_key
`;

export function normalizeDeepCacheMarket(value: string | null | undefined): 'KR' | 'US' | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  if (['KR', 'KRX', 'KOSPI', 'KOSDAQ'].includes(normalized)) return 'KR';
  if (['US', 'NASDAQ', 'NYSE', 'AMEX', 'NMS', 'NYQ', 'NGM', 'NCM'].includes(normalized))
    return 'US';
  return null;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function normalizeSourceLink(value: unknown): SourceLink | null {
  if (typeof value === 'string') {
    const url = value.trim();
    if (!url) return null;
    try {
      return { label: new URL(url).hostname, url };
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  if (!url) return null;
  try {
    const label =
      typeof record.label === 'string' && record.label.trim()
        ? record.label.trim()
        : new URL(url).hostname;
    new URL(url);
    return { label, url };
  } catch {
    return null;
  }
}

function collectSourceLinks(value: unknown, output: SourceLink[], seen: Set<string>): void {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) {
    for (const item of parsed) collectSourceLinks(item, output, seen);
    return;
  }

  const direct = normalizeSourceLink(parsed);
  if (direct) {
    if (!seen.has(direct.url)) {
      seen.add(direct.url);
      output.push(direct);
    }
    return;
  }

  if (typeof parsed !== 'string') return;
  for (const match of parsed.matchAll(URL_PATTERN)) {
    const source = normalizeSourceLink(match[0]);
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    output.push(source);
  }
}

export function parseSourceLinks(...values: unknown[]): SourceLink[] {
  const output: SourceLink[] = [];
  const seen = new Set<string>();
  for (const value of values) collectSourceLinks(value, output, seen);
  return output;
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (typeof item !== 'string') return [];
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}

function linesOf(text: string): string[] {
  return text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractHeading(report: string, fallbackName: string): string {
  for (const line of linesOf(report)) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) return match[1].trim();
  }
  return `${fallbackName} 심층 리서치 요약`;
}

function extractBodyMarkdown(report: string, fallbackName: string): string {
  for (const line of linesOf(report)) {
    if (/^#{1,6}\s+/.test(line)) continue;
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) continue;
    return line.slice(0, 700);
  }
  return `${fallbackName}에 대한 심층 리서치 캐시가 있습니다.`;
}

function extractBullets(report: string, durableFacts: unknown, bodyMarkdown: string): string[] {
  const bullets = linesOf(report).flatMap((line) => {
    const match = /^(?:[-*•]|\d+[.)])\s+(.+?)\s*$/.exec(line);
    return match?.[1] ? [match[1].trim()] : [];
  });
  if (bullets.length > 0) return bullets.slice(0, 6);

  const facts = parseStringArray(durableFacts);
  if (facts.length > 0) return facts.slice(0, 6);

  return bodyMarkdown ? [bodyMarkdown] : [];
}

function toIsoString(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function toEligibleRow(row: Phase35DeepCacheRow) {
  const market = normalizeDeepCacheMarket(row.market);
  const ticker = row.ticker?.trim();
  const name = row.name?.trim() || ticker;
  const report = row.report?.trim();
  if (!market || !ticker || !name || !report) return null;

  const entityKey = `${market}:${ticker}`;
  const sources = parseSourceLinks(row.sources, row.publication_sources);
  const bodyMarkdown = extractBodyMarkdown(report, name);
  const bullets = extractBullets(report, row.durable_facts, bodyMarkdown);
  const publishedAt = toIsoString(row.researched_at);

  return {
    entityKey,
    market,
    ticker,
    name,
    report,
    sources,
    bodyMarkdown,
    bullets,
    publishedAt,
    title: extractHeading(report, name),
    durableFacts: parseStringArray(row.durable_facts),
  };
}

export function buildPhase35BackfillPlan(rows: Phase35DeepCacheRow[]): Phase35BackfillPlan {
  const eligible = rows.flatMap((row) => {
    const item = toEligibleRow(row);
    return item ? [item] : [];
  });

  return {
    sourceRows: rows.length,
    eligibleRows: eligible.length,
    learningCards: eligible.map((row) => ({
      entityKey: row.entityKey,
      cardKey: 'deep-cache-summary',
      section: '심층 리서치',
      title: row.title,
      bodyMarkdown: row.bodyMarkdown,
      bullets: row.bullets,
      sources: row.sources,
      availability: row.sources.length > 0 ? 'available' : 'text_only',
      sourceKind: 'watchlist.deep_cache',
      sourceUri: `watchlist.deep_cache:${row.entityKey}`,
      derivedFromDeepCache: true,
      ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    })),
    companyProfiles: eligible.map((row) => ({
      entityKey: row.entityKey,
      symbol: row.ticker,
      market: row.market,
      name: row.name,
      summaryText: row.bodyMarkdown,
      profileJson: {
        seededFrom: 'watchlist.deep_cache',
        reportLength: row.report.length,
        durableFacts: row.durableFacts,
      },
      sourceRefs: row.sources,
      availability: 'text_only',
      ...(row.publishedAt ? { capturedAt: row.publishedAt } : {}),
    })),
  };
}

export function summarizePhase35Audit(plan: Phase35BackfillPlan): Phase35AuditSummary {
  const learningCardsWithoutSourceLinks = plan.learningCards.filter(
    (card) => card.sources.length === 0,
  ).length;
  const warnings =
    learningCardsWithoutSourceLinks > 0
      ? [
          `${learningCardsWithoutSourceLinks} learning card(s) have no URL source links and were downgraded to text_only.`,
        ]
      : [];

  return {
    deepCacheRows: plan.sourceRows,
    eligibleRows: plan.eligibleRows,
    learningCards: plan.learningCards.length,
    companyProfiles: plan.companyProfiles.length,
    availableLearningCards: plan.learningCards.filter((card) => card.availability === 'available')
      .length,
    textOnlyLearningCards: plan.learningCards.filter((card) => card.availability === 'text_only')
      .length,
    learningCardsWithoutSourceLinks,
    warnings,
  };
}

export async function loadPhase35DeepCacheRows(
  executor: Phase35ReadExecutor,
): Promise<Phase35DeepCacheRow[]> {
  return executor.queryRows(PHASE35_SOURCE_ROWS_SQL, []);
}

export async function applyPhase35BackfillPlan(
  plan: Phase35BackfillPlan,
  executor: Phase35WriteExecutor,
  options: Phase35ApplyOptions,
): Promise<Phase35ApplyResult> {
  for (const card of plan.learningCards) {
    await executor.execute(UPSERT_LEARNING_CARD_SQL, [
      card.entityKey,
      card.cardKey,
      card.section,
      card.title,
      card.bodyMarkdown,
      JSON.stringify(card.bullets),
      JSON.stringify(card.sources),
      card.availability,
      card.sourceKind,
      card.sourceUri,
      card.derivedFromDeepCache,
      card.publishedAt ?? null,
    ]);
  }

  for (const profile of plan.companyProfiles) {
    await executor.execute(UPSERT_COMPANY_PROFILE_SQL, [
      profile.entityKey,
      profile.symbol,
      profile.market,
      profile.name,
      profile.summaryText,
      JSON.stringify(profile.profileJson),
      JSON.stringify(profile.sourceRefs),
      profile.availability,
      profile.capturedAt ?? null,
    ]);
  }

  const summary = summarizePhase35Audit(plan);
  const rowsWritten = plan.learningCards.length + plan.companyProfiles.length;
  const rowsSkipped = plan.sourceRows - plan.eligibleRows + summary.learningCardsWithoutSourceLinks;
  await executor.execute(INSERT_MIGRATION_RUN_SQL, [
    options.runId,
    options.jobName,
    options.startedAt.toISOString(),
    options.finishedAt.toISOString(),
    plan.sourceRows,
    rowsWritten,
    rowsSkipped,
    JSON.stringify(summary),
  ]);

  return {
    audit: {
      rowsRead: plan.sourceRows,
      rowsWritten,
      rowsSkipped,
      summary,
    },
  };
}
