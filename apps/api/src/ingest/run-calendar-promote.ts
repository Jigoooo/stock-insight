// B — promote research-common's calendar snapshots into Postgres.
//
// Both upstream collectors are already scheduled and have run daily for months:
//   scripts/event_calendar.py            → state/calendar/events-latest.json
//   research_common/macro_calendar.py    → state/macro/macro-calendar-latest.json
//
// Neither reaches this database. The path that does — signal cards into
// signal_graph.db and on to public.entities — keeps the narrative and DROPS THE
// DATE. So 'BOK 2026-08-28 한국은행 금통위, D-21' sat on disk while nothing here
// knew a rate decision was three weeks out. This job is not new collection; it is
// the last hop that was never built.
//
// WHAT IT DOES NOT PROMOTE, and why it is not silent about it:
//   policy_events — macro_calendar.py tags news headlines with a category
//     ('crypto_legislation' + a Forbes title). There is no vote date, no chamber,
//     no bill id. Promoting them into a table called scheduled_event would put a
//     headline where a schedule belongs. Counted in the summary as skipped.
//
// Reading another project's files is a real coupling and it is bounded: read-only,
// two known paths, and a missing or stale file is reported rather than throwing —
// a calendar that did not refresh must not take the pipeline down with it.

import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

const JOB_NAME = 'stock-insight-calendar-promote';

const RESEARCH_COMMON =
  process.env.RESEARCH_COMMON_PATH?.trim() || '/home/jigoo/.hermes/workspace/research-common';

/** A snapshot older than this is reported as stale rather than trusted silently. */
const STALE_AFTER_HOURS = 36;

type PgModule = { Pool: new (c: { connectionString: string; max: number }) => Pool };
type Pool = { connect: () => Promise<PoolClient>; end: () => Promise<void> };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export type PromotedEvent = {
  sourceKey: string;
  eventKind: 'central_bank_meeting' | 'economic_release' | 'earnings';
  scheduledDate: string;
  region: string | null;
  title: string;
  detail: Record<string, unknown>;
  dedupeKey: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Same shape as the event ledger's key: stable inputs, no clock. */
function key(parts: readonly string[]): string {
  return parts.map((part) => part.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)).join(':');
}

/**
 * Pure so the mapping is testable without the other project's files present.
 *
 * Rows missing a usable date are DROPPED and counted, never defaulted to today —
 * a calendar entry whose date was invented is worse than a missing one.
 */
export function mapMacroCalendar(payload: unknown): {
  events: PromotedEvent[];
  skipped: Record<string, number>;
} {
  const skipped: Record<string, number> = {};
  const bump = (reason: string): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const root = (payload ?? {}) as Record<string, unknown>;
  const events: PromotedEvent[] = [];

  for (const raw of Array.isArray(root['upcoming_central_banks'])
    ? (root['upcoming_central_banks'] as Record<string, unknown>[])
    : []) {
    const date = String(raw['date'] ?? '');
    const bank = String(raw['cb'] ?? '').trim();
    if (!ISO_DATE.test(date) || !bank) {
      bump('central_bank_missing_date_or_name');
      continue;
    }
    events.push({
      sourceKey: 'research-common:macro-calendar',
      eventKind: 'central_bank_meeting',
      scheduledDate: date,
      region: bank,
      title: String(raw['note'] ?? bank).trim() || bank,
      detail: { cb: bank, d_minus: raw['d_minus'] ?? null, imminent: raw['imminent'] ?? null },
      dedupeKey: key(['cb', bank, date]),
    });
  }

  // Counted, not promoted. See the header.
  const policy = root['policy_events'];
  if (Array.isArray(policy) && policy.length > 0) {
    skipped['policy_events_are_headlines_not_schedules'] = policy.length;
  }
  return { events, skipped };
}

export function mapEventCalendar(payload: unknown): {
  events: PromotedEvent[];
  skipped: Record<string, number>;
} {
  const skipped: Record<string, number> = {};
  const bump = (reason: string): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const root = (payload ?? {}) as Record<string, unknown>;
  const events: PromotedEvent[] = [];

  for (const raw of Array.isArray(root['economic_events'])
    ? (root['economic_events'] as Record<string, unknown>[])
    : []) {
    const date = String(raw['date'] ?? '');
    const name = String(raw['event'] ?? '').trim();
    if (!ISO_DATE.test(date) || !name) {
      bump('economic_missing_date_or_name');
      continue;
    }
    const country = String(raw['country'] ?? '').trim() || null;
    events.push({
      sourceKey: 'research-common:event-calendar',
      eventKind: 'economic_release',
      scheduledDate: date,
      region: country,
      title: name,
      // actual/consensus/previous are kept: an economic_release row is forward
      // looking until it publishes and then carries its own outcome.
      detail: {
        actual: raw['actual'] ?? null,
        consensus: raw['consensus'] ?? null,
        previous: raw['previous'] ?? null,
        time_et: raw['time_et'] ?? null,
        high_signal: raw['high_signal'] ?? false,
      },
      dedupeKey: key(['econ', country ?? 'unknown', name, date]),
    });
  }

  for (const raw of Array.isArray(root['earnings'])
    ? (root['earnings'] as Record<string, unknown>[])
    : []) {
    const date = String(raw['date'] ?? '');
    const symbol = String(raw['symbol'] ?? '').trim();
    if (!ISO_DATE.test(date) || !symbol) {
      bump('earnings_missing_date_or_symbol');
      continue;
    }
    events.push({
      sourceKey: 'research-common:event-calendar',
      eventKind: 'earnings',
      scheduledDate: date,
      region: null,
      title: `${symbol} — ${String(raw['name'] ?? symbol).trim()}`,
      detail: {
        symbol,
        name: raw['name'] ?? null,
        time: raw['time'] ?? null,
        eps_forecast: raw['eps_forecast'] ?? null,
      },
      dedupeKey: key(['earnings', symbol, date]),
    });
  }
  return { events, skipped };
}

