import { containsActionAdvice } from '../shared/action-advice.ts';
import { isProjectionFresh, latestProjectionAt } from '../shared/projection-freshness.ts';

import {
  MARKET_TOPIC_NEWS_MAX_ITEMS,
  marketTopicNewsPageSchema,
  type MarketTopicNewsPage,
} from '@stock-insight/contracts/research-workspace';

// Market-wide news: events that carry market vocabulary and name no company.
//
// This is a different surface from apps/api/src/market-news, which reads the
// legacy public.v_user_feed_dedup and public.source_documents. Same two words in
// the name, unrelated id spaces — keep them apart.
//
// Measured 2026-08-03 against serving.v_knowledge_event_current_v1:
//
//   current observations              4,000
//     attributed to a company         3,099
//     unattributed                      901   every one has summary text
//       matching market vocabulary       86   under case-insensitive matching
//                                        83   under case-sensitive matching
//
// Case-insensitive is the choice, and the three events it adds are the argument:
// 6675, 6866 and 6968 all say "Treasury" where migration 063 seeded "treasury".
// All three are genuine market news (30-year yield, US Treasury intervening in
// the yen). Case-sensitive matching produced no item that case-insensitive
// missed, so the diff is three gained and none lost.
//
// That means this surface reports 86 where the 2026-08-03 handoff,
// data-health-baseline.json and the 063 comment all say 83. The number moved
// because the matching rule changed here, not because the corpus did.

export type MarketTopicNewsQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetMarketTopicNewsOptions = { now?: Date };

type MatchedTermRow = { topic: string; term: string };

type NewsRow = {
  event_key: string;
  summary_text: string;
  occurred_at: string | Date;
  published_at: string | Date | null;
  source_name: string | null;
  url: string | null;
  duplicate_count: number | string;
  matched_terms: MatchedTermRow[] | null;
};

type TotalsRow = {
  active_term_count: number | string;
  unattributed_total: number | string;
  matched_total: number | string;
};

type TermCountRow = { topic: string; term: string; events: number | string };

// Kept equal to the contract's MARKET_TOPIC_NEWS_MAX_ITEMS.
const MARKET_TOPIC_NEWS_LIMIT = MARKET_TOPIC_NEWS_MAX_ITEMS;

// Every predicate below is `position(lower(term) in lower(summary)) > 0`:
// substring matching, not a word boundary. Korean particles attach directly to
// nouns, so \y cannot separate 금리로 from 중금리 — migration 063 answers that with
// a length floor on the term instead, and this query must not quietly add a rule
// the vocabulary was not written for. Changing one copy and not the others would
// make matchedTotal disagree with the item list, so change them together.
//
// One statement so the collapse and the term aggregation see the same rows.
//
// The window count runs before DISTINCT ON, so duplicate_count is the size of the
// whole identical-summary group while only the newest member survives to render.
const MARKET_TOPIC_NEWS_SQL = `
WITH candidate AS (
  SELECT event_id, event_key, summary_text, occurred_at, source_document_id
  FROM serving.v_knowledge_event_current_v1
  WHERE target_entity_id IS NULL
    AND summary_text IS NOT NULL
), matched_event AS (
  SELECT candidate.*
  FROM candidate
  WHERE EXISTS (
    SELECT 1 FROM analytics.market_topic_term term
    WHERE term.active
      AND position(lower(term.term) in lower(candidate.summary_text)) > 0
  )
), collapsed AS (
  SELECT DISTINCT ON (summary_text)
         event_key,
         summary_text,
         occurred_at,
         source_document_id,
         count(*) OVER (PARTITION BY summary_text)::int AS duplicate_count
  FROM matched_event
  ORDER BY summary_text, occurred_at DESC, event_id DESC
)
SELECT
  collapsed.event_key,
  collapsed.summary_text,
  collapsed.occurred_at,
  document.published_at,
  nullif(btrim(coalesce(source.provider_key, '')), '') AS source_name,
  nullif(btrim(coalesce(document.canonical_url, '')), '') AS url,
  collapsed.duplicate_count,
  (
    SELECT jsonb_agg(jsonb_build_object('topic', term.topic, 'term', term.term)
                     ORDER BY term.topic, term.term)
    FROM analytics.market_topic_term term
    WHERE term.active
      AND position(lower(term.term) in lower(collapsed.summary_text)) > 0
  ) AS matched_terms
FROM collapsed
LEFT JOIN knowledge.document document
  ON document.document_id = collapsed.source_document_id
LEFT JOIN ingestion.source source
  ON source.source_id = document.source_id
ORDER BY collapsed.occurred_at DESC, collapsed.event_key DESC
LIMIT ${MARKET_TOPIC_NEWS_LIMIT}
`;

