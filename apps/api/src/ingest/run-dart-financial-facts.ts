import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET C / C-2 (KR): OpenDART fnlttSinglAcntAll -> market.financial_fact.
// Quarterly + annual, filing-level (rcept_no as filing_ref).
// NOTE: daily API quota — run with --limit and resume; idempotent upserts.

const JOB_NAME = 'stock-insight-dart-financial-facts';
const DART_BASE = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json';

// reprt_code: 11013 Q1, 11012 half(Q2), 11014 Q3, 11011 annual(FY)
const REPORT_CODES: Array<{ code: string; period: 'Q1' | 'H1' | 'Q3' | 'FY' }> = [
  { code: '11013', period: 'Q1' },
  { code: '11012', period: 'H1' },
  { code: '11014', period: 'Q3' },
  { code: '11011', period: 'FY' },
];

const KR_ISSUERS_SQL = `
SELECT company.entity_id AS issuer_entity_id,
       dart_ident.identifier_value AS corp_code,
       internal_ident.identifier_value AS company_key
FROM core.entity company
JOIN core.entity_identifier dart_ident
  ON dart_ident.entity_id = company.entity_id AND dart_ident.identifier_type = 'DART_CORP_CODE'
JOIN core.entity_identifier internal_ident
  ON internal_ident.entity_id = company.entity_id
 AND internal_ident.identifier_type = 'INTERNAL_KEY'
WHERE company.entity_type = 'Company'
ORDER BY internal_ident.identifier_value
`;

const CONCEPTS_SQL = `
SELECT concept, dart_account_ids FROM market.financial_concept
WHERE cardinality(dart_account_ids) > 0
`;

const UPSERT_FACT_SQL = `
INSERT INTO market.financial_fact (
  issuer_entity_id, concept, value, unit, currency, period_start, period_end,
  fiscal_year, fiscal_period, filing_ref, form, filed_at, available_at,
  source_provider, metadata
) VALUES ($1, $2, $3, 'KRW', 'KRW', $4, $5, $6, $7, $8, $9, $10, $10, 'opendart', $11::jsonb)
ON CONFLICT (issuer_entity_id, concept, period_end, fiscal_period, filing_ref) DO NOTHING
RETURNING fact_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'opendart', $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
`;

type IssuerRow = QueryResultRow & {
  issuer_entity_id: string | number;
  corp_code: string;
  company_key: string;
};

type ConceptRow = QueryResultRow & { concept: string; dart_account_ids: string[] };

type DartRow = {
  rcept_no?: string;
  account_id?: string;
  account_nm?: string;
  thstrm_amount?: string;
  thstrm_dt?: string;
  fs_div?: string;
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function intOption(name: string, fallback: number, max: number): number {
  const index = process.argv.indexOf(name);
  const raw = index < 0 ? undefined : process.argv[index + 1];
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replaceAll(',', '').trim();
  if (!cleaned || cleaned === '-') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function periodEndFor(year: number, period: 'Q1' | 'H1' | 'Q3' | 'FY', fiscalClose = 12): string {
  // Standard Dec-close assumption; non-Dec closers keep metadata flag.
  if (period === 'Q1') return `${year}-03-31`;
  if (period === 'H1') return `${year}-06-30`;
  if (period === 'Q3') return `${year}-09-30`;
  return `${year}-12-31`;
}

async function fetchDart(
  apiKey: string,
  corpCode: string,
  year: number,
  reportCode: string,
): Promise<{ status: string; rows: DartRow[] }> {
  const url = new URL(DART_BASE);
  url.searchParams.set('crtfc_key', apiKey);
  url.searchParams.set('corp_code', corpCode);
  url.searchParams.set('bsns_year', String(year));
  url.searchParams.set('reprt_code', reportCode);
  url.searchParams.set('fs_div', 'CFS');
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`OpenDART HTTP ${response.status}`);
  const payload = (await response.json()) as { status?: string; list?: DartRow[] };
  return { status: payload.status ?? '999', rows: payload.list ?? [] };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const fromYear = intOption('--from-year', 2022, 2100);
  const toYear = intOption('--to-year', new Date().getFullYear(), 2100);
  const limit = intOption('--limit', 30, 300);
  const offset = intOption('--offset', 1, 300) - 1;
  const startedAt = new Date();
  const apiKey = required('OPENDART_API_KEY');

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  let quotaExhausted = false;
  try {
    await client.query('BEGIN READ ONLY');
    const issuers = await client.query<IssuerRow>(KR_ISSUERS_SQL);
    const concepts = await client.query<ConceptRow>(CONCEPTS_SQL);
    await client.query('COMMIT');

    const accountToConcept = new Map<string, string>();
    for (const concept of concepts.rows) {
      for (const accountId of concept.dart_account_ids) accountToConcept.set(accountId, concept.concept);
    }

    const targets = issuers.rows.slice(offset, offset + limit);
    let requests = 0;
    let factsSeen = 0;
    let factsInserted = 0;

    outer: for (const issuer of targets) {
      for (let year = fromYear; year <= toYear; year += 1) {
        for (const report of REPORT_CODES) {
          const { status, rows } = await fetchDart(apiKey, issuer.corp_code, year, report.code);
          requests += 1;
          if (status === '020') {
            quotaExhausted = true;
            break outer;
          }
          if (status !== '000') continue; // 013 = no data for that period
          const matched = rows.filter(
            (row) => row.account_id && accountToConcept.has(row.account_id),
          );
          factsSeen += matched.length;
          if (apply && matched.length > 0) {
            await client.query('BEGIN');
            await client.query("SELECT set_config('statement_timeout', '120s', true)");
            for (const row of matched) {
              const value = parseAmount(row.thstrm_amount);
              if (value === null || !row.rcept_no) continue;
              const filedAt = `${row.rcept_no.slice(0, 4)}-${row.rcept_no.slice(4, 6)}-${row.rcept_no.slice(6, 8)}T09:00:00+09:00`;
              const result = await client.query(UPSERT_FACT_SQL, [
                Number(issuer.issuer_entity_id),
                accountToConcept.get(row.account_id!)!,
                value,
                null,
                periodEndFor(year, report.period),
                year,
                report.period,
                row.rcept_no,
                report.code,
                filedAt,
                JSON.stringify({ corp_code: issuer.corp_code, account_nm: row.account_nm }),
              ]);
              if ((result.rowCount ?? 0) > 0) factsInserted += 1;
            }
            await client.query('COMMIT');
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
    }

    const summary = {
      issuers: targets.length,
      offset: offset + 1,
      fromYear,
      toYear,
      requests,
      factsSeen,
      factsInserted,
      quotaExhausted,
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `dart-facts-${randomUUID()}`,
      JOB_NAME,
      quotaExhausted ? 'partial' : 'completed',
      startedAt.toISOString(),
      new Date().toISOString(),
      factsSeen,
      factsInserted,
      factsSeen - factsInserted,
      quotaExhausted ? '{"reason":"dart_quota_exhausted"}' : null,
      JSON.stringify(summary),
    ]);
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