const UPSERT_SQL = `
INSERT INTO market.scheduled_event (
  source_key, event_kind, scheduled_date, region, title, detail, dedupe_key, observed_at
) VALUES ($1, $2, $3::date, $4, $5, $6::jsonb, $7, $8::timestamptz)
-- A calendar is revised: a consensus updates, an actual lands, a date moves. The
-- row is replaced rather than appended — the superseded forecast is not evidence
-- anything cites, unlike the relation ledger where history is the point.
ON CONFLICT (dedupe_key) DO UPDATE
  SET scheduled_date = EXCLUDED.scheduled_date,
      title = EXCLUDED.title,
      detail = EXCLUDED.detail,
      observed_at = GREATEST(market.scheduled_event.observed_at, EXCLUDED.observed_at),
      known_at = now()
RETURNING (xmax = 0) AS inserted
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

async function readSnapshot(
  relative: string,
): Promise<{ payload: unknown; generatedAt: string | null; ageHours: number | null }> {
  const path = `${RESEARCH_COMMON}/${relative}`;
  const info = await stat(path);
  const payload = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  const generatedAt =
    typeof payload['generated_at_kst'] === 'string' ? payload['generated_at_kst'] : null;
  const ageHours = (Date.now() - info.mtimeMs) / 3_600_000;
  return { payload, generatedAt, ageHours };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const sources: {
      file: string;
      map: (payload: unknown) => { events: PromotedEvent[]; skipped: Record<string, number> };
    }[] = [
      { file: 'state/macro/macro-calendar-latest.json', map: mapMacroCalendar },
      { file: 'state/calendar/events-latest.json', map: mapEventCalendar },
    ];

    const perSource: Record<string, unknown> = {};
    let inserted = 0;
    let updated = 0;
    const skippedTotal: Record<string, number> = {};

    for (const source of sources) {
      let snapshot;
      try {
        snapshot = await readSnapshot(source.file);
      } catch (error) {
        // A missing upstream file is a reported condition, not a crash. This job
        // reads another project's disk; that project failing must not take this
        // pipeline down.
        perSource[source.file] = { readable: false, error: String(error).slice(0, 120) };
        continue;
      }
      const { events, skipped } = source.map(snapshot.payload);
      for (const [reason, count] of Object.entries(skipped)) {
        skippedTotal[reason] = (skippedTotal[reason] ?? 0) + count;
      }
      const observedAt = snapshot.generatedAt ?? startedAt.toISOString();

      let sourceInserted = 0;
      let sourceUpdated = 0;
      for (const event of events) {
        const written = await client.query<QueryResultRow & { inserted: boolean }>(UPSERT_SQL, [
          event.sourceKey,
          event.eventKind,
          event.scheduledDate,
          event.region,
          event.title,
          JSON.stringify(event.detail),
          event.dedupeKey,
          observedAt,
        ]);
        if (written.rows[0]?.inserted) sourceInserted += 1;
        else sourceUpdated += 1;
      }
      inserted += sourceInserted;
      updated += sourceUpdated;
      perSource[source.file] = {
        readable: true,
        generatedAt: snapshot.generatedAt,
        ageHours: snapshot.ageHours === null ? null : Math.round(snapshot.ageHours * 10) / 10,
        // A snapshot this old means the upstream collector stopped. Reported as a
        // number so it can be watched, not thrown.
        stale: (snapshot.ageHours ?? 0) > STALE_AFTER_HOURS,
        events: events.length,
        inserted: sourceInserted,
        updated: sourceUpdated,
      };
    }

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      researchCommonPath: RESEARCH_COMMON,
      inserted,
      updated,
      // Named reasons. 'policy_events_are_headlines_not_schedules' is the count of
      // legislation rows deliberately NOT promoted — they carry no vote date.
      skipped: skippedTotal,
      perSource,
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

if (process.argv[1]?.endsWith('run-calendar-promote.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
