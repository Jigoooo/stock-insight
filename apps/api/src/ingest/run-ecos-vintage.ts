import { randomUUID } from 'node:crypto';

import pg, { type PoolClient } from 'pg';

// SET C — BOK ECOS macro collector for Korean series.
//
// Shaped after run-fred-vintage.ts, with one structural difference that has to be
// stated rather than hidden: ECOS HAS NO VINTAGE AXIS. FRED/ALFRED exposes
// realtime_start/realtime_end, so a FRED row records what was known on a date and
// carries vintage_quality='realtime'. ECOS StatisticSearch returns only the
// current value of an observation; a revised figure overwrites the old one with
// no way to ask what the number looked like last month.
//
// So these rows are 'approx_collected', the other value market.macro_vintage's
// CHECK allows, and vintage_date is set to observation_date rather than to the
// collection date. Two reasons:
//   - It is the honest approximation for these series. Daily market rates and the
//     policy rate are published on the day they refer to and are not revised, so
//     "known on its own date" is true for them rather than merely convenient.
//   - Using the run date instead would make the primary key
//     (series_key, observation_date, vintage_date) grow by one row per
//     observation per run — the whole history re-inserted nightly. That would
//     look like a working collector while being pure duplication.
// A series that IS revised must not be added here without revisiting this.

import {
  CLOSE_FETCH_RUN_SQL,
  OPEN_FETCH_RUN_SQL,
  registerRawObjectWithRevision,
  writeRawObject,
} from './raw-object-store.ts';

const JOB_NAME = 'stock-insight-ecos-vintage';
const PROVIDER_KEY = 'bok-ecos';
const ECOS_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';

/**
 * Korean daily series. `seriesKey` is `ecos:<STAT_CODE>:<ITEM_CODE>`, following
 * the `fred:<SERIES_ID>` convention of provider prefix plus vendor code, so the
 * key stays traceable back to the exact ECOS table and item.
 *
 * ECOS publishes 834 statistic tables but only SEVEN at a daily cycle (measured
 * 2026-08-07 against StatisticTableList). Everything else is monthly or coarser,
 * and the co-movement model has already measured that monthly series yield 57-59
 * resampled observations against a minimum of 60 — see MACRO_SERIES_EXCLUSIONS.
 * So the daily seven are the entire candidate space, and this list is what
 * survived from it.
 *
 * WHAT DID NOT MAKE IT, and why, so nobody re-derives this:
 *
 *   731Y003 / 731Y001 원화 대미달러 환율 — daily and available, but this is the
 *     SAME QUANTITY as fred:DEXKOUS, which is already collected (1,457 rows) and
 *     already mapped to the `fx` topic. Collecting it again would create a second
 *     Metric entity for one exchange rate, and any correlation computed against
 *     both would double-count it.
 *
 *   802Y001 / 0001000 KOSPI지수 — ADDED 2026-08-07, and it is the one series here
 *     that is NOT a correlation target. It is the KR MARKET FACTOR: the thing
 *     every Korean pair is controlled FOR. Mapping it into
 *     analytics.macro_series_topic would make it both the control and a candidate,
 *     and a Korean stock correlated against KOSPI while controlling for KOSPI is
 *     zero by construction. It is listed in the parity test's
 *     COLLECTED_WITHOUT_TOPIC for exactly that reason.
 *     But swapping the KR market factor changes the beta control under EVERY
 *     Korean edge, which is a modelling decision with its own before/after
 *     measurement, not a line in a collector's series list. It was made on
 *     2026-08-07: KOSPI replaced a synthetic index that averaged the very stocks
 *     being controlled, and 6 of 7 stock-market correlations fell (서울보증보험
 *     0.545 → 0.212). See docs/architecture/stock-insight-as-built-2026-08-07.md §6.
 *
 *   521Y001 뉴스심리지수 — daily, but BOK labels it 실험적 통계 (experimental).
 *     A series whose own publisher marks it provisional should not become
 *     evidence for a relation until someone decides that is acceptable.
 *
 *   722Y001 여수신 프로그램 금리 (정부대출금·무역금융·설비투자 …) — daily, but
 *     these are administered lending-facility rates that move only when a
 *     programme is redesigned. They are policy instruments, not market prices.
 */
