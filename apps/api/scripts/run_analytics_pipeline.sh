#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock analytics
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
pipeline_start_wrapper_attempt stock-insight-analytics-wrapper "$RUN_STARTED_AT" || exit $?
WRAPPER_ATTEMPT_ID="$PIPELINE_WRAPPER_ATTEMPT_ID"
# Stages record a row only on success, so a mid-pipeline failure used to leave
# just `wrapper_failed`. The ERR trap captures the command that actually failed
# and hands it to the audit row, so migration_runs names the culprit.
PIPELINE_FAILED_COMMAND=""
trap 'PIPELINE_FAILED_COMMAND=$BASH_COMMAND' ERR
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed "$PIPELINE_FAILED_COMMAND" >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
pipeline_require_db_assertion analytics-input "
WITH latest_wrapper AS (
  SELECT DISTINCT ON (job_name) job_name, status, started_at, finished_at
  FROM public.migration_runs
  WHERE job_name IN (
    'stock-insight-ohlcv-wrapper',
    'stock-insight-knowledge-wrapper',
    'stock-insight-market-enrichment-wrapper'
  )
  ORDER BY job_name, started_at DESC, id DESC
)
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM latest_wrapper
    WHERE job_name='stock-insight-ohlcv-wrapper'
      AND status='completed'
      AND finished_at >= now() - interval '36 hours'
  )
  AND EXISTS (
    SELECT 1 FROM latest_wrapper
    WHERE job_name='stock-insight-knowledge-wrapper'
      AND status='completed'
      AND finished_at >= now() - interval '4 hours'
  )
  AND EXISTS (
    SELECT 1 FROM latest_wrapper
    WHERE job_name='stock-insight-market-enrichment-wrapper'
      AND status='completed'
      AND finished_at >= now() - interval '36 hours'
  )
