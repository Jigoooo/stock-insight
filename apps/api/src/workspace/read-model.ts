import { getScheduledCalendar } from './calendar-read-model.ts';
import { getMarketIndicators } from './macro-read-model.ts';

import { MARKET_DATA_AS_OF_EXPR, MARKET_DATA_AS_OF_SQL } from '../shared/market-snapshots.ts';

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

type MarketAsOfRow = { market_data_as_of: string | null };
type WorkspaceTodaySummaryRow = MarketAsOfRow & {
  relation_count: number | string;
  watchlist_count: number | string;
};

/**
 * 발행 프로젝션의 상태를 계약 어휘로 옮긴다.
 *
 * 세 갈래를 **서로 다르게** 유지하는 것이 요점이다(UX 헌법 6번).
 * - `available` 이고 아직 유효 → `available`
 * - `available` 인데 유효 시각이 지났거나 원장이 `stale` → `stale`(오래된 자료)
 * - `invalid` → `error`. 오래된 것이 아니라 **믿을 수 없는** 것이다.
 *
 * `invalid` 를 `stale` 로 뭉개면 깨진 프로젝션이 "조금 지난 자료" 로 읽힌다.
 * 라이브에 실제로 invalid 22행이 있으므로 가정이 아니라 현재 상태다.
 */
function projectionFreshness(
  projectionStatus: string,
  freshUntil: string,
  now: Date,
): 'available' | 'stale' | 'error' {
  if (projectionStatus === 'invalid') return 'error';
  return projectionStatus === 'available' && now.getTime() <= new Date(freshUntil).getTime()
    ? 'available'
    : 'stale';
}

/**
 * **`projection_status` 로 거르지 않는다.** 거르면 오래된 데이터가 없는 데이터가 된다.
 *
 * 이 자리는 `WHERE ... AND projection_status = 'available'` 이었다. 그러면 발행
 * 프로젝션이 만료되는 순간 0행이 되고, 아래 호출부가 그것을 예외로 바꾼다 —
 * today 화면 전체가 "워크스페이스를 불러오지 못했습니다" 로 죽는다.
 *
 * 라이브에서 실제로 죽어 있었다(2026-08-12 09:25Z 확인). `ops.publication_
 * projection_status` 의 stock 행 47개가 invalid 22 · stale 25 로, `available` 이
 * **하나도 없었다.** 가장 최근 프로젝션의 `fresh_until` 이 같은 날 07:05Z 였으니,
 * 매일 그 시각에 화면이 죽고 다음 발행까지 돌아오지 않는다.
 *
 * UX 헌법 6번이 뒤집힌 모양이다. 그 조항은 loading·error·empty·ready·stale 을
 * 서로 구분하고 API 오류를 empty 로 위장하지 말라고 하는데, 여기서는 반대로
 * **상태여야 할 것이 오류가 됐다.** 하루 지난 브리핑은 오류가 아니라 오래된
 * 브리핑이고, 사용자는 기준 시각과 함께 그것을 읽을 수 있어야 한다.
 *
 * 신선도 판정은 이미 아래에 있다(`freshness = ... ? 'available' : 'stale'`).
 * 그 분기는 이 필터 때문에 사실상 도달하지 못하고 있었다 — 상태를 계산해 놓고
 * 그 상태가 될 수 있는 행을 SQL 이 먼저 버렸다.
 *
 * 행이 정말 0개일 때만 예외로 남는다. 그건 진짜 부재다.
 */
const LATEST_RUN_SQL = `
  SELECT analysis_run_id, analysis_revision, cutoff_at, source_watermark_at,
         fresh_until, projection_status
  FROM ops.publication_projection_status
  WHERE domain = 'stock'
  ORDER BY cutoff_at DESC, analysis_revision DESC
  LIMIT 1
`;

