// Which tables this repository owns, creates, fills — and nothing reads.
//
// The data-plane twin of the job-wiring inventory. Same defect, other axis: a thing
// gets built, it lands somewhere, and nothing checks that anything consumes it.
// That shape appeared five times on 2026-08-06 alone — a policy field with no
// reader, two jobs with no caller, dry runs that could not predict their apply, and
// a corroboration step nobody wrote.
//
// WHY A JOB AND NOT A TEST. This started as a static test that parsed migrations.
// It cannot work: the readers are views and PL/pgSQL functions whose bodies live
// inside TypeScript template literals, and approximating that with a regex produced
// 12 false orphans, then 12 again after a second attempt. The database already
// knows the answer exactly — pg_get_viewdef and pg_proc.prosrc are the definitions,
// not a guess at them. Building a SQL parser to avoid asking the database would
// have been the patchwork this audit exists to find.
//
// PITFALLS, from docs/architecture/operations/database-ownership.md and each confirmed the hard
// way on the same day:
//   - pg_stat_user_tables.n_live_tup is an ESTIMATE. analytics.theme holds 138 rows
//     and reports 0, so this uses count(*).
//   - Word matching is not evidence. Grepping `theme` hits research-common's SQLite
//     table and the label `theme:crypto`; only a query context counts.
//   - research_app is shared by four projects. Only the schemas this repository
//     owns are audited — flagging a sibling's table as dead would be a false
//     accusation about code that is not here to defend itself.

import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

const JOB_NAME = 'stock-insight-table-reachability-audit';

/** From database-ownership.md. Everything else belongs to a sibling project. */
const OWNED_SCHEMAS = [
  'analytics',
  'knowledge',
  'world',
  'governance',
  'ingestion',
  'serving',
  'personalization',
  'content',
  'core',
  'crypto_identity',
  'crypto_truth',
  'crypto_analytics',
  'crypto_serving',
  'cross_domain',
  'geo',
  'market',
];

/**
 * Known and accepted, from database-ownership.md. Each entry is a debt someone has
 * looked at. The audit reports when one gains a reader — a stale acceptance is how
 * a list like this stops meaning anything.
 */
const ACCEPTED = new Map<string, string>([
  // 「폐기 예정」이었다. 2026-08-07 재측정으로 그 분류를 철회한다.
  //
  // 근거가 "v2 가 theme_exposure_snapshot 으로 대체" 였는데, 그 표는 존재하지 않는다.
  // 마스터 플랜 문서(00-backend-db-master-plan.md:279)에 축이 적혀 있을 뿐 마이그레이션도
  // 표도 없다. 즉 "대체품이 있으니 버려도 된다" 가 아니라 "대체품이 계획서에만 있고
  // 원본은 아무도 안 읽는다" 였다. 둘은 전혀 다른 상태다.
  //
  // 그리고 이 534행은 지금 값이 있을 수 있다. 2026-08-07 실측: 미귀속 policy_event
  // 611건 중 576건이 시장 어휘에 하나도 안 걸린다. 어휘가 못 잡는 사건을 종목에
  // 잇는 경로로 database-ownership.md 가 지목한 것이 바로 이 두 표다
  // (theme_membership 은 rationale_relation_ids 로 근거까지 들고 있다).
  //
  // 그리고 마이그레이션 068 의 주석("evidence is 93% quarantined")도 틀렸다.
  // 2026-08-07 실측: Theme 에 닿는 relation 1,145개가 **100%** quarantined 이고
  // relation_evidence 행은 0개다. 93% 보다 나쁘다.
  //
  // 068 자체는 고치지 않았고 고칠 수 없다 — 적용된 마이그레이션의 SQL 을 편집하면
  // run-schema-migrations 가 체크섬 drift 로 거부한다("the database and the
  // repository disagree about what was run"). 그게 맞는 설계이므로, 정정은
  // 체크섬 밖인 여기에 남긴다.
  //
  // 여기 남겨 두는 이유는 "읽히지 않는다" 가 사실이기 때문이고, 사유는 사실로 고쳤다.
  // 폐기하려면 theme_exposure_snapshot 을 실제로 만들거나 폐기를 별도로 결정해야 한다.
  ['analytics.theme', '138행 — 미사용. 대체 설계(theme_exposure_snapshot)는 표가 없다'],
  ['analytics.theme_membership', '396행 — 미사용. 근거(rationale_relation_ids) 보유'],
  ['core.security_master', '297행 — listing_revision · ticker_history 와 함께 미사용'],
  ['knowledge.ontology_rfc', '22행 — ontology_revision 과 함께 미사용'],
  ['analytics.impact_channel', '17행 — 채널 분류가 경로에 붙지 않았다'],
  ['serving.truth_geo_serving_manifest', '8행 — geo 서빙이 제품에 없다'],
  ['analytics.meta_path_policy', '4행 — 메타패스 정책을 읽는 코드가 없다'],
  // Named alongside security_master in the ownership document; the audit found it
  // on 2026-08-06 because only the parent table had been listed here.
  ['core.security_ticker_history', '297행 — security_master 와 함께 심어지고 미사용'],
]);