THEN 1 ELSE 0 END
" || exit $?
cd "$ROOT"
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-core-identity-sync.ts --apply
pipeline_record_stage_success stock-insight-core-identity-sync-stage "$RUN_STARTED_AT" || exit $?
# Must follow the identity sync: it opens one economic claim per security in the
# master, and the master is what that step maintains. Writes an undetermined claim
# for anything it cannot evidence, which is nearly all of them — the point is that
# a consumer joining here gets NULL and has to decide, instead of getting nothing
# and assuming common equity (canonical/03 §2).
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-economic-claim.ts --apply
pipeline_record_stage_success stock-insight-economic-claim-stage "$RUN_STARTED_AT" || exit $?
# Must precede playbook assignment: a playbook is assigned by sector, and a stock the
# taxonomy has never classified cannot receive one. 178 of 297 stocks sat at explicit
# UNCLASSIFIED while 135 of them had a DART industry code already in this database,
# unmapped — and 59 more had no membership at all, which reads the same as classified
# to any check that looks for an UNCLASSIFIED row.
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-industry-classification.ts --apply
pipeline_record_stage_success stock-insight-industry-classification-stage "$RUN_STARTED_AT" || exit $?
# Must follow the identity sync for the same reason: it reads taxonomy membership,
# which that stage maintains. Gives every governed company a playbook revision to
# cite, which is the whole of REQ-DOM-001 — without one an analysis reinvents the
# sector's KPIs each run and nothing records that the list moved.
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-playbook-assignment.ts --apply
pipeline_record_stage_success stock-insight-playbook-assignment-stage "$RUN_STARTED_AT" || exit $?
# Must follow the classification for the obvious reason and must run EVERY time for a
# less obvious one: the predicate declares closed_world, so this job's output is what
# says a pair is still peers. Skipping it does not freeze the graph, it leaves a
# reclassified pair asserted — retraction only happens on a run.
DATABASE_URL="$DB_URL" node apps/api/src/relations/run-same-industry-relations.ts --apply
pipeline_record_stage_success stock-insight-same-industry-relations-stage "$RUN_STARTED_AT" || exit $?
# The cutoff is the audited database clock captured at wrapper start, normalized
# to the canonical ISO form required by the PIT runner. This keeps the live
# canary explicit and reproducible instead of letting the job consult now().
K4_CANARY_CUTOFF=$(
  node -e 'const value = new Date(process.argv[1]); if (Number.isNaN(value.valueOf())) process.exit(64); process.stdout.write(value.toISOString())' "$RUN_STARTED_AT"
)
# Must precede the K4 canary: the market-intelligence writer reads expectations and
# refuses to invent one, so without a producer analytics.surprise_revision is
# unreachable and REQ-EXP-001 can only hold in fixtures. The model is a random walk
# with drift over an evenly spaced annual run, and it emits nothing when the run has
# a gap or fewer than three priors.
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-k4-prior-model-expectation.ts --live --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-k4-prior-model-expectation-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-k4-market-intelligence.ts --canary --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-k4-market-intelligence-canary-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-feature-snapshot.ts --apply
pipeline_record_stage_success stock-insight-feature-snapshot-stage "$RUN_STARTED_AT" || exit $?
# 블록 7 — 밸류에이션 밴드. analytics.valuation_estimate_revision 은 099 가 만든 뒤
# 생산자가 없어 297종목 전부 not_produced 였다.
#
# 의존성은 위 K4 카나리가 아니라 **입력 두 가지**다: world.numeric_fact(주식수·자본·
# 이익)와 market_ts.ohlcv(일봉). 둘 다 이 파이프라인보다 앞선 래퍼가 채우고
# analytics-input 단언이 이미 신선도를 본다. K4 카나리가 쓰는 것을 이 잡은 쓰지 않고,
# K4 카나리도 이 잡의 출력을 읽지 않는다 — `run-k4-market-intelligence.ts` 는
# `K4SecurityInput.valuationRange` 를 저장소가 채워줄 때만 밸류에이션을 계획하는데
# 저장소는 그것을 채우지 않는다.
#
# 같은 컷오프를 쓰는 것은 편의가 아니라 요건이다. information_set_id 는 컷오프와
# 시맨틱 스냅샷의 다이제스트이므로, 다른 컷오프를 주면 이 잡이 같은 날의 두 번째
# governance.analysis_information_set 행을 만든다.
#
# common asset view 보다 **앞**에 있어야 한다. 그 잡이 이 테이블을 읽어 블록 7 을
# 세운다.
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-k4-valuation-band.ts --live --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-k4-valuation-band-stage "$RUN_STARTED_AT" || exit $?
# thesis 는 밴드의 **해석**이므로 밴드 뒤가 아니면 성립하지 않는다. 앞에 두면
# 같은 컷오프에서 어제 밴드를 읽어 오늘 논지를 쓰게 되고, 그 어긋남은 아무것도
# 실패시키지 않은 채 payload 안에서만 조용히 남는다.
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-scenario-thesis.ts --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-scenario-thesis-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-graph-inference.ts --events 500 --apply
pipeline_record_stage_success stock-insight-graph-inference-stage "$RUN_STARTED_AT" || exit $?
# v2 impact publishing runs before report publishing on purpose.
#
# On 2026-08-03 a single news headline failed run-report-publish's action-advice
# gate, and because report publishing sat earlier in the file, `set -e` took the
# whole pipeline down with it — including every impact path the product serves.
# One rejected report block stopped the graph.
#
# The two are independent, checked in both directions: report publishing reads
# content.report_definition, knowledge.claim, knowledge.event and
# latest_report_pointer; v2 publishing writes analytics.graph_* and
# impact_path_*. Neither reads what the other writes. v2 publishing also does not
# read analytics.calibration_profile or personalization.user_feed_item, so it is
# safe ahead of those steps too.
#
# run-feed-build is the one later step that genuinely depends on report output —
# it reads content.report — so it stays after report publishing.
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-v2-graph-publish.ts --apply
pipeline_record_stage_success stock-insight-v2-graph-publish-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-v2-analytics-publish.ts --apply
pipeline_record_stage_success stock-insight-v2-l5-publish-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/publish/run-report-publish.ts --apply
pipeline_record_stage_success stock-insight-report-publish-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/personalization/run-feed-build.ts --apply
pipeline_record_stage_success stock-insight-feed-build-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-probability-calibration.ts --apply
pipeline_record_stage_success stock-insight-probability-calibration-stage "$RUN_STARTED_AT" || exit $?
# 설명되지 않는 움직임 레이더(정본 01 §2 · 05 §9). feature snapshot 뒤여야 한다 —
# ret_1d 와 vol_20d 의 정의를 그쪽이 소유하고, 이 단계는 그것을 다시 계산하지
# 않는다. 두 번째 정의를 만들면 "그 종목이 오늘 얼마나 움직였나" 에 서로 다른
# 답을 주는 자리가 둘이 되고, 반드시 갈라진다.
#
# 이 단계는 인과를 쓰지 않는다. 각 행이 말하는 것은 어디를 뒤졌고 무엇이
# 나왔는가이고, 못 뒤진 채널은 이름으로 남는다(REQ-MKT-001 · REQ-SRC-001).
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-market-anomaly.ts --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-market-anomaly-stage "$RUN_STARTED_AT" || exit $?
# 인용 검증. CAV 앞에 서야 하는 이유는 하나다: 블록 10 이 읽는 것이 정확히 이
# 단계의 산출물이고, 순서를 뒤집으면 패킷은 어제의 검증 상태로 굳는다.
#
# 이 단계는 knowledge.assertion 에 리비전 2 를 쓰는 저장소 최초의 코드다. 그
# 표의 모든 키가 지금까지 리비전 1 뿐이었으므로 독자들이 리비전을 무시하고도
# 옳았고, 이 단계가 그 전제를 처음 깬다. CAV 저장소의 최신-리비전 필터는 같은
# 커밋에 있다.
DATABASE_URL="$DB_URL" node apps/api/src/knowledge/run-assertion-span-verification.ts --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-assertion-span-verification-stage "$RUN_STARTED_AT" || exit $?
# K6 common asset view. After the v2 publishes because it reads what they leave in
# serving.impact_summary_v2 and serving.market_confirmation_v1, and before nothing —
# no other stage reads it. It is shadow until K7 wires a surface onto it.
#
# It also opens and publishes the release manifest, which migration 081 created in
# August and nothing has written since; REQ-REL-001 cannot compare releases that do
# not exist. The release id is derived from the as-of date, so a same-day rerun
# collides on the primary key rather than minting a second release for one day.
DATABASE_URL="$DB_URL" node apps/api/src/serving/run-common-asset-view.ts --apply
pipeline_record_stage_success stock-insight-common-asset-view-stage "$RUN_STARTED_AT" || exit $?
# Needs prices and registered holdings, nothing else — independent of report and
# impact publishing. personalization.portfolio_snapshot had readers and no writer
# since it was created; registration itself was already visible because the stocks
# read model selects user_positions directly.
DATABASE_URL="$DB_URL" node apps/api/src/personalization/run-portfolio-snapshot.ts --apply
pipeline_record_stage_success stock-insight-portfolio-snapshot-stage "$RUN_STARTED_AT" || exit $?
# Which tables we own, fill, and nobody reads. Read-only; reports a gauge rather
# than failing, because "built and unconsumed" is a backlog to watch, not an error
# to page on. The number moving is the signal — the same reason the unattributed
# event count is reported every knowledge cycle.
DATABASE_URL="$DB_URL" node apps/api/src/ops/run-table-reachability-audit.ts --apply
pipeline_record_stage_success stock-insight-table-reachability-audit-stage "$RUN_STARTED_AT" || exit $?
# Whether every source still has an honest, approved contract. Unlike the audit
# above this one FAILS the run: an unread table is backlog, but an approved
# contract with no ADR-002 basis is a source minting accepted evidence it was
# never cleared to mint.
#
# These assertions already existed in source-contract-integrity.test.ts and were
# skipping silently — that test needs STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL
# and marks every case skip without it, which is how migration 069's violation sat
# behind a green suite for a day. The mutating cases still need a disposable DB and
# stay there; these are pure SELECT and belong on a timer against the real one.
DATABASE_URL="$DB_URL" node apps/api/src/ops/run-source-contract-audit.ts --apply
pipeline_record_stage_success stock-insight-source-contract-audit-stage "$RUN_STARTED_AT" || exit $?

