import { normalizeDeepCacheMarket, parseSourceLinks } from './phase35.ts';

import type { DataAvailability, SourceLink } from '@stock-insight/contracts';

export type Phase10DeepCacheRow = {
  entity_key: string | null;
  ticker: string | null;
  market: string | null;
  name: string | null;
  report: string | null;
  durable_facts: unknown;
  sources: unknown;
  researched_at: string | Date | null;
};

export type Phase10AnalysisJobSeed = {
  entityKey: string;
  jobKey: string;
  idempotencyKey: string;
  requestedScope: 'deep_cache_learning';
  requestedBy: 'system:phase10';
  resultDeepCacheKey: string;
  status: 'completed';
  progressPct: 100;
};

export type Phase10AnalysisJobEventSeed = {
  entityKey: string;
  eventKey: string;
  eventType: 'queued' | 'source_check' | 'learning_card' | 'glossary' | 'completed';
  message: string;
  payload: Record<string, unknown>;
};

export type Phase10LearningCardSeed = {
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

export type Phase10GlossaryTermSeed = {
  entityKey: string;
  term: string;
  normalizedTerm: string;
  definition: string;
  sources: SourceLink[];
};

export type Phase10LearningPlan = {
  sourceRows: number;
  eligibleRows: number;
  jobs: Phase10AnalysisJobSeed[];
  events: Phase10AnalysisJobEventSeed[];
  learningCards: Phase10LearningCardSeed[];
  glossaryTerms: Phase10GlossaryTermSeed[];
};

export type Phase10LearningAudit = {
  deepCacheRows: number;
  eligibleRows: number;
  analysisJobs: number;
  analysisJobEvents: number;
  learningCards: number;
  glossaryTerms: number;
  textOnlyLearningCards: number;
  warnings: string[];
};

export type Phase10ReadExecutor = {
  queryRows: <TRow extends Phase10DeepCacheRow = Phase10DeepCacheRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type Phase10WriteExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type Phase10ApplyOptions = {
  runId: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
};

export type Phase10ApplyResult = {
  audit: {
    rowsRead: number;
    rowsWritten: number;
    rowsSkipped: number;
    summary: Phase10LearningAudit;
  };
};

type EligiblePhase10Row = {
  entityKey: string;
  market: 'KR' | 'US';
  ticker: string;
  name: string;
  report: string;
  sources: SourceLink[];
  durableFacts: string[];
  publishedAt?: string;
};

const UPSERT_ANALYSIS_JOB_SQL = `
INSERT INTO public.analysis_jobs (
  job_key,
  entity_key,
  status,
  requested_scope,
  priority,
  idempotency_key,
  requested_by,
  progress_pct,
  result_deep_cache_key,
  queued_at,
  started_at,
  completed_at
) VALUES (
  $1, $2, $3, $4, 0, $5, $6, $7, $8, $9::timestamptz, $9::timestamptz, $10::timestamptz
)
ON CONFLICT (job_key) DO UPDATE SET
  status = EXCLUDED.status,
  requested_scope = EXCLUDED.requested_scope,
  idempotency_key = EXCLUDED.idempotency_key,
  requested_by = EXCLUDED.requested_by,
  progress_pct = EXCLUDED.progress_pct,
  result_deep_cache_key = EXCLUDED.result_deep_cache_key,
  started_at = EXCLUDED.started_at,
  completed_at = EXCLUDED.completed_at,
  error_code = NULL,
  error_message = NULL,
  updated_at = now()
RETURNING id
`;

const UPSERT_ANALYSIS_JOB_EVENT_SQL = `
INSERT INTO public.analysis_job_events (
  job_id,
  event_key,
  event_type,
  message,
  payload_json
) VALUES (
  $1, $2, $3, $4, $5::jsonb
)
ON CONFLICT (job_id, event_key) DO UPDATE SET
  event_type = EXCLUDED.event_type,
  message = EXCLUDED.message,
  payload_json = EXCLUDED.payload_json
`;

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

const UPSERT_GLOSSARY_TERM_SQL = `
INSERT INTO public.entity_glossary_terms (
  entity_key,
  term,
  normalized_term,
  definition,
  source_refs_json
) VALUES (
  $1, $2, $3, $4, $5::jsonb
)
ON CONFLICT (entity_key, normalized_term) DO UPDATE SET
  term = EXCLUDED.term,
  definition = EXCLUDED.definition,
  source_refs_json = EXCLUDED.source_refs_json,
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

export const PHASE10_SOURCE_ROWS_SQL = `
SELECT
  entity.entity_key,
  cache.ticker,
  CASE
    WHEN upper(cache.market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
    WHEN upper(cache.market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX', 'NMS', 'NYQ', 'NGM', 'NCM') THEN 'US'
    ELSE NULL
  END AS market,
  coalesce(nullif(cache.name, ''), entity.name) AS name,
  cache.report,
  cache.durable_facts,
  cache.sources,
  cache.researched_at
FROM watchlist.deep_cache cache
JOIN public.entities entity
  ON entity.entity_key = concat(
    CASE
      WHEN upper(cache.market) IN ('KR', 'KRX', 'KOSPI', 'KOSDAQ') THEN 'KR'
      WHEN upper(cache.market) IN ('US', 'NASDAQ', 'NYSE', 'AMEX', 'NMS', 'NYQ', 'NGM', 'NCM') THEN 'US'
      ELSE NULL
    END,
    ':',
    cache.ticker
  )
WHERE cache.ticker IS NOT NULL
  AND coalesce(cache.report, '') <> ''
  AND entity.entity_type = 'ticker'
ORDER BY entity.entity_key
`;

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

function toIsoString(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function extractHeading(report: string, fallbackName: string): string {
  for (const line of linesOf(report)) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) return match[1].trim();
  }
  return `${fallbackName} 학습 요약`;
}

function extractBodyMarkdown(report: string, fallbackName: string): string {
  for (const line of linesOf(report)) {
    if (/^#{1,6}\s+/.test(line)) continue;
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) continue;
    return line.slice(0, 700);
  }
  return `${fallbackName}에 대한 심층 리서치 캐시가 있습니다.`;
}

function extractBullets(report: string, durableFacts: string[], bodyMarkdown: string): string[] {
  const reportBullets = linesOf(report).flatMap((line) => {
    const match = /^(?:[-*•]|\d+[.)])\s+(.+?)\s*$/.exec(line);
    return match?.[1] ? [match[1].trim()] : [];
  });
  if (reportBullets.length > 0) return reportBullets.slice(0, 6);
  if (durableFacts.length > 0) return durableFacts.slice(0, 6);
  return bodyMarkdown ? [bodyMarkdown] : [];
}

export function normalizeGlossaryTerm(term: string): string {
  return term.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function toEligibleRow(row: Phase10DeepCacheRow): EligiblePhase10Row | null {
  const market = normalizeDeepCacheMarket(row.market);
  const ticker = row.ticker?.trim();
  const entityKey = row.entity_key?.trim() || (market && ticker ? `${market}:${ticker}` : '');
  const name = row.name?.trim() || ticker;
  const report = row.report?.trim();
  if (!market || !ticker || !entityKey || !name || !report) return null;

  return {
    entityKey,
    market,
    ticker,
    name,
    report,
    sources: parseSourceLinks(row.sources),
    durableFacts: parseStringArray(row.durable_facts),
    ...(toIsoString(row.researched_at) ? { publishedAt: toIsoString(row.researched_at) } : {}),
  };
}

function buildEvents(
  row: EligiblePhase10Row,
  glossaryCount: number,
): Phase10AnalysisJobEventSeed[] {
  const payloadBase = {
    entityKey: row.entityKey,
    sourceUri: `watchlist.deep_cache:${row.entityKey}`,
  };
  return [
    {
      entityKey: row.entityKey,
      eventKey: `queued:${row.entityKey}`,
      eventType: 'queued',
      message: 'deep_cache 기반 학습 갱신 작업을 기록했습니다.',
      payload: payloadBase,
    },
    {
      entityKey: row.entityKey,
      eventKey: `source-check:${row.entityKey}`,
      eventType: 'source_check',
      message: `${row.sources.length}개 출처 링크를 확인했습니다.`,
      payload: { ...payloadBase, sourceCount: row.sources.length },
    },
    {
      entityKey: row.entityKey,
      eventKey: `learning-card:${row.entityKey}`,
      eventType: 'learning_card',
      message: '심층 리서치 캐시에서 학습 카드 1개를 갱신했습니다.',
      payload: { ...payloadBase, cardKey: 'deep-cache-summary' },
    },
    {
      entityKey: row.entityKey,
      eventKey: `glossary:${row.entityKey}`,
      eventType: 'glossary',
      message: `${glossaryCount}개 용어 정의를 갱신했습니다.`,
      payload: { ...payloadBase, glossaryCount },
    },
    {
      entityKey: row.entityKey,
      eventKey: `completed:${row.entityKey}`,
      eventType: 'completed',
      message: '학습 파이프라인을 완료했습니다.',
      payload: { ...payloadBase, progressPct: 100 },
    },
  ];
}

function glossaryTermsForRow(row: EligiblePhase10Row): Phase10GlossaryTermSeed[] {
  return row.durableFacts.flatMap((fact) => {
    const match = /^([^=:：]{2,60})\s*[=:：]\s*(.+)$/u.exec(fact);
    if (!match?.[1] || !match[2]) return [];
    const term = match[1].trim();
    const definition = match[2].trim();
    const normalizedTerm = normalizeGlossaryTerm(term);
    if (!term || !definition || !normalizedTerm) return [];
    return [
      {
        entityKey: row.entityKey,
        term,
        normalizedTerm,
        definition,
        sources: row.sources,
      },
    ];
  });
}

export function buildPhase10LearningPlan(rows: Phase10DeepCacheRow[]): Phase10LearningPlan {
  const eligibleRows = rows.flatMap((row) => {
    const eligible = toEligibleRow(row);
    return eligible ? [eligible] : [];
  });
  const glossaryTerms = eligibleRows.flatMap(glossaryTermsForRow);

  return {
    sourceRows: rows.length,
    eligibleRows: eligibleRows.length,
    jobs: eligibleRows.map((row) => ({
      entityKey: row.entityKey,
      jobKey: `deep-cache-learning:${row.entityKey}`,
      idempotencyKey: `deep-cache-learning:${row.entityKey}`,
      requestedScope: 'deep_cache_learning',
      requestedBy: 'system:phase10',
      resultDeepCacheKey: `watchlist.deep_cache:${row.entityKey}`,
      status: 'completed',
      progressPct: 100,
    })),
    events: eligibleRows.flatMap((row) => {
      const glossaryCount = glossaryTerms.filter((term) => term.entityKey === row.entityKey).length;
      return buildEvents(row, glossaryCount);
    }),
    learningCards: eligibleRows.map((row) => {
      const bodyMarkdown = extractBodyMarkdown(row.report, row.name);
      return {
        entityKey: row.entityKey,
        cardKey: 'deep-cache-summary',
        section: '심층 리서치',
        title: extractHeading(row.report, row.name),
        bodyMarkdown,
        bullets: extractBullets(row.report, row.durableFacts, bodyMarkdown),
        sources: row.sources,
        availability: row.sources.length > 0 ? 'available' : 'text_only',
        sourceKind: 'watchlist.deep_cache',
        sourceUri: `watchlist.deep_cache:${row.entityKey}`,
        derivedFromDeepCache: true,
        ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
      };
    }),
    glossaryTerms,
  };
}

export function summarizePhase10LearningAudit(plan: Phase10LearningPlan): Phase10LearningAudit {
  const textOnlyLearningCards = plan.learningCards.filter(
    (card) => card.availability === 'text_only',
  ).length;
  return {
    deepCacheRows: plan.sourceRows,
    eligibleRows: plan.eligibleRows,
    analysisJobs: plan.jobs.length,
    analysisJobEvents: plan.events.length,
    learningCards: plan.learningCards.length,
    glossaryTerms: plan.glossaryTerms.length,
    textOnlyLearningCards,
    warnings:
      textOnlyLearningCards > 0
        ? [
            `${textOnlyLearningCards} learning card(s) have no URL source links and stayed text_only.`,
          ]
        : [],
  };
}

export async function loadPhase10DeepCacheRows(
  executor: Phase10ReadExecutor,
): Promise<Phase10DeepCacheRow[]> {
  return executor.queryRows(PHASE10_SOURCE_ROWS_SQL, []);
}

function numericId(row: Record<string, unknown> | undefined): number {
  const value = row?.id;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('analysis job upsert did not return an id');
}

export async function applyPhase10LearningPlan(
  plan: Phase10LearningPlan,
  executor: Phase10WriteExecutor,
  options: Phase10ApplyOptions,
): Promise<Phase10ApplyResult> {
  const jobIds = new Map<string, number>();

  for (const job of plan.jobs) {
    const [row] = await executor.queryRows(UPSERT_ANALYSIS_JOB_SQL, [
      job.jobKey,
      job.entityKey,
      job.status,
      job.requestedScope,
      job.idempotencyKey,
      job.requestedBy,
      job.progressPct,
      job.resultDeepCacheKey,
      options.startedAt.toISOString(),
      options.finishedAt.toISOString(),
    ]);
    jobIds.set(job.entityKey, numericId(row));
  }

  for (const event of plan.events) {
    const jobId = jobIds.get(event.entityKey);
    if (!jobId) throw new Error(`missing analysis job id for ${event.entityKey}`);
    await executor.queryRows(UPSERT_ANALYSIS_JOB_EVENT_SQL, [
      jobId,
      event.eventKey,
      event.eventType,
      event.message,
      JSON.stringify(event.payload),
    ]);
  }

  for (const card of plan.learningCards) {
    await executor.queryRows(UPSERT_LEARNING_CARD_SQL, [
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

  for (const term of plan.glossaryTerms) {
    await executor.queryRows(UPSERT_GLOSSARY_TERM_SQL, [
      term.entityKey,
      term.term,
      term.normalizedTerm,
      term.definition,
      JSON.stringify(term.sources),
    ]);
  }

  const summary = summarizePhase10LearningAudit(plan);
  const rowsWritten =
    plan.jobs.length + plan.events.length + plan.learningCards.length + plan.glossaryTerms.length;
  const rowsSkipped = plan.sourceRows - plan.eligibleRows;
  await executor.queryRows(INSERT_MIGRATION_RUN_SQL, [
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