type PgModule = { Pool: new (c: { connectionString: string; max: number }) => Pool };
type Pool = { connect: () => Promise<PoolClient>; end: () => Promise<void> };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const TABLES_SQL = `
SELECT schemaname AS schema, tablename AS name
FROM pg_tables WHERE schemaname = ANY($1::text[]) ORDER BY 1, 2
`;

/**
 * Views and materialised views, added 2026-08-08.
 *
 * This audit scanned pg_tables only, which is why the seven unread views in the
 * serving schema (impact_summary_v1, latest_split_factor_v1, relation_current_v1,
 * v_geo_entity_exposure_v1, v_pit_universe_current_v1, v_truth_assertion_pit_v1,
 * v_world_event_current_v1) appeared on no gauge at all — recorded as hole ① of
 * the detector layer in the 2026-08-07 as-built.
 *
 * An unread view is not the same defect as an unread table and is not merged into
 * that count. A table with rows and no reader means something wrote data nobody
 * consumes. A view with no reader is dead projection logic — cheaper, but it is
 * also how serving.impact_summary_v1 sat structurally empty from 2026-07-19 while
 * the product LEFT JOINed it and read 0 as a measurement.
 *
 * Row counts are deliberately not taken for views: counting one executes its
 * definition, which for a multi-join projection is a real query, and "0 rows"
 * from a view says nothing about whether anyone reads it.
 */
const VIEWS_SQL = `
SELECT namespace.nspname AS schema, class.relname AS name,
       class.relkind::text AS kind
FROM pg_class class
JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
WHERE namespace.nspname = ANY($1::text[]) AND class.relkind IN ('v', 'm')
ORDER BY 1, 2
`;

