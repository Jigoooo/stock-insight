// Data health collector.
//
// A plain row-count dashboard would NOT have caught the failure this exists to
// catch: `serving.impact_summary_v1` reads 44,658 rows and emits 0, every night,
// silently, since 2026-07-19. A count of either side alone looks unremarkable —
// the pair does not. So the core shape here is (upstream, view, ratio), and a
// serving surface whose ratio is 0 while its upstream is not is the signal.
//
// Read-only by construction: the whole run is one `BEGIN READ ONLY` transaction
// that is always rolled back.
//
// Usage:
//   DATABASE_URL=… node ops/scripts/collect-data-health.mjs            # markdown
//   DATABASE_URL=… node ops/scripts/collect-data-health.mjs --json     # machine
//   DATABASE_URL=… node ops/scripts/collect-data-health.mjs --json --out FILE

import { open, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const pg = require('pg');

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const outIndex = args.indexOf('--out');
const OUT_PATH = outIndex === -1 ? null : args[outIndex + 1];
if (outIndex !== -1 && !OUT_PATH) throw new Error('--out requires a path');

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required');

// Each entry pairs a serving surface with what it reads. The upstream expression
// is deliberately written to match the view's own scope (e.g. impact_summary_v1
// only ever considers unexpired paths), so a ratio below 1 means the view is
// rejecting rows rather than merely looking at a smaller window.
const SERVING_YIELD = [
  {
    surface: 'serving.impact_summary_v1',
    view: 'SELECT count(*) FROM serving.impact_summary_v1',
    upstream: 'SELECT count(*) FROM analytics.impact_path WHERE expires_at > now()',
    note: 'v1 impact paths',
  },
  {
    surface: 'serving.relation_current_v1',
    view: 'SELECT count(*) FROM serving.relation_current_v1',
    upstream: 'SELECT count(*) FROM knowledge.relation_identity',
    note: 'evidence-gated relations',
  },
  {
    surface: 'serving.latest_feature_snapshot_v1',
    view: 'SELECT count(*) FROM serving.latest_feature_snapshot_v1',
    upstream: 'SELECT count(DISTINCT asset_entity_id) FROM analytics.asset_feature_snapshot',
    note: 'latest per asset — a ratio near 1 is correct here',
  },
  // This view is FROM latest_feature_snapshot_v1 LEFT JOIN impact_summary_v1, so
  // it keeps emitting rows even while impact_summary_v1 is empty. Counting rows
  // would report a healthy 100%; the honest denominator is its actual driving
  // table, and the missing impact shows up in impactLinked below instead.
  {
    surface: 'serving.market_confirmation_v1',
    view: 'SELECT count(*) FROM serving.market_confirmation_v1',
    upstream: 'SELECT count(*) FROM serving.latest_feature_snapshot_v1',
    note: 'impact is LEFT JOINed — see impactLinked',
  },
  {
    surface: 'serving.forecast_scorecard_v1',
    view: 'SELECT count(*) FROM serving.forecast_scorecard_v1',
    upstream: 'SELECT count(*) FROM analytics.calibration_profile',
    note: 'calibration profiles',
  },
  {
    surface: 'serving.probability_scorecard_v1',
    view: 'SELECT count(*) FROM serving.probability_scorecard_v1',
    upstream: 'SELECT count(*) FROM analytics.probability_calibration_snapshot',
    note: 'probability snapshots',
  },
  {
    surface: 'serving.v_truth_assertion_pit_v1',
    view: 'SELECT count(*) FROM serving.v_truth_assertion_pit_v1',
    upstream: 'SELECT count(*) FROM knowledge.assertion',
    note: 'truth kernel assertions',
  },
  {
    surface: 'serving.v_world_event_current_v1',
    view: 'SELECT count(*) FROM serving.v_world_event_current_v1',
    upstream: 'SELECT count(*) FROM world.event_revision',
    note: 'world events',
  },
  {
    surface: 'serving.v_geo_entity_exposure_v1',
    view: 'SELECT count(*) FROM serving.v_geo_entity_exposure_v1',
    upstream: 'SELECT count(*) FROM geo.entity_exposure_revision',
    note: 'geo plane',
  },
  {
    surface: 'crypto_serving.entity_revision',
    view: 'SELECT count(*) FROM crypto_serving.entity_revision',
    upstream: 'SELECT count(*) FROM crypto_identity.entity_revision',
    note: 'crypto plane',
  },
  {
    surface: 'crypto_serving.event_revision',
    view: 'SELECT count(*) FROM crypto_serving.event_revision',
    upstream: 'SELECT count(*) FROM crypto_truth.event_revision',
    note: 'crypto plane',
  },
  {
    surface: 'crypto_serving.core_relation_revision',
    view: 'SELECT count(*) FROM crypto_serving.core_relation_revision',
    upstream: 'SELECT count(*) FROM cross_domain.crypto_core_relation_revision',
    note: 'crypto plane',
  },
  {
    surface: 'crypto_serving.risk_exposure_revision',
    view: 'SELECT count(*) FROM crypto_serving.risk_exposure_revision',
    upstream: 'SELECT count(*) FROM crypto_analytics.risk_exposure_revision',
    note: 'crypto plane',
  },
  // The v2 impact plane seals paths nightly but no publisher emits
  // item_kind='impact_path', so this pair reads N -> 0 the same way v1 does.
  //
  // The upstream is scoped to the snapshot the currently published packs sit on,
  // not every sealed path ever. Packs are digest-sealed per snapshot, so paths
  // from superseded snapshots can never appear in a current pack — counting them
  // would hold this ratio permanently below 1 and make a fully working publisher
  // still read as broken.
  {
    surface: 'serving.content_pack_item[impact_path]',
    view: "SELECT count(*) FROM serving.content_pack_item WHERE item_kind = 'impact_path'",
    upstream: `SELECT count(*) FROM analytics.impact_path_v2 path
               WHERE path.status = 'sealed'
                 AND path.graph_snapshot_id IN (
                   SELECT graph_snapshot_id FROM serving.content_pack
                   WHERE status = 'published')`,
    note: 'v2 impact paths on the published snapshot',
  },
];

const CONTENT_PACK_ITEM_KINDS_SQL = `
  SELECT item_kind, count(*)::bigint AS rows
  FROM serving.content_pack_item GROUP BY 1 ORDER BY 2 DESC`;

// A LEFT JOIN hides an empty right side behind a healthy row count. This asks the
// question the row count cannot: of the rows the product actually renders, how
// many carry an impact link at all?
const IMPACT_LINKED_SQL = `
  SELECT count(*)::bigint AS total,
         count(path_count)::bigint AS impact_linked
  FROM serving.market_confirmation_v1`;

// "Is this source actually collecting, and does it go through the contract
// layer at all?" Two different questions: fetch_run means it ran; source_revision
// means the payload was registered with provenance.
const SOURCE_ACTIVITY_SQL = `
  SELECT
    source.source_id,
    source.provider_key,
    (SELECT max(run.started_at) FROM ingestion.fetch_run run
       WHERE run.source_id = source.source_id) AS last_fetch_run,
    (SELECT max(revision.ingested_at) FROM ingestion.source_revision revision
       JOIN ingestion.source_record_identity identity
         ON identity.source_record_identity_id = revision.source_record_identity_id
       WHERE identity.source_id = source.source_id) AS last_source_revision
  FROM ingestion.source source
  ORDER BY source.provider_key`;

// market.* is where the bypassing collectors land. None of these tables carries a
// source_revision_id column today, so lineage cannot even be recorded — that is a
// schema gap, not just a missing call, and it is measured rather than assumed.
const MARKET_LINEAGE_SQL = `
  SELECT
    table_class.relname AS table_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns column_info
      WHERE column_info.table_schema = 'market'
        AND column_info.table_name = table_class.relname
        AND column_info.column_name = 'source_revision_id'
    ) AS has_lineage_column
  FROM pg_class table_class
  JOIN pg_namespace schema_ns ON schema_ns.oid = table_class.relnamespace
  WHERE schema_ns.nspname = 'market' AND table_class.relkind = 'r'
  ORDER BY 1`;

// relation_revision is split by relation_kind because the two kinds fail
// differently: statistical relations pass their own quarantine checks almost by
// construction, while `structural` is where the causally meaningful edges
// (OWNS/SUPPLIES) sit and where the quarantine actually bites. Reporting only the
// table-wide total (19,069 accepted) would hide that.
const VERIFICATION_SQL = `
  SELECT 'knowledge.claim' AS relation, verification_status AS state, count(*)::bigint AS rows
    FROM knowledge.claim GROUP BY 1, 2
  UNION ALL
  SELECT 'knowledge.event', verification_status, count(*)::bigint
    FROM knowledge.event GROUP BY 1, 2
  UNION ALL
  SELECT 'knowledge.relation_revision[' || relation_kind || ']', revision_status, count(*)::bigint
    FROM knowledge.relation_revision GROUP BY 1, 2
  ORDER BY 1, 3 DESC`;

// migration_runs is a pipeline job log despite the name (the schema ledger is
// public.schema_migration). consecutive_failures counts back from the newest run
// and stops at the first success, which is what "is it broken right now" means.
const PIPELINE_SQL = `
  WITH ranked AS (
    SELECT job_name, status, finished_at,
           row_number() OVER (PARTITION BY job_name ORDER BY started_at DESC, id DESC) AS recency
    FROM public.migration_runs
  ),
  streak AS (
    SELECT job_name, count(*)::bigint AS consecutive_failures
    FROM ranked
    WHERE recency < COALESCE((
      SELECT min(success.recency) FROM ranked success
      WHERE success.job_name = ranked.job_name
        AND success.status IN ('completed', 'success')
    ), 2147483647)
    GROUP BY job_name
  )
  SELECT
    job.job_name,
    (SELECT max(finished_at) FROM public.migration_runs run
       WHERE run.job_name = job.job_name AND run.status IN ('completed', 'success')) AS last_success,
    (SELECT max(finished_at) FROM public.migration_runs run
       WHERE run.job_name = job.job_name AND run.status = 'failed') AS last_failure,
    COALESCE((SELECT consecutive_failures FROM streak WHERE streak.job_name = job.job_name), 0)
      AS consecutive_failures
  FROM (SELECT DISTINCT job_name FROM public.migration_runs) job
  -- The lifecycle self-test writes failure rows on purpose to prove the audit
  -- path records them, and by design never records a success. Counting it as a
  -- failing job would make this report cry wolf forever.
  WHERE job.job_name NOT LIKE '%-selftest'
  ORDER BY job.job_name`;

function ratio(view, upstream) {
  if (upstream === 0) return null;
  return Number((view / upstream).toFixed(4));
}

async function scalar(client, sql) {
  // A surface can be absent or unreadable (a plane that was never migrated in,
  // a role without SELECT). That is a real, reportable state — not a crash — but
  // it must be distinguishable from a genuine zero, hence null plus the reason.
  try {
    const result = await client.query(sql);
    return { value: Number(result.rows[0]?.count ?? 0), error: null };
  } catch (error) {
    return { value: null, error: error.message.split('\n')[0] };
  }
}

const client = new pg.Client({ connectionString });
await client.connect();

let report;
try {
  await client.query('BEGIN READ ONLY');

  // A pg Client multiplexes nothing: two concurrent query() calls on one client
  // are a protocol error. Everything here runs sequentially on purpose.
  const servingYield = [];
  for (const entry of SERVING_YIELD) {
    const view = await scalar(client, entry.view);
    const upstream = await scalar(client, entry.upstream);
    servingYield.push({
      surface: entry.surface,
      note: entry.note,
      upstream: upstream.value,
      view: view.value,
      ratio:
        view.value === null || upstream.value === null ? null : ratio(view.value, upstream.value),
      error: view.error ?? upstream.error,
    });
  }

  const packKinds = await client.query(CONTENT_PACK_ITEM_KINDS_SQL);
  const impactLinked = await client.query(IMPACT_LINKED_SQL);
  const sources = await client.query(SOURCE_ACTIVITY_SQL);
  const marketLineage = await client.query(MARKET_LINEAGE_SQL);
  const verification = await client.query(VERIFICATION_SQL);
  const pipeline = await client.query(PIPELINE_SQL);
  const capturedAt = await client.query(
    `SELECT to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at`,
  );

  const activeWindowHours = 48;
  const cutoff = Date.now() - activeWindowHours * 3600 * 1000;
  const sourceRows = sources.rows.map((row) => ({
    providerKey: row.provider_key,
    lastFetchRun: row.last_fetch_run?.toISOString() ?? null,
    lastSourceRevision: row.last_source_revision?.toISOString() ?? null,
    activeRecently: row.last_fetch_run ? row.last_fetch_run.getTime() >= cutoff : false,
    usesContractLayer: row.last_source_revision !== null,
  }));

  report = {
    capturedAt: capturedAt.rows[0].at,
    servingYield,
    contentPackItemKinds: packKinds.rows.map((row) => ({
      itemKind: row.item_kind,
      rows: Number(row.rows),
    })),
    impactLinked: {
      surface: 'serving.market_confirmation_v1',
      rows: Number(impactLinked.rows[0].total),
      withImpactPath: Number(impactLinked.rows[0].impact_linked),
    },
    collection: {
      registeredSources: sourceRows.length,
      activeWindowHours,
      activeSources: sourceRows.filter((row) => row.activeRecently).length,
      sourcesUsingContractLayer: sourceRows.filter((row) => row.usesContractLayer).length,
      sources: sourceRows,
    },
    marketLineage: {
      tables: marketLineage.rows.map((row) => ({
        table: `market.${row.table_name}`,
        hasLineageColumn: row.has_lineage_column,
      })),
      tablesWithLineageColumn: marketLineage.rows.filter((row) => row.has_lineage_column).length,
    },
    verification: verification.rows.map((row) => ({
      relation: row.relation,
      state: row.state,
      rows: Number(row.rows),
    })),
    pipeline: pipeline.rows.map((row) => ({
      jobName: row.job_name,
      lastSuccess: row.last_success?.toISOString() ?? null,
      lastFailure: row.last_failure?.toISOString() ?? null,
      consecutiveFailures: Number(row.consecutive_failures),
    })),
  };
} finally {
  try {
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

function markdown(data) {
  const lines = [];
  const pct = (value) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
  const num = (value) => (value === null ? '—' : value.toLocaleString('en-US'));

  lines.push(`# Stock Insight data health — ${data.capturedAt}`, '');

  lines.push('## Serving yield (upstream → view)', '');
  lines.push('| surface | upstream | view | yield | note |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const row of data.servingYield) {
    const note = row.error ? `⚠️ ${row.error}` : row.note;
    lines.push(
      `| \`${row.surface}\` | ${num(row.upstream)} | ${num(row.view)} | ${pct(row.ratio)} | ${note} |`,
    );
  }
  const broken = data.servingYield.filter((row) => row.upstream > 0 && row.view === 0);
  lines.push('');
  lines.push(
    broken.length === 0
      ? '모든 서빙 표면이 상류 대비 0이 아님.'
      : `**상류는 있는데 0을 내는 표면 ${broken.length}개**: ${broken.map((row) => `\`${row.surface}\``).join(', ')}`,
  );

  lines.push('', '## Content pack items', '');
  lines.push('| item_kind | rows |');
  lines.push('| --- | ---: |');
  for (const row of data.contentPackItemKinds) lines.push(`| ${row.itemKind} | ${num(row.rows)} |`);

  const linked = data.impactLinked;
  lines.push('', '## Impact reaching the product', '');
  lines.push(
    `\`${linked.surface}\` ${num(linked.rows)}행 중 임팩트 경로가 붙은 행 **${num(linked.withImpactPath)}** (${pct(ratio(linked.withImpactPath, linked.rows))})`,
  );

  lines.push('', '## Collection', '');
  lines.push(
    `- 등록 소스 **${data.collection.registeredSources}**개 중 최근 ${data.collection.activeWindowHours}시간 내 수집 **${data.collection.activeSources}**개`,
  );
  lines.push(
    `- 수집 계약 계층(\`ingestion.source_revision\`)을 지나는 소스 **${data.collection.sourcesUsingContractLayer}**개`,
  );
  lines.push(
    `- 계보 컬럼(\`source_revision_id\`)을 가진 \`market.*\` 테이블 **${data.marketLineage.tablesWithLineageColumn} / ${data.marketLineage.tables.length}**`,
  );

  lines.push('', '## Verification state', '');
  lines.push('| relation | state | rows |');
  lines.push('| --- | --- | ---: |');
  for (const row of data.verification)
    lines.push(`| \`${row.relation}\` | ${row.state} | ${num(row.rows)} |`);

  const failing = data.pipeline.filter((row) => row.consecutiveFailures > 0);
  lines.push('', '## Pipeline', '');
  if (failing.length === 0) {
    lines.push('연속 실패 중인 잡 없음.');
  } else {
    lines.push('| job | consecutive failures | last success | last failure |');
    lines.push('| --- | ---: | --- | --- |');
    for (const row of failing)
      lines.push(
        `| \`${row.jobName}\` | ${row.consecutiveFailures} | ${row.lastSuccess ?? '—'} | ${row.lastFailure ?? '—'} |`,
      );
  }

  return `${lines.join('\n')}\n`;
}

const rendered = AS_JSON ? `${JSON.stringify(report, null, 2)}\n` : markdown(report);

if (OUT_PATH) {
  const temporary = `${OUT_PATH}.tmp-${process.pid}`;
  const handle = await open(temporary, 'wx', 0o644);
  try {
    await handle.writeFile(rendered, 'utf8');
  } finally {
    await handle.close();
  }
  await rename(temporary, OUT_PATH);
} else {
  process.stdout.write(rendered);
}