// matched_total counts events, not surviving rows. The item list is shorter
// because identical summaries collapse; sum(duplicateCount) reconciles the two.
const MARKET_TOPIC_NEWS_TOTALS_SQL = `
WITH candidate AS (
  SELECT event_id, summary_text
  FROM serving.v_knowledge_event_current_v1
  WHERE target_entity_id IS NULL
    AND summary_text IS NOT NULL
)
SELECT
  (SELECT count(*) FROM analytics.market_topic_term term WHERE term.active)::int
    AS active_term_count,
  (SELECT count(*) FROM candidate)::int AS unattributed_total,
  (SELECT count(*) FROM candidate
    WHERE EXISTS (
      SELECT 1 FROM analytics.market_topic_term term
      WHERE term.active
        AND position(lower(term.term) in lower(candidate.summary_text)) > 0
    ))::int AS matched_total
`;

// Per-term counts are the point of the surface, not a summary of it: a term that
// catches two events is a term a reader can check by hand and delete a row for.
// Terms that catch nothing are listed too — a dead term is also a judgement.
const MARKET_TOPIC_TERM_COUNT_SQL = `
WITH candidate AS (
  SELECT event_id, summary_text
  FROM serving.v_knowledge_event_current_v1
  WHERE target_entity_id IS NULL
    AND summary_text IS NOT NULL
)
SELECT term.topic,
       term.term,
       count(candidate.event_id)::int AS events
FROM analytics.market_topic_term term
LEFT JOIN candidate
  ON position(lower(term.term) in lower(candidate.summary_text)) > 0
WHERE term.active
GROUP BY term.topic, term.term
ORDER BY events DESC, term.topic ASC, term.term ASC
LIMIT 200
`;

function toCount(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('Database returned an invalid count');
  return count;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid timestamp');
  return date.toISOString();
}

function requiredIso(value: string | Date): string {
  const iso = toIso(value);
  if (iso === null) throw new Error('Database returned a missing timestamp');
  return iso;
}

function httpUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function mapItem(row: NewsRow) {
  const matchedTerms = (row.matched_terms ?? []).map(({ topic, term }) => ({ topic, term }));
  // A row that matched in the WHERE clause but carries no terms here means the
  // two predicates disagreed. Dropping it beats rendering an item that cannot
  // say why it is listed.
  if (matchedTerms.length === 0) return null;
  return {
    eventKey: row.event_key,
    summary: row.summary_text,
    matchedTerms,
    occurredAt: requiredIso(row.occurred_at),
    publishedAt: toIso(row.published_at),
    sourceName: row.source_name,
    url: httpUrl(row.url),
    // count(*) OVER is never zero. If it is, the contract's positive() rejects it
    // rather than this line quietly rounding the anomaly up to one.
    duplicateCount: toCount(row.duplicate_count),
  };
}

export async function getMarketTopicNews(
  executor: MarketTopicNewsQueryExecutor,
  options: GetMarketTopicNewsOptions = {},
): Promise<MarketTopicNewsPage> {
  const now = options.now ?? new Date();
  const [totals] = await executor.queryRows<TotalsRow>(MARKET_TOPIC_NEWS_TOTALS_SQL);
  const newsRows = await executor.queryRows<NewsRow>(MARKET_TOPIC_NEWS_SQL);
  const termCountRows = await executor.queryRows<TermCountRow>(MARKET_TOPIC_TERM_COUNT_SQL);

  const items = newsRows
    .map(mapItem)
    .filter((item) => item !== null)
    // The read-only product contract applies here as it does on every other news
    // surface: an item that reads as an instruction to trade never renders.
    .filter((item) => !containsActionAdvice(item.summary));

  const latestAt = latestProjectionAt(items.map((item) => item.publishedAt ?? item.occurredAt));
  const availability =
    items.length === 0 ? 'collecting' : isProjectionFresh(latestAt, now) ? 'available' : 'stale';

  return marketTopicNewsPageSchema.parse({
    generatedAt: now.toISOString(),
    availability,
    activeTermCount: toCount(totals?.active_term_count ?? 0),
    unattributedTotal: toCount(totals?.unattributed_total ?? 0),
    matchedTotal: toCount(totals?.matched_total ?? 0),
    items,
    termCounts: termCountRows.map((row) => ({
      topic: row.topic,
      term: row.term,
      events: toCount(row.events),
    })),
  });
}
