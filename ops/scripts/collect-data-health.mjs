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
    // Scoped to published packs. Items are not deleted when a pack is superseded,
    // so counting the table raw grows without bound and pushed this ratio above 1
    // the first time a second snapshot published in one day.
    view: `SELECT count(*) FROM serving.content_pack_item item
           JOIN serving.content_pack pack USING (content_pack_id)
           WHERE item.item_kind = 'impact_path' AND pack.status = 'published'`,
    upstream: `SELECT count(*) FROM analytics.impact_path_v2 path
               WHERE path.status = 'sealed'
                 AND path.graph_snapshot_id IN (
                   SELECT graph_snapshot_id FROM serving.content_pack
                   WHERE status = 'published')`,
    note: 'v2 impact paths on the published snapshot',
  },
];

// A single (upstream, view) pair is not enough. serving.v_world_event_current_v1
// reads 3,041 -> 3,041 and looks perfectly healthy, but it is only
// `world.event JOIN world.event_revision` — it measures that revisions exist, not
// that anything consumes them. Three tables downstream the chain is empty and the
// world model reaches nothing. A pair cannot see that; a chain can.
const CHAINS = [
  {
    name: 'world model → 포트폴리오 노출',
    steps: [
      // The projection source. world.event had no producer and drifted 923 events
      // behind knowledge.event before anyone noticed, because the serving view
      // reports 100% yield over whatever the plane happens to hold. Starting the
      // chain one step earlier is what makes that drift visible.
      { label: 'knowledge.event', sql: 'SELECT count(*) FROM knowledge.event' },
      {
        label: 'world.event (projected)',
        sql: "SELECT count(*) FROM world.event WHERE event_key LIKE 'legacy-event:%'",
      },
      { label: 'world.event_revision', sql: 'SELECT count(*) FROM world.event_revision' },
      { label: 'analytics.impact_shock', sql: 'SELECT count(*) FROM analytics.impact_shock' },
      {
        label: 'impact_exposure_revision (sealed)',
        sql: "SELECT count(*) FROM analytics.impact_exposure_revision WHERE exposure_state = 'sealed'",
      },
      {
        label: 'portfolio_lot_snapshot',
        sql: 'SELECT count(*) FROM personalization.portfolio_lot_snapshot',
      },
    ],
  },
  {
    name: 'v2 임팩트 → 제품',
    steps: [
      {
        label: 'graph_snapshot_edge',
        sql: `SELECT count(*) FROM analytics.graph_snapshot_edge edge
              WHERE edge.graph_snapshot_id = (
                SELECT max(graph_snapshot_id) FROM analytics.graph_snapshot WHERE status = 'sealed')`,
      },
      {
        label: 'impact_path_v2 (sealed)',
        sql: `SELECT count(*) FROM analytics.impact_path_v2
              WHERE status = 'sealed' AND graph_snapshot_id = (
                SELECT max(graph_snapshot_id) FROM analytics.graph_snapshot WHERE status = 'sealed')`,
      },
      {
        label: 'content_pack_item[impact_path]',
        sql: `SELECT count(*) FROM serving.content_pack_item item
              JOIN serving.content_pack pack USING (content_pack_id)
              WHERE item.item_kind = 'impact_path' AND pack.status = 'published'`,
      },
      {
        label: 'impact_brief 팩 (servable)',
        sql: `SELECT count(*) FROM serving.v_relation_graph_freshness
              WHERE pack_kind = 'impact_brief' AND servable`,
      },
    ],
  },
  {
    // Attribution is what decides whether an event can reach any screen at all.
    // 1,516 events sat unattributed because migration 012's LEFT JOIN ran before
    // core.entity_identifier was filled, and nothing re-ran it — invisible until
    // measured, because an unattributed event simply never appears anywhere.
    name: '사건 귀속 → 월드 참여자',
    steps: [
      { label: 'knowledge.event', sql: 'SELECT count(*) FROM knowledge.event' },
      {
        label: '엔티티 붙은 사건',
        sql: 'SELECT count(*) FROM knowledge.event WHERE target_entity_id IS NOT NULL',
      },
      { label: 'world.event_participant', sql: 'SELECT count(*) FROM world.event_participant' },
    ],
  },
  {
    // "The collector is wired" and "the data is lineage-backed" are different
    // claims. A routed collector only stamps rows it newly inserts, so this ratio
    // starts near zero and climbs as the collector runs — measuring it stops the
    // wiring from being mistaken for the outcome.
    // Three legs, not two. Empty OpenDART responses now register a revision, so
    // the revision count measures "asked", not "got data". Left as one hop it
    // would fall toward 0% as absence gets recorded properly — a metric reading a
    // collapse where the opposite happened. The ask/hit split is also the more
    // useful number: it says how much of what we fetch actually carries facts.
    name: 'DART 수집 → 계보 붙은 사실',
    steps: [
      {
        label: '물어본 셀 (source_revision)',
        sql: `SELECT count(*) FROM ingestion.source_revision revision
              JOIN ingestion.source_record_identity identity
                ON identity.source_record_identity_id = revision.source_record_identity_id
              JOIN ingestion.source source ON source.source_id = identity.source_id
              WHERE source.provider_key = 'opendart'`,
      },
      {
        label: '내용이 있던 셀',
        sql: `SELECT count(*) FROM ingestion.source_revision revision
              JOIN ingestion.source_record_identity identity
                ON identity.source_record_identity_id = revision.source_record_identity_id
              JOIN ingestion.source source ON source.source_id = identity.source_id
              WHERE source.provider_key = 'opendart'
                AND revision.payload_metadata -> 'http_meta' ->> 'status' IS DISTINCT FROM '013'`,
      },
      {
        label: '계보 붙은 financial_fact',
        sql: 'SELECT count(*) FROM market.financial_fact WHERE source_revision_id IS NOT NULL',
      },
    ],
  },
  {
    name: '지식 추출 → 검증된 주장',
    steps: [
      { label: 'knowledge.document', sql: 'SELECT count(*) FROM knowledge.document' },
      { label: 'knowledge.claim', sql: 'SELECT count(*) FROM knowledge.claim' },
      {
        label: 'claim (verified)',
        sql: "SELECT count(*) FROM knowledge.claim WHERE verification_status = 'verified'",
      },
    ],
  },
];

