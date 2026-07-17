import type { UserScope } from '../shared/user-scope';

import {
  researchFeedPageSchema,
  workspaceTodaySchema,
  type ResearchFeedItem,
  type ResearchFeedLane,
  type ResearchFeedLaneId,
  type ResearchFeedPage,
  type WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type WorkspaceRowQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetWorkspaceTodayOptions = {
  userScope: UserScope;
  now?: Date;
  laneLimit?: number;
};

export type GetResearchFeedPageOptions = {
  userScope: UserScope;
  lane: ResearchFeedLaneId;
  cursor?: string;
  limit?: number;
  now?: Date;
};

type LatestRunRow = {
  analysis_run_id: string;
  analysis_revision: number;
  cutoff_at: string | Date;
  source_watermark_at: string | Date;
  fresh_until: string | Date;
  projection_status: string;
};

type FeedRow = {
  record_key: string;
  record_type: string;
  market: string;
  entity_key: string | null;
  title: string;
  summary: string;
  published_at: string | Date;
  confidence: string | null;
  quality_flags: string[] | null;
  has_direct: boolean | null;
  has_related: boolean | null;
  has_indirect: boolean | null;
  min_indirect_hops: number | null;
  primary_kind: string | null;
  top_reason: string | null;
  source_count: number | string;
  clickable_source_count: number | string;
};

type CountRow = { relation_count?: number | string; watchlist_count?: number | string };
type MarketAsOfRow = { market_data_as_of: string | null };

const LATEST_RUN_SQL = `
  SELECT analysis_run_id, analysis_revision, cutoff_at, source_watermark_at,
         fresh_until, projection_status
  FROM ops.publication_projection_status
  WHERE domain = 'stock'
    AND projection_status = 'available'
  ORDER BY cutoff_at DESC, analysis_revision DESC
  LIMIT 1
`;

const FEED_SQL = `
  WITH source_links AS (
    SELECT
      ars.record_key,
      count(*)::int AS source_count,
      count(*) FILTER (WHERE nullif(source_revision.url, '') IS NOT NULL)::int
        AS clickable_source_count
    FROM ops.analysis_run_record_source ars
    LEFT JOIN LATERAL (
      SELECT revision.url
      FROM ops.source_document_revision revision
      WHERE revision.source_key = ars.source_key
        AND revision.known_at <= $4::timestamptz
      ORDER BY revision.known_at DESC, revision.revision_no DESC
      LIMIT 1
    ) source_revision ON true
    WHERE ars.analysis_run_id = $2
      AND ars.revision = $3
      AND ars.lifecycle_state = 'active'
    GROUP BY ars.record_key
  )
  SELECT
    publication.record_key,
    publication.record_type,
    publication.market,
    publication.entity_key,
    publication.title,
    coalesce(nullif(publication.summary_text, ''), nullif(publication.body_text, ''), publication.title)
      AS summary,
    coalesce(publication.published_at, publication.created_at) AS published_at,
    publication.confidence,
    publication.quality_flags,
    relevance.has_direct,
    relevance.has_related,
    relevance.has_indirect,
    relevance.min_indirect_hops,
    relevance.primary_kind,
    relevance.top_reason,
    coalesce(source_links.source_count, 0)::int AS source_count,
    coalesce(source_links.clickable_source_count, 0)::int AS clickable_source_count
  FROM ops.internal_web_publication_records publication
  LEFT JOIN public.v_user_feed_dedup relevance
    ON relevance.user_id = $1::uuid
   AND relevance.record_id = publication.id
  LEFT JOIN source_links ON source_links.record_key = publication.record_key
  WHERE publication.analysis_run_id = $2
    AND publication.analysis_revision = $3
    AND publication.domain = 'stock'
    AND publication.market IN ('KR', 'US', 'GLOBAL')
    AND publication.lifecycle_state = 'active'
  ORDER BY coalesce(publication.published_at, publication.created_at) DESC,
           publication.record_key ASC
`;

const RELATION_COUNT_SQL = `
  SELECT count(*)::int AS relation_count
  FROM ops.current_temporal_graph_edge
  WHERE approved = true
    AND inferred = false
    AND known_at <= $1::timestamptz
`;

const WATCHLIST_COUNT_SQL = `
  SELECT count(*)::int AS watchlist_count
  FROM public.user_watchlist
  WHERE user_id = $1::uuid
    AND active = true
`;

const MARKET_AS_OF_SQL = `
  SELECT max(coalesce(nullif(collected_at, ''), nullif(snapshot_date, ''))) AS market_data_as_of
  FROM stock.market_snapshots
  WHERE symbol IS NOT NULL
`;

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Database returned an invalid timestamp');
  return date.toISOString();
}

