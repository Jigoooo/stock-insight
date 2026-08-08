# Analytics pipeline outage, 2026-07-29 .. 2026-08-02

The nightly analytics pipeline failed three times a night for four days. Nobody
noticed, because a mid-pipeline failure recorded nothing except `wrapper_failed`.
This is what happened and what now prevents it.

## Symptom

`stock-insight-analytics-wrapper` failed at 22:45 / 22:54 / 23:03 every night from
2026-07-29. Last success: 2026-07-28. `migration_runs` held only:

```
status = failed, error = 'wrapper_failed'
```

No stage rows. `pipeline_record_stage_success` writes a row **after** each stage
succeeds, so a stage that dies leaves no trace at all — the pipeline was opaque
exactly when it needed to be legible.

RSS news and the knowledge pipeline kept running normally, so serving data stayed
warm and nothing looked broken from the product side.

## Two causes, one shape

Both are the same mistake: treating "upstream reference data has not arrived" as
if it were "the data contradicts itself".

### 1. Exchange misassignment (data)

`run-core-identity-sync` refused two tickers whose `core.listing` said KOSPI while
the authoritative profile said KOSDAQ:

| Ticker | Name | listing | expected (`corporationClass`) |
| --- | --- | --- | --- |
| 060720 | 케이에이치바텍 | EXCHANGE:KOSPI | EXCHANGE:KOSDAQ |
| 086390 | 유니테스트 | EXCHANGE:KOSPI | EXCHANGE:KOSDAQ |

Both were written by the `entities-v1` backfill on 2026-07-24 with
`exchange_confidence: profile_class`, before any profile existed for them. When
the weekly fundamentals backfill created the profiles on 2026-08-01, the derived
exchange finally disagreed with what had been guessed.

Verified externally (Bloomberg, Google Finance, Investing.com, Stock Analysis):
both are KOSDAQ. The derivation was right; the stored listing was wrong.

Corrected in place rather than closing with `valid_to`. These securities were
always KOSDAQ in valid time — only our knowledge was late — and `core.listing`
has no `known_at` column to express "learned later". Cutting the row would have
recorded a listing transfer that never happened and poisoned PIT queries.

Exactly two rows were affected; a full sweep found no others.

### 2. Missing SEC CIK (structural)

New US tickers enter `public.entities` the moment news or price ingestion sees
them. Their SEC CIK arrives only with the fundamentals backfill, which runs
**weekly** (`OnCalendar=Sun *-*-* 03:30`) while analytics runs **nightly**. A
ticker first seen on Monday blocked analytics until the following Sunday.

Worse, some tickers never resolve at all: `US:CPRX` is absent from SEC
`company_tickers.json`. The SEC backfill already records that as a non-fatal
`missing_cik` with a warning — but `classifyIdentityState` treated the same
situation as a hard conflict, so one permanently unresolvable ticker was enough
to kill the pipeline every night, forever.

## What changed

**`classifyIdentityState` gained a `'deferred'` state.** Nothing is wrong; the
reference data needed to mint the identity is not in hand. `run()` skips those
rows and records them with a reason in the audit summary.

Conflict checks now run **before** readiness checks, so half-built state under a
supposedly-new ticker still throws. Deferring must never mask a contradiction.

**Wrapper failures now name the failing command.** An `ERR` trap captures
`$BASH_COMMAND` and passes it to `pipeline_finish_wrapper_attempt`, which writes
it into `migration_runs.error` (single line, 300 chars). Applied to all four
wrappers: analytics, knowledge, market-enrichment, ohlcv.

Both are pinned by tests in `apps/api/test/core-identity-sync-runner.test.ts` and
`apps/api/test/operations-wrappers.test.ts`.

## Result

All nine stages completed on 2026-08-02 13:18 — first success in four days.
`US:CPRX` is now reported, not fatal:

```json
{"synced": 23, "missing": 23, "repaired": 0, "eligible": 326, "existing": 303,
 "deferred": [{"entityKey": "US:CPRX", "reason": "untrusted or missing company name"}]}
```

## Still open

- **Nothing alerts on a failed pipeline.** The four-day outage was found by
  accident while auditing roadmap status. Failure is now diagnosable but still
  not *noticed*; there is no notification path from `migration_runs` to a human.
- **The weekly/nightly cadence mismatch remains.** Deferral means new tickers no
  longer break analytics, but they still wait up to six days for an identity.
  Running fundamentals more often, or on new-ticker arrival, would close that.
- `US:CPRX` will stay deferred until it appears in SEC `company_tickers.json` or
  is given a profile another way. That is now a visible steady state rather than
  an outage.