const CORE_SERIES = [
  {
    seriesKey: 'ecos:817Y002:010200000',
    statCode: '817Y002',
    itemCode: '010200000',
    // KR 3y treasury, daily since 1998-11-13. The Korean benchmark yield and the
    // closest KR analogue to fred:DGS2; there is no FRED series for it.
    displayName: '국고채(3년) 금리',
  },
  {
    seriesKey: 'ecos:817Y002:010210000',
    statCode: '817Y002',
    itemCode: '010210000',
    // KR 10y treasury, daily since 2000-12-18. Analogue to fred:DGS10.
    displayName: '국고채(10년) 금리',
  },
  {
    seriesKey: 'ecos:817Y002:010300000',
    statCode: '817Y002',
    itemCode: '010300000',
    // Corporate AA- 3y, daily since 1995-01-03. Carried because its spread over
    // 국고채(3년) is the Korean credit signal, and neither leg exists in FRED.
    displayName: '회사채(3년, AA-) 금리',
  },
  {
    seriesKey: 'ecos:817Y002:010502000',
    statCode: '817Y002',
    itemCode: '010502000',
    // CD 91d, daily since 1995-01-03. Short-term KRW funding cost.
    displayName: 'CD(91일) 금리',
  },
  {
    seriesKey: 'ecos:722Y001:0101000',
    statCode: '722Y001',
    itemCode: '0101000',
    // BOK base rate, daily series since 1999-05-06. Analogue to fred:FEDFUNDS.
    //
    // Collected with a caveat that belongs next to the decision: this is a step
    // function. It changes only on MPC decision days, so its daily change series
    // is zero almost everywhere and a correlation against it is close to
    // meaningless. It is here because it is the anchor of the Korean `rates`
    // topic and because the scheduled_event table already carries the 2026-08-28
    // 금통위 — not because the co-movement model is expected to make pairs from
    // it. If it produces none, that is the expected result and not a failure.
    displayName: '한국은행 기준금리',
  },
  {
    seriesKey: 'ecos:802Y001:0001000',
    statCode: '802Y001',
    itemCode: '0001000',
    // KOSPI, daily since 1995-01-03. Collected as the KR MARKET FACTOR, not as a
    // correlation target — see the exclusions note above for why it must not gain
    // a macro_series_topic row.
    //
    // It replaces a synthetic index. MARKET_FACTOR_SQL built the KR control as a
    // daily-rebalanced equal-weighted average of our own 194 Korean holdings,
    // because ^KS11 is absent from market_ts.ohlcv and the copy in
    // stock.market_snapshots holds 141 rows across only 57 distinct dates,
    // stalled at 2026-07-24, against a 1,095-day factor window. That premise was
    // true when it was written and ECOS ends it.
    displayName: 'KOSPI지수',
  },
] as const;