function toCount(value: number | string | undefined): number {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('Database returned an invalid count');
  return count;
}

function normalizeQuality(value: string | null): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizeMarket(row: FeedRow): ResearchFeedItem['market'] {
  if (row.record_type === 'macro_observation') return 'MACRO';
  if (row.market === 'GLOBAL') return 'GLOBAL';
  return row.market === 'US' ? 'US' : 'KR';
}

function relevanceFor(row: FeedRow): ResearchFeedItem['relevance'] {
  if (row.has_direct) return { kind: 'direct', hops: 0 };
  if (row.has_related) return { kind: 'related', hops: 1 };
  if (row.has_indirect) return { kind: 'indirect', hops: row.min_indirect_hops ?? 2 };
  if (row.record_type === 'candidate') return { kind: 'discovery', hops: null };
  return { kind: 'market', hops: null };
}

function whySurfaced(row: FeedRow, relevance: ResearchFeedItem['relevance']): string {
  if (row.top_reason?.trim()) return row.top_reason.trim();
  switch (relevance.kind) {
    case 'direct':
      return '관심 종목과 직접 관련된 최신 리서치';
    case 'related':
      return '관심 종목과 연결된 연관 리서치';
    case 'indirect':
      return `${relevance.hops ?? 2}단계 관계로 연결된 리서치`;
    case 'discovery':
      return '관심 목록 밖에서 발견된 새 리서치 후보';
    case 'market':
      return '현재 시장에서 확인할 변화';
  }
  return '현재 확인할 리서치 변화';
}

function mapFeedItem(row: FeedRow): ResearchFeedItem {
  const sourceCount = toCount(row.source_count);
  const clickableSourceCount = toCount(row.clickable_source_count);
  const relevance = relevanceFor(row);
  const qualityFlags = new Set(row.quality_flags ?? []);
  if (sourceCount === 0) qualityFlags.add('source_missing');
  else if (clickableSourceCount === 0) qualityFlags.add('attribution_only');
  else if (clickableSourceCount < sourceCount) qualityFlags.add('source_url_partial');

  return {
    recordKey: row.record_key,
    recordType: row.record_type,
    market: normalizeMarket(row),
    title: row.title,
    summary: row.summary,
    publishedAt: toIso(row.published_at),
    affectedEntityKeys:
      row.entity_key &&
      /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/.test(row.entity_key)
        ? [row.entity_key]
        : [],
    whySurfaced: whySurfaced(row, relevance),
    relevance,
    confidence: normalizeQuality(row.confidence),
    sourceCoverage: {
      linked: sourceCount,
      clickable: clickableSourceCount,
      total: sourceCount,
    },
    qualityFlags: [...qualityFlags],
  };
}

function laneFor(row: FeedRow): ResearchFeedLaneId {
  if (row.record_type === 'briefing' || row.has_direct || row.has_related) return 'must_know';
  if (row.has_indirect || row.primary_kind) return 'for_you';
  return 'explore';
}

function encodeCursor(lane: ResearchFeedLaneId, item: ResearchFeedItem): string {
  return Buffer.from(
    JSON.stringify({ version: 1, lane, publishedAt: item.publishedAt, recordKey: item.recordKey }),
  ).toString('base64url');
}

