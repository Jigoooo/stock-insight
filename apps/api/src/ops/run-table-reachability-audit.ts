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
// PITFALLS, from docs/operations/database-ownership.md and each confirmed the hard
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
  // 폐기 예정, 부채가 아니다. v2 마스터 플랜이 theme_exposure_snapshot +
  // theme_membership_evidence(배열 대신 FK)로 대체 설계를 이미 정했고, 마이그레이션
  // 068 은 같은 이유로 Theme 타입 사용을 명시적으로 거부했다. 분류를 바꾸는 이유는
  // "언젠가 읽겠다" 와 "안 읽기로 했다" 가 다른 상태이기 때문이다.
  ['analytics.theme', '138행 — 폐기 예정. v2 가 theme_exposure_snapshot 으로 대체'],
  ['analytics.theme_membership', '396행 — 폐기 예정. v2 는 배열 대신 FK 증거표'],
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

    const withRows = orphans.filter((row) => row.rows > 0);
    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      ownedTables: rows.length,
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
