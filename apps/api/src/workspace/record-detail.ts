import type { UserScope } from '../shared/user-scope';

import {
  researchRecordDetailSchema,
  type ResearchRecordDetail,
} from '@stock-insight/contracts/research-workspace';

export type RecordDetailRowQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetResearchRecordDetailOptions = {
  userScope: UserScope;
  recordKey: string;
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

type DetailRow = {
  record_key: string;
  record_type: string;
  market: string;
  entity_key: string | null;
  title: string;
  summary: string;
  body: string;
  category: string | null;
  published_at: string | Date;
  confidence: string | null;
  quality_flags: string[] | null;
  has_direct: boolean | null;
  has_related: boolean | null;
  has_indirect: boolean | null;
  min_indirect_hops: number | null;
  primary_kind: string | null;
  top_reason: string | null;
};

type SourceRow = {
  source_key: string;
  attribution_text: string | null;
  url: string | null;
  published_at: string | Date | null;
  cutoff_content_hash: string | null;
  current_content_hash: string | null;
  used_claim: string | null;
};

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

const DETAIL_SQL = `
  SELECT
    publication.record_key,
    publication.record_type,
    publication.market,
    publication.entity_key,
    publication.title,
    coalesce(nullif(publication.summary_text, ''), nullif(publication.body_text, ''), publication.title)
      AS summary,
    coalesce(nullif(publication.body_text, ''), nullif(publication.summary_text, ''), publication.title)
      AS body,
    publication.category,
    coalesce(publication.published_at, publication.created_at) AS published_at,
    publication.confidence,
    publication.quality_flags,
    relevance.has_direct,
    relevance.has_related,
    relevance.has_indirect,
    relevance.min_indirect_hops,
    relevance.primary_kind,
    relevance.top_reason
  FROM ops.internal_web_publication_records publication
  LEFT JOIN public.v_user_feed_dedup relevance
    ON relevance.user_id = $1::uuid
   AND relevance.record_id = publication.id
  WHERE publication.analysis_run_id = $2
    AND publication.analysis_revision = $3
    AND publication.record_key = $4
    AND publication.domain = 'stock'
    AND publication.lifecycle_state = 'active'
    AND publication.market IN ('KR', 'US', 'GLOBAL')
  LIMIT 1
`;

const SOURCES_SQL = `
  WITH publication AS (
    SELECT id
    FROM ops.internal_web_publication_records
    WHERE analysis_run_id = $1
      AND analysis_revision = $2
      AND record_key = $3
    LIMIT 1
  )
  SELECT
    association.source_key,
    coalesce(nullif(cutoff_revision.source_name, ''), nullif(cutoff_revision.title, ''), association.source_key)
      AS attribution_text,
    nullif(cutoff_revision.url, '') AS url,
    cutoff_revision.published_at,
    cutoff_revision.content_hash AS cutoff_content_hash,
    current_source.content_hash AS current_content_hash,
    claim.used_claim
  FROM ops.analysis_run_record_source association
  LEFT JOIN LATERAL (
    SELECT revision.source_name, revision.title, revision.url, revision.published_at,
           revision.content_hash
    FROM ops.source_document_revision revision
    WHERE revision.source_key = association.source_key
      AND revision.known_at <= $4::timestamptz
    ORDER BY revision.known_at DESC, revision.revision_no DESC
    LIMIT 1
  ) cutoff_revision ON true
  LEFT JOIN public.source_documents current_source
    ON current_source.source_key = association.source_key
  LEFT JOIN LATERAL (
    SELECT record_source.used_claim
    FROM public.record_sources record_source
    WHERE record_source.record_id = (SELECT id FROM publication)
      AND record_source.source_key = association.source_key
    ORDER BY record_source.id DESC
    LIMIT 1
  ) claim ON true
  WHERE association.analysis_run_id = $1
    AND association.revision = $2
    AND association.record_key = $3
    AND association.lifecycle_state = 'active'
  ORDER BY association.source_key ASC
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

function normalizeQuality(value: string | null): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizeMarket(row: DetailRow): ResearchRecordDetail['market'] {
  if (row.record_type === 'macro_observation') return 'MACRO';
  if (row.market === 'GLOBAL') return 'GLOBAL';
  return row.market === 'US' ? 'US' : 'KR';
}

function relevanceFor(row: DetailRow): ResearchRecordDetail['relevance'] {
  if (row.has_direct) return { kind: 'direct', hops: 0 };
  if (row.has_related) return { kind: 'related', hops: 1 };
  if (row.has_indirect) return { kind: 'indirect', hops: row.min_indirect_hops ?? 2 };
  if (row.record_type === 'candidate') return { kind: 'discovery', hops: null };
  return { kind: 'market', hops: null };
}

function whySurfaced(row: DetailRow, relevance: ResearchRecordDetail['relevance']): string {
  if (row.top_reason?.trim()) return row.top_reason.trim();
  if (relevance.kind === 'direct') return '관심 종목과 직접 관련된 최신 리서치';
  if (relevance.kind === 'related') return '관심 종목과 연결된 연관 리서치';
  if (relevance.kind === 'indirect') return `${relevance.hops ?? 2}단계 관계로 연결된 리서치`;
  if (relevance.kind === 'discovery') return '관심 목록 밖에서 발견된 새 리서치 후보';
  return '현재 시장에서 확인할 변화';
}

function sourceBindingState(
  cutoffHash: string | null,
  currentHash: string | null,
): 'verified' | 'superseded' | 'missing' {
  if (!cutoffHash) return 'missing';
  return currentHash && currentHash !== cutoffHash ? 'superseded' : 'verified';
}

export async function getResearchRecordDetail(
  executor: RecordDetailRowQueryExecutor,
  options: GetResearchRecordDetailOptions,
): Promise<ResearchRecordDetail | null> {
  if (!options.recordKey.trim() || options.recordKey.length > 320) {
    throw new Error('recordKey must be between 1 and 320 characters');
  }
  const now = options.now ?? new Date();
  const [latestRun] = await executor.queryRows<LatestRunRow>(LATEST_RUN_SQL);
  if (!latestRun) return null;

  const cutoffAt = toIso(latestRun.cutoff_at);
  const [row] = await executor.queryRows<DetailRow>(DETAIL_SQL, [
    options.userScope.userId,
    latestRun.analysis_run_id,
    latestRun.analysis_revision,
    options.recordKey,
  ]);
  if (!row) return null;

  const sourceRows = await executor.queryRows<SourceRow>(SOURCES_SQL, [
    latestRun.analysis_run_id,
    latestRun.analysis_revision,
    options.recordKey,
    cutoffAt,
  ]);
  const [marketRow] = await executor.queryRows<MarketAsOfRow>(MARKET_AS_OF_SQL);
  const sources = sourceRows.map((source) => ({
    sourceKey: source.source_key,
    attributionText: source.attribution_text?.trim() || source.source_key,
    url: source.url?.trim() || null,
    publishedAt: source.published_at ? toIso(source.published_at) : null,
    sourceContentHash: source.cutoff_content_hash,
    bindingState: sourceBindingState(source.cutoff_content_hash, source.current_content_hash),
  }));
  const evidence = sourceRows.flatMap((source, index) =>
    source.cutoff_content_hash
      ? [
          {
            evidenceId: `${row.record_key}:source:${index + 1}`,
            claim: source.used_claim?.trim() || row.summary,
            sourceKeys: [source.source_key],
            quality: normalizeQuality(row.confidence),
          },
        ]
      : [],
  );
  const linked = sourceRows.filter(({ cutoff_content_hash: hash }) => Boolean(hash)).length;
  const clickable = sourceRows.filter(({ url }) => Boolean(url?.trim())).length;
  const qualityFlags = new Set(row.quality_flags ?? []);
  const limitations: string[] = [];
  if (linked < sourceRows.length) {
    qualityFlags.add('source_binding_missing');
    limitations.push('일부 출처 revision이 선택된 분석 cutoff에서 확인되지 않음');
  }
  if (clickable < sourceRows.length) {
    qualityFlags.add(clickable === 0 ? 'attribution_only' : 'source_url_partial');
    limitations.push('일부 출처는 attribution만 제공되며 원문 링크 준비중');
  }
  if (sources.some(({ bindingState }) => bindingState === 'superseded')) {
    qualityFlags.add('source_superseded');
    limitations.push('일부 출처는 분석 이후 새 revision이 수집됨');
  }
  const relevance = relevanceFor(row);
  const freshUntil = toIso(latestRun.fresh_until);

  return researchRecordDetailSchema.parse({
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
      sourceCoverage: { linked, clickable, total: sourceRows.length },
      qualityFlags: [...qualityFlags],
    },
    recordKey: row.record_key,
    recordType: row.record_type,
    market: normalizeMarket(row),
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category?.trim() || row.record_type,
    publishedAt: toIso(row.published_at),
    affectedEntityKeys:
      row.entity_key &&
      /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/.test(row.entity_key)
        ? [row.entity_key]
        : [],
    whySurfaced: whySurfaced(row, relevance),
    relevance,
    confidence: normalizeQuality(row.confidence),
    sourceCoverage: { linked, clickable, total: sourceRows.length },
    qualityFlags: [...qualityFlags],
    limitations,
    evidence,
    sources,
  });
}