function decodeCursor(cursor: string, lane: ResearchFeedLaneId) {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      version?: unknown;
      lane?: unknown;
      publishedAt?: unknown;
      recordKey?: unknown;
    };
    if (
      payload.version !== 1 ||
      payload.lane !== lane ||
      typeof payload.publishedAt !== 'string' ||
      typeof payload.recordKey !== 'string'
    ) {
      throw new Error('invalid cursor payload');
    }
    return { publishedAt: payload.publishedAt, recordKey: payload.recordKey };
  } catch {
    throw new Error('cursor is invalid for the requested feed lane');
  }
}

function buildLane(
  lane: ResearchFeedLaneId,
  items: ResearchFeedItem[],
  limit: number,
): ResearchFeedLane {
  const page = items.slice(0, limit);
  return {
    lane,
    scopeTotal: items.length,
    items: page,
    nextCursor:
      items.length > page.length && page.length > 0 ? encodeCursor(lane, page.at(-1)!) : null,
  };
}

export async function getWorkspaceToday(
  executor: WorkspaceRowQueryExecutor,
  options: GetWorkspaceTodayOptions,
): Promise<WorkspaceToday> {
  const now = options.now ?? new Date();
  const laneLimit = options.laneLimit ?? 24;
  if (!Number.isInteger(laneLimit) || laneLimit < 1 || laneLimit > 50) {
    throw new Error('laneLimit must be an integer between 1 and 50');
  }

  const [latestRun] = await executor.queryRows<LatestRunRow>(LATEST_RUN_SQL);
  if (!latestRun) throw new Error('No available stock publication projection exists');

  const cutoffAt = toIso(latestRun.cutoff_at);
  const feedRows = await executor.queryRows<FeedRow>(FEED_SQL, [
    options.userScope.userId,
    latestRun.analysis_run_id,
    latestRun.analysis_revision,
    cutoffAt,
  ]);
  const [relationRow] = await executor.queryRows<CountRow>(RELATION_COUNT_SQL, [cutoffAt]);
  const [watchlistRow] = await executor.queryRows<CountRow>(WATCHLIST_COUNT_SQL, [
    options.userScope.userId,
  ]);
  const [marketRow] = await executor.queryRows<MarketAsOfRow>(MARKET_AS_OF_SQL);

  const grouped: Record<ResearchFeedLaneId, ResearchFeedItem[]> = {
    must_know: [],
    for_you: [],
    explore: [],
  };
  for (const row of feedRows) grouped[laneFor(row)]!.push(mapFeedItem(row));

  const lanes = [
    buildLane('must_know', grouped.must_know!, Math.min(laneLimit, 12)),
    buildLane('for_you', grouped.for_you!, laneLimit),
    buildLane('explore', grouped.explore!, laneLimit),
  ] satisfies ResearchFeedLane[];
  const returnedItems = lanes.flatMap(({ items }) => items);
  const linkedRecords = feedRows.filter((row) => toCount(row.source_count) > 0).length;
  const clickableRecords = feedRows.filter((row) => toCount(row.clickable_source_count) > 0).length;
  const sourceCount = feedRows.reduce((sum, row) => sum + toCount(row.source_count), 0);
  const freshUntil = toIso(latestRun.fresh_until);
  const freshness =
    latestRun.projection_status === 'available' && now.getTime() <= new Date(freshUntil).getTime()
      ? 'available'
      : 'stale';
  const qualityFlags: string[] = [];
  if (linkedRecords < feedRows.length) qualityFlags.push('source_link_partial');
  if (clickableRecords < linkedRecords) qualityFlags.push('source_url_partial');

  return workspaceTodaySchema.parse({
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt: now.toISOString(),
      freshness,
      contentSnapshot: {
        analysisRunId: latestRun.analysis_run_id,
        analysisRevision: latestRun.analysis_revision,
        analysisCutoffAt: cutoffAt,
        sourceWatermarkAt: toIso(latestRun.source_watermark_at),
        freshUntil,
      },
      graphSnapshot: {
        requestedAsOf: cutoffAt,
        knownThroughAt: cutoffAt,
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: {
        marketDataAsOf: marketRow?.market_data_as_of ? toIso(marketRow.market_data_as_of) : null,
      },
      sourceCoverage: {
        linked: linkedRecords,
        clickable: clickableRecords,
        total: feedRows.length,
      },
      qualityFlags,
    },
    summary: {
      laneItemCount: returnedItems.length,
      relationCount: toCount(relationRow?.relation_count),
      watchlistCount: toCount(watchlistRow?.watchlist_count),
      sourceCount,
    },
    lanes,
    defaultRecordKey: returnedItems[0]?.recordKey ?? null,
  });
}

