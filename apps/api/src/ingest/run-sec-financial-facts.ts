import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET C / C-2 (US): SEC companyfacts -> market.financial_fact (filing-level, quarterly+annual).
// PIT: available_at = SEC "filed" date of the accession that reported the value.
// Amendments: same (concept, period_end, fiscal_period) under a different accession
// insert as new rows; latest filed_at wins at read time.

const JOB_NAME = 'stock-insight-sec-financial-facts';
const SEC_BASE = 'https://data.sec.gov/api/xbrl/companyfacts';
const USER_AGENT = 'stock-insight research contact@jigooo.com';

const US_ISSUERS_SQL = `
SELECT company.entity_id AS issuer_entity_id,
       cik_ident.identifier_value AS cik,
       internal_ident.identifier_value AS company_key
FROM core.entity company
JOIN core.entity_identifier cik_ident
  ON cik_ident.entity_id = company.entity_id AND cik_ident.identifier_type = 'CIK'
JOIN core.entity_identifier internal_ident
  ON internal_ident.entity_id = company.entity_id
 AND internal_ident.identifier_type = 'INTERNAL_KEY'
WHERE company.entity_type = 'Company'
ORDER BY internal_ident.identifier_value
`;

const CONCEPTS_SQL = `
SELECT concept, us_gaap_tags, unit_class FROM market.financial_concept
WHERE cardinality(us_gaap_tags) > 0
`;

const UPSERT_FACT_SQL = `
INSERT INTO market.financial_fact (
  issuer_entity_id, concept, value, unit, currency, period_start, period_end,
  fiscal_year, fiscal_period, filing_ref, form, filed_at, available_at,
  source_provider, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, 'sec-companyfacts', $13::jsonb)
ON CONFLICT (issuer_entity_id, concept, period_end, fiscal_period, filing_ref) DO NOTHING
RETURNING fact_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'sec-edgar', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type IssuerRow = QueryResultRow & {
  issuer_entity_id: string | number;
  cik: string;
  company_key: string;
};

type ConceptRow = QueryResultRow & {
  concept: string;
  us_gaap_tags: string[];
  unit_class: 'currency' | 'shares' | 'pure';
};

type SecUnitEntry = {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
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

function normalizeFiscalPeriod(fp: string | undefined, form: string | undefined): string | null {
  if (fp === 'FY') return 'FY';
  if (fp === 'Q1' || fp === 'Q2' || fp === 'Q3') return fp;
  // SEC uses fp=Q4 rarely; 10-K covers FY. Keep Q4 when explicitly tagged.
  if (fp === 'Q4') return 'Q4';
  if (form === '10-K' || form === '20-F') return 'FY';
  return null;
}

async function fetchCompanyFacts(cik: string): Promise<unknown | null> {
  const response = await fetch(`${SEC_BASE}/CIK${cik}.json`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`SEC companyfacts CIK${cik} failed with HTTP ${response.status}`);
  return response.json();
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const sinceYear = intOption('--since-year', 2020, 2100);
  const limit = intOption('--limit', 200, 500);
  const startedAt = new Date();

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const issuers = await client.query<IssuerRow>(US_ISSUERS_SQL);
    const concepts = await client.query<ConceptRow>(CONCEPTS_SQL);
    await client.query('COMMIT');

    const tagToConcept = new Map<string, ConceptRow>();
    for (const concept of concepts.rows) {
      for (const tag of concept.us_gaap_tags) tagToConcept.set(tag, concept);
    }

    const targets = issuers.rows.slice(0, limit);
    let companiesFetched = 0;
    let companiesMissing = 0;
    let factsSeen = 0;
    let factsInserted = 0;
    const perCompany: Record<string, number> = {};

    for (const issuer of targets) {
      const payload = (await fetchCompanyFacts(issuer.cik)) as {
        facts?: Record<string, Record<string, { units?: Record<string, SecUnitEntry[]> }>>;
      } | null;
      if (!payload?.facts) {
        companiesMissing += 1;
        continue;
      }
      companiesFetched += 1;
      const rows: Array<{
        concept: string;
        value: number;
        unit: string;
        currency: string | null;
        periodStart: string | null;
        periodEnd: string;
        fiscalYear: number;
        fiscalPeriod: string;
        accession: string;
        form: string | null;
        filed: string;
      }> = [];

      for (const taxonomy of ['us-gaap', 'dei'] as const) {
        const facts = payload.facts[taxonomy];
        if (!facts) continue;
        for (const [tag, body] of Object.entries(facts)) {
          const conceptRow = tagToConcept.get(tag);
          if (!conceptRow) continue;
          for (const [unit, entries] of Object.entries(body.units ?? {})) {
            for (const entry of entries) {
              if (
                typeof entry.val !== 'number' ||
                !entry.end ||
                !entry.accn ||
                !entry.filed ||
                typeof entry.fy !== 'number' ||
                entry.fy < sinceYear
              ) {
                continue;
              }
              const fiscalPeriod = normalizeFiscalPeriod(entry.fp, entry.form);
              if (!fiscalPeriod) continue;
              factsSeen += 1;
              rows.push({
                concept: conceptRow.concept,
                value: entry.val,
                unit,
                currency: conceptRow.unit_class === 'currency' ? unit.toUpperCase() : null,
                periodStart: entry.start ?? null,
                periodEnd: entry.end,
                fiscalYear: entry.fy,
                fiscalPeriod,
                accession: entry.accn,
                form: entry.form ?? null,
                filed: entry.filed,
              });
            }
          }
        }
      }

      if (apply && rows.length > 0) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('statement_timeout', '180s', true)");
        let insertedForCompany = 0;
        for (const row of rows) {
          const result = await client.query(UPSERT_FACT_SQL, [
            Number(issuer.issuer_entity_id),
            row.concept,
            row.value,
            row.unit,
            row.currency,
            row.periodStart,
            row.periodEnd,
            row.fiscalYear,
            row.fiscalPeriod,
            row.accession,
            row.form,
            row.filed,
            JSON.stringify({ cik: issuer.cik }),
          ]);
          if ((result.rowCount ?? 0) > 0) insertedForCompany += 1;
        }
        await client.query('COMMIT');
        factsInserted += insertedForCompany;
        perCompany[issuer.company_key] = insertedForCompany;
      }
      // SEC fair access: stay well under 10 req/s.
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    const summary = {
      issuers: targets.length,
      companiesFetched,
      companiesMissing,
      sinceYear,
      factsSeen,
      factsInserted,
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `sec-facts-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      factsSeen,
      factsInserted,
      factsSeen - factsInserted,
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