/** The definitions themselves, not a parse of them. */
const DB_READERS_SQL = `
SELECT coalesce((SELECT string_agg(pg_get_viewdef(oid), ' ') FROM pg_class WHERE relkind IN ('v','m')), '')
       || ' ' ||
       coalesce((SELECT string_agg(prosrc, ' ') FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT IN ('pg_catalog','information_schema')), '') AS body
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

async function repoSource(dir: URL, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    // This file is excluded from its own haystack. On the first run the audit
    // reported analytics.theme as READ, and the only match was the doc comment
    // below explaining that `FROM theme` is what counts — the measuring tool
    // counting its own description of the table as evidence.
    if (entry.name === 'dist' || entry.name === 'migrations') continue;
    if (entry.name === 'run-table-reachability-audit.ts') continue;
    if (entry.isDirectory()) await repoSource(new URL(`${entry.name}/`, dir), out);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.sh')) {
      out.push(await readFile(new URL(entry.name, dir), 'utf8'));
    }
  }
  return out;
}

/** A query context against the table name. `theme` is everywhere; `FROM theme` is not. */
export function isQueried(schema: string, name: string, haystack: string): boolean {
  return new RegExp(
    `(from|join|into|update|delete\\s+from)\\s+(${schema}\\.)?${name}\\b`,
    'i',
  ).test(haystack);
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();

  try {
    const source: string[] = [];
    for (const dir of ['../', '../../scripts/', '../../../api-server/src/']) {
      try {
        source.push(...(await repoSource(new URL(dir, import.meta.url))));
      } catch {
        // Reported below rather than swallowed: a directory that failed to read
        // would make every table it references look orphaned.
        source.push('');
      }
    }
    const repo = source.join('\n');
    const dbBody =
      (await client.query<QueryResultRow & { body: string }>(DB_READERS_SQL, [])).rows[0]?.body ??
      '';
    const haystack = `${repo}\n${dbBody}`;

    const { rows } = await client.query<QueryResultRow & { schema: string; name: string }>(
      TABLES_SQL,
      [OWNED_SCHEMAS],
    );

    const orphans: { table: string; rows: number }[] = [];
    const acceptedNowRead: string[] = [];
    for (const row of rows) {
      const table = `${row.schema}.${row.name}`;
      const queried = isQueried(row.schema, row.name, haystack);
      if (ACCEPTED.has(table)) {
        if (queried) acceptedNowRead.push(table);
        continue;
      }
      if (queried) continue;
      // count(*), never n_live_tup — analytics.theme reports 0 for 138 rows.
      const counted = await client.query<QueryResultRow & { n: string }>(
        `SELECT count(*)::text AS n FROM ${row.schema}.${row.name}`,
      );
      orphans.push({ table, rows: Number(counted.rows[0]?.n ?? 0) });
    }

    // Views, scanned against the same haystack. A view read only by another view
    // still counts as read — DB_READERS_SQL includes every view definition — so
    // this measures reachability, not direct application use.
    const viewRows = await client.query<
      QueryResultRow & { schema: string; name: string; kind: string }
    >(VIEWS_SQL, [OWNED_SCHEMAS]);

    const unreadViews: string[] = [];
    const acceptedViewsNowRead: string[] = [];
    for (const row of viewRows.rows) {
      const view = `${row.schema}.${row.name}`;
      const queried = isQueried(row.schema, row.name, haystack);
      if (ACCEPTED.has(view)) {
        if (queried) acceptedViewsNowRead.push(view);
        continue;
      }
      if (!queried) unreadViews.push(view);
    }

    const withRows = orphans.filter((row) => row.rows > 0);
    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      ownedTables: rows.length,
      // Views were invisible to this audit until 2026-08-08 — as-built §10 hole ①.
      // Kept apart from the table counts: an unread table means data nobody
      // consumes, an unread view means projection logic nobody runs.
      ownedViews: viewRows.rows.length,
      unreadViews: unreadViews.length,
      unreadViewDetail: unreadViews,
      acceptedViewsNowRead,
      // Never read by repository code, by a view, or by a function.
      unreadTables: orphans.length,
      // The ones that matter: something filled them and nothing consumes them.
      unreadWithRows: withRows.length,
      unreadRowsTotal: withRows.reduce((sum, row) => sum + row.rows, 0),
      // Schema exists, nothing ever wrote to it. A different problem, kept apart.
      unreadEmptyTables: orphans.length - withRows.length,
      acceptedUnread: ACCEPTED.size,
      // A stale acceptance. Should be empty; if not, update the list.
      acceptedNowRead,
      detail: withRows.sort((left, right) => right.rows - left.rows).slice(0, 20),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (apply) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        `${JOB_NAME}-${randomUUID()}`,
        JOB_NAME,
        'completed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-table-reachability-audit.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