export async function getResearchFeedPage(
  executor: WorkspaceRowQueryExecutor,
  options: GetResearchFeedPageOptions,
): Promise<ResearchFeedPage> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('limit must be an integer between 1 and 50');
  }

  const [latestRun] = await executor.queryRows<LatestRunRow>(LATEST_RUN_SQL);
  if (!latestRun) throw new Error('No available stock publication projection exists');
  const cutoffAt = toIso(latestRun.cutoff_at);
  const feedRows = await executor.queryRows<FeedRow>(FEED_SQL, [
    options.userScope.userId,
    latestRun.analysis_run_id,
    latestRun.analysis_revision,
    cutoffAt,
  ]);
  const [marketRow] = await executor.queryRows<MarketAsOfRow>(MARKET_AS_OF_SQL);
  const laneItems = feedRows
    .filter((row) => laneFor(row) === options.lane)
    .map((row) => mapFeedItem(row));
  let startIndex = 0;
  if (options.cursor) {
    const anchor = decodeCursor(options.cursor, options.lane);
    const anchorIndex = laneItems.findIndex(
      (item) => item.recordKey === anchor.recordKey && item.publishedAt === anchor.publishedAt,
    );
    if (anchorIndex < 0) throw new Error('cursor anchor is not present in the current snapshot');
    startIndex = anchorIndex + 1;
  }
  const items = laneItems.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + items.length < laneItems.length && items.length > 0
      ? encodeCursor(options.lane, items.at(-1)!)
      : null;
  const linkedRecords = feedRows.filter((row) => toCount(row.source_count) > 0).length;
  const clickableRecords = feedRows.filter((row) => toCount(row.clickable_source_count) > 0).length;
  const qualityFlags: string[] = [];
  if (linkedRecords < feedRows.length) qualityFlags.push('source_link_partial');
  if (clickableRecords < linkedRecords) qualityFlags.push('source_url_partial');
  const freshUntil = toIso(latestRun.fresh_until);

  return researchFeedPageSchema.parse({
    meta: {
      schemaVersion: 'v3',
      visibility: 'internal',
      generatedAt: now.toISOString(),
      freshness:
        latestRun.projection_status === 'available' &&
        now.getTime() <= new Date(freshUntil).getTime()
          ? 'available'
          : 'stale',
      contentSnapshot: {
        analysisRunId: latestRun.analysis_run_id,
        analysisRevision: latestRun.analysis_revision,
        analysisCutoffAt: cutoffAt,
        sourceWatermarkAt: toIso(latestRun.source_watermark_at),
        freshUntil,
      },
      graphSnapshot: {
        requestedAsOf: cutoffAt,
        knownThroughAt: cutoffAt,
        edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
      },
      marketSnapshot: {
        marketDataAsOf: marketRow?.market_data_as_of ? toIso(marketRow.market_data_as_of) : null,
      },
      sourceCoverage: {
        linked: linkedRecords,
        clickable: clickableRecords,
        total: feedRows.length,
      },
      qualityFlags,
    },
    lane: options.lane,
    scopeTotal: laneItems.length,
    items,
    nextCursor,
  });
}