// The user filter lives INSIDE the aggregate on purpose. Joining
// public.v_user_feed_dedup and filtering user_id on the join condition let the
// planner put the whole view on the inner side of a nested loop, so it
// re-aggregated every user's feed rows once per publication row
// (loops=124 x 34k rows, 4.7M buffers, ~7s). Filtering first turns that into a
// single 35k-row scan. MATERIALIZED is load-bearing: without it the planner is
// free to inline the CTE and rebuild the same nested loop.
const FEED_SQL = `
  WITH relevance AS MATERIALIZED (
    SELECT
      fi.record_id,
      bool_or(fi.relevance_kind = 'direct') AS has_direct,
      bool_or(fi.relevance_kind = 'related') AS has_related,
      bool_or(fi.relevance_kind = 'indirect') AS has_indirect,
      min(fi.hops) FILTER (WHERE fi.relevance_kind IN ('indirect', 'related'))
        AS min_indirect_hops,
      CASE
        WHEN bool_or(fi.relevance_kind = 'direct') THEN 'direct'
        WHEN bool_or(fi.relevance_kind = 'related') THEN 'related'
        ELSE 'indirect'
      END AS primary_kind,
      (array_agg(fi.reason ORDER BY fi.relevance_score DESC))[1] AS top_reason
    FROM public.user_feed_index fi
    WHERE fi.user_id = $1::uuid
    GROUP BY fi.record_id
  ),
  source_links AS (
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
  LEFT JOIN relevance ON relevance.record_id = publication.id
  LEFT JOIN source_links ON source_links.record_key = publication.record_key
  WHERE publication.analysis_run_id = $2
    AND publication.analysis_revision = $3
    AND publication.domain = 'stock'
    AND publication.market IN ('KR', 'US', 'GLOBAL')
    AND publication.lifecycle_state = 'active'
  ORDER BY coalesce(publication.published_at, publication.created_at) DESC,
           publication.record_key ASC
`;

const WORKSPACE_TODAY_SUMMARY_SQL = `
  SELECT
    coalesce((
      SELECT snapshot.edge_count
      FROM analytics.graph_snapshot snapshot
      WHERE snapshot.status = 'sealed'
        AND snapshot.as_of <= $1::timestamptz
        AND snapshot.known_at <= $1::timestamptz
      ORDER BY snapshot.as_of DESC, snapshot.known_at DESC, snapshot.graph_snapshot_id DESC
      LIMIT 1
    ), 0)::int AS relation_count,
    (
      SELECT count(*)::int
      FROM public.user_watchlist
      WHERE user_id = $2::uuid
        AND active = true
    ) AS watchlist_count,
    ${MARKET_DATA_AS_OF_EXPR} AS market_data_as_of
`;

const MARKET_AS_OF_SQL = MARKET_DATA_AS_OF_SQL;

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
  const [summaryRow] = await executor.queryRows<WorkspaceTodaySummaryRow>(
    WORKSPACE_TODAY_SUMMARY_SQL,
    [cutoffAt, options.userScope.userId],
  );

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
  const freshness = projectionFreshness(latestRun.projection_status, freshUntil, now);
  const qualityFlags: string[] = [];
  if (linkedRecords < feedRows.length) qualityFlags.push('source_link_partial');
  if (clickableRecords < linkedRecords) qualityFlags.push('source_url_partial');

  /*
    거시 지표는 발행 프로젝션과 무관한 **시장 단위** 자료다. 그래서 실패를
    격리한다 — 거시 조회가 넘어져도 오늘 브리핑 전체를 죽이지 않는다.

    이 payload 안에 둔 것은 타협이다. 원래는 독립 엔드포인트가 맞다(거시는
    발행과 아무 관계가 없다). 다만 오늘 그 결합의 실질적 위험은 하나뿐이다 —
    `ops.publication_projection_status` 가 **완전히 비면** 위에서 예외가 나고
    거시까지 함께 사라진다. 그 표에 행이 하나라도 있으면 이제 stale 로 내려가
    화면이 산다. 그 전제가 깨지는 날(신규 설치·ops 초기화) 이 섹션을 별도
    엔드포인트로 떼는 것이 다음 단계다.
  */
  const marketIndicators = await getMarketIndicators(executor, { now }).catch((error: unknown) => {
    // 삼키되 **말은 한다.** 조용한 빈 배열은 "지표가 없다" 와 "조회가 실패했다" 를
    // 같게 만들고, 실제로 그 둘을 구별하지 못해 한 번 헤맸다.
    console.error('market indicators unavailable', error);
    return [];
  });

  const calendar = await getScheduledCalendar(executor, { now }).catch((error: unknown) => {
    console.error('scheduled calendar unavailable', error);
    return { events: [], totalUpcoming: 0 };
  });

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
        marketDataAsOf: summaryRow?.market_data_as_of ? toIso(summaryRow.market_data_as_of) : null,
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
      relationCount: toCount(summaryRow?.relation_count),
      watchlistCount: toCount(summaryRow?.watchlist_count),
      sourceCount,
    },
    lanes,
    marketIndicators,
    upcomingEvents: calendar.events,
    upcomingEventTotal: calendar.totalUpcoming,
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
      freshness: projectionFreshness(latestRun.projection_status, freshUntil, now),
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
