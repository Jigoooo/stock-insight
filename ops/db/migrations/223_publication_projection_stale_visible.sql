-- ─────────────────────────────────────────────────────────────────────────────
-- 223 · 만료된 발행 프로젝션을 감추지 않는다
--
-- ## 이 마이그레이션이 끝내는 증상
--
-- today 화면의 뉴스 패널이 통째로 비었다. 사용자에게는 "오늘 아무 일도
-- 없었다" 로 보였고, 원장에는 6,367건이 그대로 있었다.
--
-- 222 가 만든 ops.internal_web_publication_records 는
-- projection_status='available' 만 통과시킨다. 그런데 그 상태는 시간이 지나면
-- 만료된다 — fresh_until 이 지나면 stale 이 되고, 발행 실행이 한 번이라도
-- 밀리면 전 데이터셋이 stale 로 떨어진다. 실측(2026-08-13): domain='stock' 의
-- 프로젝션 47개가 stale 25 · invalid 22 이고 available 은 0이다. 그 결과
-- 이 뷰는 0행을 돌려주고, 술어만 빼면 같은 조인에서 154행이 나온다.
--
-- ## 왜 감추는 것이 틀렸는가
--
-- 오래된 것과 없는 것은 다른 말이다(REQ-SRC-001). 읽기 모델은 이미 그 구분을
-- 할 줄 안다 — apps/api/src/workspace/read-model.ts 의 projectionFreshness() 가
-- available / stale / error 를 갈라 화면에 신선도 배너를 띄운다. 그런데 이 뷰가
-- 한 층 아래에서 stale 행을 통째로 지워, 화면은 "오래된 브리핑" 배너를 띄우면서
-- 내용은 하나도 못 보여주는 상태가 된다. 사용자가 읽는 것은 "늦었다" 가 아니라
-- "없다" 다.
--
-- ## invalid 는 계속 막는다
--
-- stale 은 늦었을 뿐 참이고, invalid 는 그 산출이 틀렸다는 판정이다. 틀린 것을
-- 늦은 것과 같이 취급하면 이 완화가 정직성이 아니라 방치가 된다. 그래서
-- 술어를 지우지 않고 <> 'invalid' 로 좁힌다 — 통과 대상이 늘어나는 방향이지만
-- 무엇이 통과하는지는 여전히 명시적이다.
--
-- 뷰 본문은 222 와 **글자 그대로 같고** 술어 한 줄만 다르다. 다시 적는 이유는
-- 222 가 이미 적용됐기 때문이다 — 적용된 마이그레이션은 편집하지 않는다.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ops.publication_record_revision.v1'));

CREATE OR REPLACE VIEW ops.internal_web_publication_records AS
SELECT
  status.analysis_run_id,
  status.analysis_revision,
  status.cutoff_at,
  status.source_watermark_at,
  status.fresh_until,
  pr.id,
  pr.record_key,
  pr.record_type,
  pr.domain,
  pr.market,
  pr.run_date,
  pr.run_type,
  pr.source_system,
  pr.source_table,
  pr.source_pk,
  pr.entity_id,
  pr.entity_key,
  pr.ticker,
  pr.name,
  pr.category,
  pr.title,
  pr.body_text,
  pr.summary_text,
  pr.numeric_value,
  pr.change_pct,
  pr.currency,
  pr.confidence,
  pr.horizon,
  pr.quality_flags,
  pr.raw_refs,
  pr.raw_json,
  pr.created_at,
  pr.published_at,
  binding.lifecycle_state
FROM ops.publication_projection_status status
JOIN ops.analysis_run_record binding
  ON binding.analysis_run_id=status.analysis_run_id
 AND binding.revision=status.analysis_revision
 AND binding.lifecycle_state='active'
JOIN ops.publication_record_revision revision
  ON revision.record_revision_id=binding.record_revision_id
 AND revision.record_id=binding.record_id
 AND revision.record_key=binding.record_key
 AND revision.payload_sha256=binding.payload_sha256
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.publication_records, revision.payload) pr
WHERE status.projection_status <> 'invalid'
  AND pr.domain=status.domain
  AND pr.run_date=status.run_date
  AND (pr.record_type<>'briefing' OR pr.run_type=status.run_type)
  AND revision.payload_sha256=binding.payload_sha256;

COMMIT;