# REQ-PIT-003: now() must not be a business cutoff. A source audit rather than a
# database one — the defect lives in SQL text, so it reads no database and could
# run in CI. It runs here because the same reasoning applies as to the source
# contract audit above: an assertion that only lives in a test suite is one
# skipped environment away from being silently green, and this one guards the
# property every backtest rests on. Two known exceptions are recorded in the job
# itself with the phase that closes them; a new violation fails the pipeline.
node apps/api/src/ops/run-pit-now-audit.ts
pipeline_record_stage_success stock-insight-pit-now-audit-stage "$RUN_STARTED_AT" || exit $?

DATABASE_URL="$DB_URL" node apps/api/src/ops/run-outbox-delivery.ts --apply --loop
pipeline_record_stage_success stock-insight-outbox-delivery-stage "$RUN_STARTED_AT" || exit $?

pipeline_require_db_assertion analytics "
SELECT CASE WHEN
  (SELECT count(DISTINCT job_name)
   FROM public.migration_runs
   WHERE job_name IN (
     'stock-insight-core-identity-sync-stage',
     'stock-insight-feature-snapshot-stage',
     'stock-insight-graph-inference-stage',
     'stock-insight-report-publish-stage',
     'stock-insight-feed-build-stage',
     'stock-insight-probability-calibration-stage',
     'stock-insight-v2-graph-publish-stage',
     'stock-insight-k4-prior-model-expectation-stage',
     'stock-insight-k4-market-intelligence-canary-stage',
     -- 목록에 없는 단계는 실행 여부가 단언되지 않는다. 블록 7 의 생산자가 조용히
     -- 빠지면 블록은 다시 297종목 not_produced 로 돌아가고, 그 회귀는 아무것도
     -- 실패시키지 않는다.
     'stock-insight-k4-valuation-band-stage',
     -- 같은 이유로 thesis 도 목록에 든다. 블록 9 는 297종목이 전부
     -- no_eligible_source 이던 자리라, 조용히 빠지면 '원래 비어 있던 블록' 으로
     -- 읽히고 아무도 회귀를 눈치채지 못한다.
     'stock-insight-scenario-thesis-stage',
     'stock-insight-v2-l5-publish-stage',
     'stock-insight-portfolio-snapshot-stage',
     -- Listed, unlike the reachability gauge above it, because the whole point of
     -- this stage is that its predecessor was a detector nobody noticed was off.
     -- Asserting it RAN is the part that was missing.
     'stock-insight-source-contract-audit-stage',
     -- 블록 10 을 어둡게 두던 것은 생산자 부재였다. 이 단계가 그 자리다.
     'stock-insight-assertion-span-verification-stage',
     -- 정본 01 §2 가 Market Home 필수 섹션으로 요구하는데 생산자가 없었다.
     'stock-insight-market-anomaly-stage',
     'stock-insight-outbox-delivery-stage'
   )
     AND status='completed'
     AND finished_at >= '${RUN_STARTED_AT}'::timestamptz) = 17
  -- 착지 게이지. 목표치가 아니라 >= 1 인 이유: 아무도 재보지 않은 임계값은 결국
  -- 낮춰진다. 이 숫자가 재는 것은 밴드가 몇 개냐가 아니라 생산자가 살아 있느냐
  -- 다. 실측 커버리지(2026-08-12: 종목 52개 · 밴드 81개)는 요약 JSON 이 말한다.
  --
  -- 2026-08-12 정정 — 실행 범위가 없던 줄이다. 이 테이블은 append-only 이므로
  -- 81 행이 있는 지금 전역 count 는 **영원히 참**이고, 생산자가 내일 죽어도 초록이다.
  -- 이웃 단언들과 같은 모양(finished_at >= RUN_STARTED_AT)으로 묶는다.
  --
  -- 0 이 나오는 정상 실행은 없다: K4_CANARY_CUTOFF 는 매 실행 pipeline_db_now 의
  -- 마이크로초 시각이고 밸류에이션 키에 information_set_id 가 들어가므로, 실행마다
  -- 키가 새로 생기고 첫 리비전이 새로 쓰인다.
  --
  -- 이 SQL 은 통째로 쉘의 큰따옴표 문자열 하나다. 주석 안이라도 큰따옴표나
  -- 역따옴표를 쓰면 안 된다 — 큰따옴표는 인자를 그 자리에서 끊고 역따옴표는 명령
  -- 치환이 되며, 둘 다 단언 전체를 문법 오류로 죽인다. 2026-08-12 에 두 번 죽였다.
  AND (SELECT count(*) FROM analytics.valuation_estimate_revision
       WHERE created_at >= '${RUN_STARTED_AT}'::timestamptz) >= 1
  AND (SELECT count(*) FROM serving.latest_feature_snapshot_v1) >= 250
  AND (SELECT count(*) FROM serving.market_confirmation_v1) >= 250
  -- 블록 9 착지 게이지. 봉인된 분기가 0이면 thesis 단계가 돌고도 아무것도 내지
  -- 않은 것이고, 화면은 297종목 no_eligible_source 로 되돌아간다.
  AND (SELECT count(*) FROM analytics.scenario_branch WHERE branch_state = 'sealed') >= 1
  -- 레이더 착지 게이지. 이상치가 0인 날은 정상이므로 행 수를 세지 않는다 —
  -- 조용한 시장에 빨개지는 게이지는 결국 꺼진다. 대신 **훑을 대상이 있었는가**를
  -- 잰다: feature snapshot 이 살아 있으면 레이더는 매일 253종목을 뒤지고,
  -- 그 입력이 죽으면 레이더는 조용한 것이 아니라 눈이 먼 것이다.
  --
  -- 마이그레이션 120 의 sample_count 가 여기서 처음 쓰인다. 표본이 얇은 날은
  -- market_factor 채널이 못 뒤진 채널로 기록되므로, 그 날의 UNEXPLAINED 는
  -- 시장이 설명하지 못한 것이 아니라 시장을 볼 수 없었던 것이다.
  AND (SELECT count(*) FROM serving.daily_change_v1 WHERE sample_count >= 30) >= 1
  -- 블록 10 착지 게이지. **이웃들과 모양이 다른 이유가 있다 — 맞추지 말 것.**
  --
  -- 이웃 게이지들은 이번 실행이 무엇을 썼느냐를 센다(>= 1). 그 모양이 저기서
  -- 통하는 이유는 실행마다 새 키가 생겨 반드시 새 행이 쓰이기 때문이다.
  -- 인용 검증은 반대다: **입력을 소진한다.** 첫 실행이 밀린 것을 전부 올리고
  -- 나면 다음 날 올릴 것은 새로 들어온 주장뿐이고, 뉴스가 없던 날은 0 이다.
  -- 여기에 >= 1 을 쓰면 건강한 날에 빨개지고, 그때 사람이 손대는 것은 임계값이다.
  --
  -- 그래서 재는 것을 뒤집는다: **올릴 수 있는데 안 올라간 것이 있는가.** 0 이면
  -- 생산자가 제 일을 다 한 것이고, 0 이 아니면 일감이 남았는데 멈춘 것이다.
  -- 단계가 돌았다는 사실은 위의 job_name 목록이 이미 단언한다 — 여기는 그 단계가
  -- 돌아서 무엇을 했는지를 단언한다.
  --
  -- 원문에 없는 문구를 인용한 주장(실측 2건)은 영원히 extracted 로 남는데, 그것은
  -- 이 조건에 걸리지 않는다 — 매치되지 않으므로 애초에 올릴 수 있는 것이 아니다.
  --
  -- modality 로 거르지 않는다. 처음에는 forecast/alleged 만 봤는데, 그것은 블록 10
  -- 의 관심사이지 검증의 성질이 아니다. 좁혀 두면 factual 205건이 올릴 수 있는
  -- 상태로 남아 있는데도 이 게이지가 0 을 보고한다 — 밀린 것이 있는데 없다고
  -- 말하는 게이지는 없느니만 못하다.
  AND (SELECT count(*) FROM (
         SELECT DISTINCT ON (assertion_key) verification_state,
                literal_value->>'text' AS quoted,
                (source_span_locator->>'documentChunkId')::bigint AS chunk_id
           FROM knowledge.assertion
          ORDER BY assertion_key, revision_no DESC) latest
        JOIN knowledge.document_chunk chunk ON chunk.chunk_id = latest.chunk_id
       WHERE latest.verification_state = 'extracted'
         AND latest.quoted IS NOT NULL
         AND btrim(latest.quoted) <> ''
         -- **LIKE 가 아니라 strpos 다.** 인용문에 %나 _가 들어 있으면 LIKE 는
         -- 그것을 와일드카드로 읽는다. 실측 claim:17 의 인용문은 '1% 상승률' 이고,
         -- LIKE 는 이것을 '1' + 아무거나 + ' 상승률' 로 느슨하게 맞춰 원문에 없는
         -- 문구를 있다고 판정했다. 생산자는 자바스크립트 indexOf 로 문자 그대로
         -- 보므로 올리지 않았고, 그래서 게이지만 혼자 밀린 일감 1건을 봤다.
         -- strpos 는 문자 그대로 찾아 생산자와 같은 답을 낸다.
         AND strpos(lower(chunk.content), lower(latest.quoted)) > 0) = 0
  -- 2026-08-12 정정 — 여기 있던 feed_date=current_date 는 **시간대 두 개를 섞고
  -- 있었다.** feed_date 는 run-feed-build 가 사용자 프로필 시간대로 찍는 날짜이고
  -- (now() AT TIME ZONE profile.timezone)::date, current_date 는 세션 시간대(UTC)의
  -- 날짜다. 실측(2026-08-11 18:31 UTC): 방금 쓴 20 행의 feed_date 는 2026-08-12(KST)
  -- 인데 current_date 는 2026-08-11 이라 게이지가 0 을 본다.
  --
  -- 즉 이 단언은 KST 자정 이후(15:00~24:00 UTC)에 도는 실행에서는 산출이 멀쩡해도
  -- 반드시 실패한다. 날짜 대신 실행 범위로 묶는다 — 재는 것은 어느 날짜냐가 아니라
  -- 이번 실행이 피드를 만들었느냐이고, 그 질문에는 시간대가 없다.
  AND (SELECT count(*) FROM personalization.user_feed_item
       WHERE generated_at >= '${RUN_STARTED_AT}'::timestamptz) >= 1
  AND EXISTS (SELECT 1 FROM serving.probability_scorecard_v1)
  AND EXISTS (
    SELECT 1 FROM ops.pipeline_run_claim claim
    -- Prefix match: a re-run publishes under 'v2-graph-publish:<date>#<suffix>'
    -- (see SLOT_SUFFIX in run-v2-graph-publish.ts). Exact equality here would make
    -- a supported re-run fail its own readback.
    WHERE claim.natural_run_key LIKE 'v2-graph-publish:' ||
          to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') || '%'
      AND claim.claim_status='completed'
      AND claim.completed_at IS NOT NULL
  )
  AND EXISTS (SELECT 1 FROM analytics.graph_snapshot WHERE status='sealed')
  AND EXISTS (SELECT 1 FROM analytics.impact_path_v2 WHERE status='sealed')
  AND EXISTS (SELECT 1 FROM analytics.graph_community)
  AND EXISTS (SELECT 1 FROM analytics.relation_measurement)
  AND (SELECT count(*) FROM ops.outbox_delivery
       WHERE destination='consumer_inbox:selective-recompute'
         AND status IN ('pending','leased')) = 0
  AND (SELECT count(*) FROM ops.outbox_delivery WHERE status = 'dead') = 0
  AND (SELECT count(*) FROM ops.dead_letter WHERE dead_at >= '${RUN_STARTED_AT}'::timestamptz) = 0
  AND EXISTS (
    SELECT 1 FROM serving.v_relation_graph_freshness
    WHERE servable=true
  )
THEN 1 ELSE 0 END
" || exit $?

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed || exit $?
trap - EXIT
