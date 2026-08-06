// Legislative actions from api.congress.gov into market.scheduled_event.
//
// This was the one gap that no project filled. Migration 074 recorded it: the
// nearest prior art, macro_calendar.py's 'policy_events', tags news headlines with
// a category ('crypto_legislation' + a Forbes title) and carries no vote date, no
// chamber, no bill id. CONGRESS_GOV_API_KEY arrived 2026-08-07 and the API returns
// the shape that was missing — S850 2026-08-05 'Passed Senate with amendments',
// HR9882 2026-07-22 'Referred to the House Committee on Homeland Security'.
//
// WHY THIS MATTERS HERE, and the limit of it. 623 unattributed policy_event rows
// come from topic-shaped feeds (MACRO:tariffs 33, MACRO:crypto_regulation 241,
// MACRO:gl_major_event 288) and have nothing to attach to: the 'trade' topic has
// zero series and 'crypto_regulation' is not in the vocabulary at all. Bills give
// those events a dated thing to sit beside.
//
// It does NOT give them an impact path. A macro series reaches a stock through
// MEASURED_BY -> MACRO_COMOVEMENT, which is a correlation; a bill is not a
// correlation. The bridge from a policy to the companies it touches is EXPOSES,
// and EXPOSES stands at zero accepted revisions. Saying "bills now connect to
// stocks" would be false, and this file is where that is written down.

import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

const JOB_NAME = 'stock-insight-congress-bills';
const API_BASE = 'https://api.congress.gov/v3/bill';

/**
 * Congress number, derived rather than pinned so it does not go stale.
 * The 1st Congress began in 1789 and each runs two years: 2026 → 119.
 *
 * SCOPING TO A CONGRESS IS NOT OPTIONAL. The unscoped /v3/bill endpoint sorted by
 * updateDate returns bills whose API RECORD was touched recently, which is not the
 * same as bills that were acted on recently — the first live run pulled 499 rows
 * whose action dates ran 1995 to 2016. Real actions, useless as a calendar.
 */
function currentCongress(year: number): number {
  return Math.floor((year - 1789) / 2) + 1;
}

/** Congress.gov allows 5,000 requests/hour; one page of 250 is one request. */
const PAGE_SIZE = 250;

type PgModule = { Pool: new (c: { connectionString: string; max: number }) => Pool };
type Pool = { connect: () => Promise<PoolClient>; end: () => Promise<void> };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function intOption(flag: string, fallback: number, max: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${flag} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

export type BillAction = {
  scheduledDate: string;
  title: string;
  detail: Record<string, unknown>;
  dedupeKey: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure, so the mapping is testable without a key.
 *
 * A bill with no latestAction date is DROPPED. Congress.gov returns bills whose
 * only date is `updateDate` — the moment the API record changed, not the moment
 * anything happened in a chamber. Using it would put an administrative timestamp
 * in a column that readers will take for a legislative date.
 */
export function mapBills(payload: unknown): {
  actions: BillAction[];
  skipped: Record<string, number>;
} {
  const skipped: Record<string, number> = {};
  const bump = (reason: string): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const bills = (payload as { bills?: unknown })?.bills;
  const actions: BillAction[] = [];
  if (!Array.isArray(bills)) return { actions, skipped };

  for (const raw of bills as Record<string, unknown>[]) {
    const latest = (raw['latestAction'] ?? {}) as Record<string, unknown>;
    const actionDate = String(latest['actionDate'] ?? '');
    const type = String(raw['type'] ?? '').trim();
    const num = String(raw['number'] ?? '').trim();
    const title = String(raw['title'] ?? '').trim();

    if (!ISO_DATE.test(actionDate)) {
      // updateDate exists on these rows and is deliberately not substituted.
      bump('no_action_date');
      continue;
    }
    if (!type || !num || !title) {
      bump('incomplete_bill_identity');
      continue;
    }
    const billId = `${type}${num}`;
    // Chamber from the bill type, which is what carries it: S/SJRES/SCONRES/SRES
    // originate in the Senate, H*/HR in the House. The API's own `originChamber`
    // is not on this endpoint's summary rows.
    const chamber = /^S/i.test(type) ? 'Senate' : 'House';
    actions.push({
      scheduledDate: actionDate,
      title: `${billId} — ${title}`,
      detail: {
        bill_id: billId,
        bill_type: type,
        bill_number: num,
        congress: raw['congress'] ?? null,
        chamber,
        action_text: latest['text'] ?? null,
        url: raw['url'] ?? null,
      },
      // One row per (bill, action date). A later action on the same bill is a new
      // row; the same action re-fetched replaces itself.
      dedupeKey: `bill:${billId.toLowerCase()}:${actionDate}`,
    });
  }
  return { actions, skipped };
}

const UPSERT_SQL = `
INSERT INTO market.scheduled_event (
  source_key, event_kind, scheduled_date, region, title, detail, dedupe_key, observed_at
) VALUES ('congress.gov', 'legislative_action', $1::date, 'US', $2, $3::jsonb, $4, $5::timestamptz)
ON CONFLICT (dedupe_key) DO UPDATE
  SET title = EXCLUDED.title,
      detail = EXCLUDED.detail,
      observed_at = GREATEST(market.scheduled_event.observed_at, EXCLUDED.observed_at),
      known_at = now()
RETURNING (xmax = 0) AS inserted
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const pages = intOption('--pages', 2, 20);
  const congress = intOption('--congress', currentCongress(new Date().getFullYear()), 200);
  const startedAt = new Date();
  const apiKey = required('CONGRESS_GOV_API_KEY');

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();

  let requests = 0;
  try {
    await client.query('BEGIN');
    let inserted = 0;
    let updated = 0;
    let fetched = 0;
    const skippedTotal: Record<string, number> = {};

    for (let page = 0; page < pages; page += 1) {
      const url = new URL(`${API_BASE}/${congress}`);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(page * PAGE_SIZE));
      // A SPACE, not a '+'. congress.gov wants `updateDate+desc`, and
      // URLSearchParams encodes a literal '+' as %2B — which the API silently
      // ignores, returning an unsorted page. Passing a space makes URLSearchParams
      // emit the '+' the API wants. Measured: with %2B the first live run returned
      // 2025-01 to 2025-04 actions; with the space it returns 2026.
      //
      // Silently is the operative word — no error, no empty result, just the wrong
      // slice. The insert count looked healthy both times.
      url.searchParams.set('sort', 'updateDate desc');

      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      requests += 1;
      if (!response.ok) throw new Error(`congress.gov HTTP ${response.status}`);
      const payload = (await response.json()) as { bills?: unknown[] };
      const count = Array.isArray(payload.bills) ? payload.bills.length : 0;
      fetched += count;

      const { actions, skipped } = mapBills(payload);
      for (const [reason, n] of Object.entries(skipped)) {
        skippedTotal[reason] = (skippedTotal[reason] ?? 0) + n;
      }
      for (const action of actions) {
        const written = await client.query<QueryResultRow & { inserted: boolean }>(UPSERT_SQL, [
          action.scheduledDate,
          action.title,
          JSON.stringify(action.detail),
          action.dedupeKey,
          startedAt.toISOString(),
        ]);
        if (written.rows[0]?.inserted) inserted += 1;
        else updated += 1;
      }
      if (count < PAGE_SIZE) break;
    }

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      congress,
      requests,
      billsFetched: fetched,
      inserted,
      updated,
      // 'no_action_date' is the honest one: those bills carry only updateDate,
      // which is when the API record changed, not when a chamber did anything.
      skipped: skippedTotal,
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
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-congress-bills.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
