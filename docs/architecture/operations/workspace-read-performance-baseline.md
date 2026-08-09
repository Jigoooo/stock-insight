# Workspace read performance baseline

Measured statically on 2026-08-09 before the V2 aggregate read model.

## Active surface fan-out

| User surface  | Browser server function |        BFF→brain initial calls | Active slices                       |
| ------------- | ----------------------: | -----------------------------: | ----------------------------------- |
| 오늘          |                       1 | 2, or 3 with a selected record | shell + workspace + optional record |
| 내 종목       |                       1 |                              2 | shell + stocks                      |
| 시장 연결     |                       1 |                              3 | shell + radar + geo                 |
| 복기          |                       1 |                              2 | shell + history                     |
| 데이터 신뢰도 |                       1 |                              2 | shell + status                      |

The shell response has a 60 second per-user BFF cache. The table records cold-view fan-out; a warm cache can remove that one call.

## Detail fan-out

| Detail        | Browser→BFF calls | BFF→brain calls | Components                                     |
| ------------- | ----------------: | --------------: | ---------------------------------------------- |
| 종목          |                 3 |               3 | stock detail + relation depth 2 + impact brief |
| 시장 연결     |                 2 |               2 | relation depth 1 + impact brief                |
| 오늘 기록     |      2 sequential |    2 sequential | record + first affected entity relation        |
| 복기          |                 0 |               0 | current page item only                         |
| 데이터 신뢰도 |                 0 |               0 | current page model only                        |

## Known SQL risk

- `public.v_user_feed_dedup` previously made `/v1/workspace` take 6.8–7.7 seconds when the user filter was applied on a join. A user-filtered `MATERIALIZED` CTE reduced the measured query to about 119ms.
- The same view is still read by stock list and record detail paths, so those are the first execution-plan audit targets.
- Status currently executes six read statements in one snapshot. They remain separate unless measurement proves that consolidating repeated scans improves the endpoint without weakening maintainability.

## Rehearsal status

No disposable performance database URL was present in the execution environment. No database was contacted and no latency or buffer number is claimed from this checkout.

The implemented benchmark must use a safety-checked disposable URL, perform 5 warm-up iterations and 30 measured iterations, and report p50, p95, rows, shared buffers, plan shape, and index size without SQL parameters or user identity.