const CONTENT_PACK_ITEM_KINDS_SQL = `
  SELECT item_kind, count(*)::bigint AS rows
  FROM serving.content_pack_item GROUP BY 1 ORDER BY 2 DESC`;

// A LEFT JOIN hides an empty right side behind a healthy row count. This asks the
// question the row count cannot: of the rows the product actually renders, how
// many carry an impact link at all?
// Serving rows, not rendered rows. market_confirmation_v1 is exposed through
// /v1/confirmation, which apps/web proxies verbatim; no page renders
// industry_link_strength or path_count. Reporting this under "reaching the
// product" would repeat the v_world_event_current_v1 mistake: a true number
// under a name that promises more than it measures.
//
// servablePacks travels with it because the summary is scoped to servable packs:
// if those expire, path_count silently COALESCEs back toward 0 and would read as
// a coverage collapse rather than a freshness problem.
const IMPACT_LINKED_SQL = `
  SELECT count(*)::bigint AS total,
         count(path_count)::bigint AS impact_linked,
         (SELECT count(*)::bigint FROM serving.v_relation_graph_freshness
           WHERE servable = true AND pack_kind = 'impact_brief') AS servable_packs
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
// Column presence says the table CAN record lineage; this says how much of it
// actually does. Rows loaded before the collector was routed keep a NULL rather
// than a manufactured revision, so the two numbers stay far apart for a while.
// Per routed table, so wiring a new collector shows up as its own line rather
// than being averaged into one number that hides which tables are still dark.
const FACT_LINEAGE_SQL = `
  SELECT 'market.financial_fact' AS table_name,
         count(*)::bigint AS total,
         count(source_revision_id)::bigint AS with_lineage
  FROM market.financial_fact
  UNION ALL
  SELECT 'market.macro_vintage',
         count(*)::bigint,
         count(source_revision_id)::bigint
  FROM market.macro_vintage
  UNION ALL
  SELECT 'market.short_volume_daily',
         count(*)::bigint,
         count(source_revision_id)::bigint
  FROM market.short_volume_daily
  ORDER BY 1`;

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

// The coverage ledger is append-only with a revision chain, so "current" means
// the highest revision per coverage_key. Reading it without DISTINCT ON would
// count superseded judgements and make coverage look larger than the universe.
const COVERAGE_SQL = `
  SELECT predicate_or_fact_family AS family, completeness_state AS state, count(*)::bigint AS cells
  FROM (
    SELECT DISTINCT ON (coverage_key)
           coverage_key, predicate_or_fact_family, completeness_state
    FROM governance.coverage_ledger
    ORDER BY coverage_key, revision_no DESC
  ) current
  GROUP BY 1, 2
  ORDER BY 1, 3 DESC`;

// Events we extracted and could not attach to any company. These are a coverage
// fact, not a product surface: measured 2026-08-03, all 924 have zero entity
// participants, so a page listing them would be showing extraction failures as
// though they were market signals. Attaching them needs identifier evidence that
// does not exist — the foreign-key joins are already exhausted — so the honest
// place for the number is here, next to not_collected.
const UNATTRIBUTED_EVENT_SQL = `
  SELECT count(*)::bigint AS total,
         count(*) FILTER (
           WHERE NOT (event.metadata ? 'legacy_signal_id')
             AND NOT EXISTS (
               SELECT 1 FROM analytics.impact_path_v2 path
                WHERE path.trigger_event_id = event.event_id AND path.status = 'sealed')
         )::bigint AS reaching_nothing
  FROM knowledge.event event`;

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

  const chains = [];
  for (const chain of CHAINS) {
    const steps = [];
    for (const step of chain.steps) {
      const value = await scalar(client, step.sql);
      steps.push({ label: step.label, rows: value.value, error: value.error });
    }
    // The break is the first step that empties out while the one before it did not.
    const breakAt = steps.findIndex(
      (step, index) => index > 0 && step.rows === 0 && (steps[index - 1].rows ?? 0) > 0,
    );
    chains.push({
      name: chain.name,
      steps,
      brokenAt: breakAt === -1 ? null : steps[breakAt].label,
    });
  }

  const packKinds = await client.query(CONTENT_PACK_ITEM_KINDS_SQL);
  const impactLinked = await client.query(IMPACT_LINKED_SQL);
  const sources = await client.query(SOURCE_ACTIVITY_SQL);
  const marketLineage = await client.query(MARKET_LINEAGE_SQL);
  const factLineage = await client.query(FACT_LINEAGE_SQL);
  const verification = await client.query(VERIFICATION_SQL);
  const coverage = await client.query(COVERAGE_SQL);
  const unattributed = await client.query(UNATTRIBUTED_EVENT_SQL);
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
    chains,
    contentPackItemKinds: packKinds.rows.map((row) => ({
      itemKind: row.item_kind,
      rows: Number(row.rows),
    })),
    impactLinked: {
      surface: 'serving.market_confirmation_v1',
      rows: Number(impactLinked.rows[0].total),
      withImpactPath: Number(impactLinked.rows[0].impact_linked),
      servablePacks: Number(impactLinked.rows[0].servable_packs),
    },
    collection: {
      registeredSources: sourceRows.length,
      activeWindowHours,
      activeSources: sourceRows.filter((row) => row.activeRecently).length,
      sourcesUsingContractLayer: sourceRows.filter((row) => row.usesContractLayer).length,
      sources: sourceRows,
    },
    marketLineage: {
      routedTables: factLineage.rows.map((row) => ({
        table: row.table_name,
        total: Number(row.total),
        withLineage: Number(row.with_lineage),
      })),
      tables: marketLineage.rows.map((row) => ({
        table: `market.${row.table_name}`,
        hasLineageColumn: row.has_lineage_column,
      })),
      tablesWithLineageColumn: marketLineage.rows.filter((row) => row.has_lineage_column).length,
    },
    coverage: coverage.rows.map((row) => ({
      family: row.family,
      state: row.state,
      cells: Number(row.cells),
    })),
    unattributedEvents: {
      total: Number(unattributed.rows[0].total),
      reachingNothing: Number(unattributed.rows[0].reaching_nothing),
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

  lines.push('', '## Chains', '');
  for (const chain of data.chains) {
    const trail = chain.steps
      .map((step) => `${step.label} ${step.rows === null ? '—' : num(step.rows)}`)
      .join(' → ');
    lines.push(`- **${chain.name}**`);
    lines.push(`  ${trail}`);
    lines.push(
      chain.brokenAt === null
        ? '  사슬이 끊긴 곳 없음.'
        : `  **\`${chain.brokenAt}\`에서 끊김** — 상류가 있는데 여기서 0이 된다.`,
    );
  }

  lines.push('', '## Content pack items', '');
  lines.push('| item_kind | rows |');
  lines.push('| --- | ---: |');
  for (const row of data.contentPackItemKinds) lines.push(`| ${row.itemKind} | ${num(row.rows)} |`);

  const linked = data.impactLinked;
  lines.push('', '## Impact on the serving row', '');
  lines.push(
    `\`${linked.surface}\` ${num(linked.rows)}행 중 임팩트 경로가 붙은 행 **${num(linked.withImpactPath)}** (${pct(ratio(linked.withImpactPath, linked.rows))}) · servable impact 팩 ${num(linked.servablePacks)}개`,
  );
  lines.push(
    '',
    '서빙 행 기준이다. `/v1/confirmation`은 이 컬럼들을 내보내지만 화면에 그리는 곳은 아직 없다.',
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
  for (const routed of data.marketLineage.routedTables) {
    lines.push(
      `- 출처가 붙은 \`${routed.table}\` **${num(routed.withLineage)} / ${num(routed.total)}** (${pct(ratio(routed.withLineage, routed.total))})`,
    );
  }

  lines.push('', '## Coverage ledger', '');
  if (data.coverage.length === 0) {
    lines.push('원장이 비어 있음 — "없음"과 "모름"을 구분할 근거가 없다.');
  } else {
    lines.push('| fact family | state | cells |');
    lines.push('| --- | --- | ---: |');
    for (const row of data.coverage) {
      lines.push(`| \`${row.family}\` | ${row.state} | ${num(row.cells)} |`);
    }
    const notCollected = data.coverage
      .filter((row) => row.state === 'not_collected')
      .reduce((sum, row) => sum + row.cells, 0);
    const total = data.coverage.reduce((sum, row) => sum + row.cells, 0);
    lines.push(
      '',
      `수집을 시도조차 못 한 셀 **${num(notCollected)} / ${num(total)}** (${pct(ratio(notCollected, total))}) — 관계가 없는 것이 아니라 모르는 것이다.`,
    );
  }

  const orphan = data.unattributedEvents;
  lines.push(
    '',
    `추출했지만 어떤 화면에도 닿지 않는 사건 **${num(orphan.reachingNothing)} / ${num(orphan.total)}** (${pct(ratio(orphan.reachingNothing, orphan.total))}) — 전부 엔티티가 붙지 않은 것이라, 잇는 데는 지금 없는 식별자 근거가 필요하다.`,
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