const UPSERT_VINTAGE_SQL = `
INSERT INTO market.macro_vintage (
  series_key, observation_date, vintage_date, value, vintage_quality, available_at, metadata,
  source_revision_id
) VALUES ($1, $2, $3, $4, 'approx_collected', $5, $6::jsonb, $7)
ON CONFLICT (series_key, observation_date, vintage_date) DO NOTHING
RETURNING series_key
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'bok-ecos', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type EcosRow = {
  STAT_CODE: string;
  ITEM_CODE1: string;
  ITEM_NAME1: string;
  UNIT_NAME: string | null;
  TIME: string;
  DATA_VALUE: string | null;
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

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback);
}

/** `2015-01-01` -> `20150101`; ECOS takes no separators. */
function compactDate(iso: string): string {
  return iso.replaceAll('-', '');
}

/** `20150102` -> `2015-01-02`. */
function isoDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/**
 * One page is not a record: ECOS caps a response at 100,000 rows but paginates by
 * an explicit start/end index, and a daily series over ten years exceeds a single
 * comfortable page. The (series, requested range) slice is the coherent unit —
 * the same reasoning as FredWindow — so it is what gets hashed and registered.
 */
export type EcosWindow = {
  recordKey: string;
  statCode: string;
  itemCode: string;
  startTime: string;
  endTime: string;
  rows: EcosRow[];
};

async function fetchSeries(
  statCode: string,
  itemCode: string,
  apiKey: string,
  startTime: string,
  endTime: string,
): Promise<EcosRow[]> {
  const collected: EcosRow[] = [];
  const pageSize = 10_000;
  for (let page = 0; page < 40; page += 1) {
    const start = page * pageSize + 1;
    const end = start + pageSize - 1;
    const url =
      `${ECOS_BASE}/${apiKey}/json/kr/${start}/${end}/` +
      `${statCode}/D/${startTime}/${endTime}/${itemCode}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      throw new Error(`ECOS ${statCode}/${itemCode} failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    // ECOS reports application errors inside a 200 response under a RESULT key.
    // Treating that as an empty page would turn a broken key or a revoked table
    // into "collected 0 rows, no error" — the failure this repo keeps finding.
    const result = payload.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
    if (result !== undefined) {
      // INFO-200 is "no data for this range", which is a legitimate empty answer.
      if (result.CODE === 'INFO-200') break;
      throw new Error(
        `ECOS ${statCode}/${itemCode} returned ${result.CODE ?? 'unknown'}: ${result.MESSAGE ?? ''}`,
      );
    }
    const search = payload.StatisticSearch as { row?: EcosRow[] } | undefined;
    const rows = search?.row ?? [];
    collected.push(...rows);
    if (rows.length < pageSize) break;
  }
  return collected;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const observationStart = option('--from', '2015-01-01');
  const startedAt = new Date();
  const apiKey = required('ECOS_API_KEY');
  const startTime = compactDate(observationStart);
  const endTime = compactDate(new Date().toISOString().slice(0, 10));

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    const perSeries: Record<
      string,
      { observations: number; inserted: number; valueChanged: number }
    > = {};
    let totalObservations = 0;
    let totalInserted = 0;
    let revisionsRegistered = 0;
    let revisionsReplayed = 0;
    let totalValueChanged = 0;
    const valueChangeSamples: Array<{
      seriesKey: string;
      observationDate: string;
      stored: number;
      fetched: number;
    }> = [];

    // bok-ecos was seeded with a contract by migration 020 like every other
    // source; what has never existed is anything writing revisions against it.
    // Measured 2026-08-07: source_id 17, zero source_revision rows.
    const sourceRow = await client.query<{ source_id: number }>(
      `SELECT source_id FROM ingestion.source WHERE provider_key = $1`,
      [PROVIDER_KEY],
    );
    if (sourceRow.rows.length !== 1) {
      throw new Error(
        `expected exactly one ${PROVIDER_KEY} source, found ${sourceRow.rows.length}`,
      );
    }
    const sourceId = Number(sourceRow.rows[0]!.source_id);

    let fetchRunId: number | null = null;
    if (apply) {
      const runId = `${JOB_NAME}-${randomUUID()}`;
      await client.query('BEGIN');
      const opened = await client.query<{ fetch_run_id: string | number }>(OPEN_FETCH_RUN_SQL, [
        PROVIDER_KEY,
        runId,
        `${PROVIDER_KEY}:${runId}`,
        startedAt.toISOString(),
      ]);
      fetchRunId = Number(opened.rows[0]!.fetch_run_id);
      await client.query('COMMIT');
    }

    for (const series of CORE_SERIES) {
      const rows = await fetchSeries(series.statCode, series.itemCode, apiKey, startTime, endTime);
      const window: EcosWindow = {
        recordKey: `${series.statCode}:${series.itemCode}:${startTime}:${endTime}`,
        statCode: series.statCode,
        itemCode: series.itemCode,
        startTime,
        endTime,
        rows,
      };
      perSeries[series.seriesKey] = { observations: rows.length, inserted: 0, valueChanged: 0 };
      totalObservations += rows.length;

      // Does ECOS revise these series? The header claims it does not, and the
      // whole vintage_date=observation_date design rests on that claim. But
      // ON CONFLICT DO NOTHING would DISCARD a revised value and still report
      // inserted:0, so the claim would be indistinguishable from silence — and
      // after the first --apply there is no way to tell the two apart.
      //
      // So it is measured every run instead of asserted once. A non-zero
      // valueChanged means the claim is false and the key design has to be
      // revisited; it is surfaced in the summary rather than acted on here,
      // because silently rewriting history is the worse failure.
      const stored = await client.query<{ observation_date: string; value: string | null }>(
        `SELECT observation_date::text, value::text
         FROM market.macro_vintage
         WHERE series_key = $1 AND vintage_quality = 'approx_collected'`,
        [series.seriesKey],
      );
      const storedByDate = new Map(stored.rows.map((row) => [row.observation_date, row.value]));
      for (const row of rows) {
        const previous = storedByDate.get(isoDate(row.TIME));
        if (previous === undefined || previous === null) continue;
        const fetched = row.DATA_VALUE === null ? null : Number(row.DATA_VALUE);
        if (fetched === null || !Number.isFinite(fetched)) continue;
        // Stored is numeric; compare as numbers so 3.790 and 3.79 do not differ.
        if (Math.abs(Number(previous) - fetched) < 1e-9) continue;
        perSeries[series.seriesKey]!.valueChanged += 1;
        totalValueChanged += 1;
        if (valueChangeSamples.length < 20) {
          valueChangeSamples.push({
            seriesKey: series.seriesKey,
            observationDate: isoDate(row.TIME),
            stored: Number(previous),
            fetched,
          });
        }
      }

      if (!apply) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '120s', true)");
      const fetchedAt = new Date().toISOString();
      const raw = await writeRawObject({
        providerKey: PROVIDER_KEY,
        content: JSON.stringify({
          stat_code: series.statCode,
          item_code: series.itemCode,
          start_time: startTime,
          end_time: endTime,
          rows,
        }),
        extension: 'json',
        fetchedAt: new Date(fetchedAt),
      });
      const registered = await registerRawObjectWithRevision(client, {
        fetchRunId: fetchRunId!,
        sourceId,
        providerRecordKey: window.recordKey,
        contentHash: raw.contentHash,
        objectUri: raw.objectUri,
        httpMeta: {
          endpoint: ECOS_BASE,
          stat_code: series.statCode,
          item_code: series.itemCode,
          cycle: 'D',
          observation_start: observationStart,
        },
        fetchedAt,
      });
      if (registered.replay) revisionsReplayed += 1;
      else revisionsRegistered += 1;

      for (const row of rows) {
        // ECOS omits DATA_VALUE on non-trading days rather than sending a
        // sentinel; FRED sends '.'. Both mean "no observation".
        const raw_value = row.DATA_VALUE;
        const numeric = raw_value === null || raw_value.trim() === '' ? null : Number(raw_value);
        const observationDate = isoDate(row.TIME);
        const result = await client.query(UPSERT_VINTAGE_SQL, [
          series.seriesKey,
          observationDate,
          // See the header: ECOS exposes no realtime axis, so the vintage is
          // approximated by the observation's own date and labelled as such.
          observationDate,
          numeric !== null && Number.isFinite(numeric) ? numeric : null,
          startedAt.toISOString(),
          JSON.stringify({
            unit: row.UNIT_NAME,
            item_name: row.ITEM_NAME1,
            vintage_basis: 'observation_date',
            vintage_note: 'ECOS StatisticSearch exposes no realtime/vintage axis',
          }),
          registered.sourceRevisionId,
        ]);
        if ((result.rowCount ?? 0) > 0) {
          perSeries[series.seriesKey]!.inserted += 1;
          totalInserted += 1;
        }
      }
      await client.query('COMMIT');
      // ECOS does not publish a rate limit; be at least as polite as the FRED job.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const summary = {
      series: CORE_SERIES.length,
      observationStart,
      totalObservations,
      totalInserted,
      revisionsRegistered,
      revisionsReplayed,
      // Non-zero means ECOS revised a value this collector already stored, and
      // ON CONFLICT DO NOTHING kept the old one. See the loop that fills it.
      totalValueChanged,
      valueChangeSamples,
      perSeries,
    };
    if (apply && fetchRunId !== null) {
      await client.query(CLOSE_FETCH_RUN_SQL, [
        fetchRunId,
        new Date().toISOString(),
        'success',
        totalObservations,
        totalInserted,
        totalObservations - totalInserted,
        null,
        new Date().toISOString(),
        JSON.stringify(summary),
      ]);
    }
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `ecos-vintage-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      totalObservations,
      totalInserted,
      totalObservations - totalInserted,
      JSON.stringify({ ...summary, perSeries: undefined }),
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
