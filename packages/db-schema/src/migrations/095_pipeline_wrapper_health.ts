export const pipelineWrapperHealthMigrationSql = `
-- Wrapper fleet health, as one query.
--
-- Between 2026-08-08 and 08-10 the analytics wrapper failed six consecutive times
-- and market-enrichment five, and nothing said so. Every failure was recorded
-- correctly in public.migration_runs with the failing command attached; the gap
-- was that reading it required knowing to look and knowing how to phrase it.
-- Two days passed. This view is that phrasing, kept once.
--
-- WHY governance AND NOT ops. canonical/09 §5 owns silent-failure detection and
-- names ops.*, but the ops schema is shared table by table with the older
-- research app that predates this repository, and no db-schema migration has
-- ever created a view there. Migration 083 made exactly this call for the same
-- reason and put the SLO ledger in governance. Ownership wins over naming.
--
-- COVERAGE IS FOUR OF SIX, DELIBERATELY. Only the wrappers that call
-- pipeline_start_wrapper_attempt leave an audit row: analytics, knowledge,
-- market-enrichment and ohlcv. run_news_pipeline.sh and
-- run_company_fundamentals.sh have timers but no attempt row, so they are
-- invisible here. Naming the gap is better than a view that silently covers less
-- than its name suggests; closing it means editing two wrappers that work today.
--
-- GRANTS: pipeline roles and si_readapi only. Granting to stock_insight_app_reader
-- moves EXPECTED_CATALOG_DIGESTS and crashloops the brain unless re-pinned in the
-- same change — migration 059 did that on 2026-08-03.

CREATE OR REPLACE VIEW governance.pipeline_wrapper_health_v1 AS
WITH wrapper_run AS (
  -- 'running' rows are attempts in flight, and a killed run can leave one behind.
  -- Health is about settled outcomes, so they are excluded from both the recency
  -- ordering and the streak.
  SELECT job_name, status, started_at, finished_at,
         row_number() OVER (PARTITION BY job_name
                            ORDER BY started_at DESC, id DESC) AS recency
    FROM public.migration_runs
   WHERE job_name LIKE 'stock-insight-%-wrapper'
     AND status <> 'running'
),
latest AS (
  SELECT * FROM wrapper_run WHERE recency = 1
),
first_success AS (
  -- How far back the newest success sits. recency - 1 is therefore the number of
  -- settled failures in front of it.
  SELECT job_name, min(recency) AS recency
    FROM wrapper_run
   WHERE status = 'completed'
   GROUP BY job_name
),
last_success AS (
  SELECT job_name, max(finished_at) AS finished_at
    FROM wrapper_run
   WHERE status = 'completed'
   GROUP BY job_name
)
SELECT latest.job_name,
       latest.status AS latest_status,
       latest.started_at AS latest_started_at,
       latest.finished_at AS latest_finished_at,
       -- No success on record at all: every settled attempt has failed, so the
       -- streak is the attempt count rather than a missing value.
       COALESCE(first_success.recency - 1, latest.recency) AS consecutive_failures,
       last_success.finished_at AS last_success_at
  FROM latest
  LEFT JOIN first_success ON first_success.job_name = latest.job_name
  LEFT JOIN last_success ON last_success.job_name = latest.job_name;

COMMENT ON VIEW governance.pipeline_wrapper_health_v1 IS
  'Settled wrapper outcomes with the consecutive-failure streak and the newest success. Covers only wrappers that call pipeline_start_wrapper_attempt — analytics, knowledge, market-enrichment, ohlcv. news and fundamentals run on timers but leave no attempt row and are not represented here.';

REVOKE ALL ON governance.pipeline_wrapper_health_v1 FROM PUBLIC;
GRANT SELECT ON governance.pipeline_wrapper_health_v1
  TO si_readapi, si_knowledge, si_analytics, si_publisher;
`;
