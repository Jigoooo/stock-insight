export const numericFactDefinitionKeyFillMigrationSql = `
-- ─────────────────────────────────────────────────────────────────────────────
-- 122 · 리비전 가드: 기록되지 않았던 지표정의키를 채우는 것은 청구 변경이 아니다
--
-- ## 이 마이그레이션이 끝내는 장애
--
-- 2026-08-11 부터 \`run-dart-numeric-fact.ts\` 가 매 실행 실패했다. 그 잡이
-- \`market-enrichment-wrapper\` 를 죽였고, 그 래퍼가 analytics 파이프라인의
-- 입력 게이트를 막았고(36시간 이내 완료 요구), 그래서 발행 실행이 한 번도
-- 성공하지 못했고, 모든 publication projection 이 만료되어 \`stale\` 이 됐고,
-- \`ops.internal_web_publication_records\` 가 \`available\` 만 통과시키므로
-- **today 화면의 뉴스 패널이 전부 0행**이 됐다.
--
-- 사용자에게는 "오늘 아무 일도 없었다" 로 보였다. 실제로는 원장에 6,367건이
-- 그대로 있었다.
--
-- ## 무엇이 어긋났는가
--
-- 090 이 만든 이 가드는 리스테이트먼트 리비전이 청구 구조를 바꾸지 못하게 한다.
-- 그 구조에 \`metadata->>'metricDefinitionKey'\` 가 포함돼 있다.
--
-- 그런데 dart 사실 중 2026-08-08 에 쓰인 187,964행에는 그 키가 **없다**.
-- 08-09 이후 쓰인 157,675행에는 있다. 생산자는 고쳐졌지만 과거 행은 그대로였고,
-- 이 표는 append-only 라 UPDATE 로 채울 수 없다. 새 리비전으로 채우려 해도
-- 그 리비전이 바로 이 가드에 걸린다 — 순환이다.
--
-- 2026-08-11 에 그 187,964행 중 하나에 처음으로 정정 공시가 도착했다. 그때까지
-- dart 그룹 345,639개는 **전부 멤버가 하나**여서 이 가드가 한 번도 실행되지
-- 않았다. 리스테이트먼트가 처음 생긴 날이 장애가 시작된 날이다.
--
-- ## 왜 가드를 고치는 것이 옳은가
--
-- 가드가 막아야 하는 것은 리비전이 **다른 청구로 바뀌는 것**이다.
-- "정의를 기록하지 않았다" 에서 "정의를 기록했다" 로 가는 것은 다른 청구가
-- 되는 것이 아니라 **처음부터 참이었던 것을 비로소 적는 것**이다.
--
-- 그리고 이 채움은 지어낼 수 없다. 지표정의키는 이 가드가 이미 지키는 필드들의
-- 함수다 — 네임스페이스·개념·기간 종류·회계연도/분기·통화. 그 필드들이 전부
-- 같다면 정의키도 같을 수밖에 없으므로, NULL 자리에 들어오는 값은 계산 결과이지
-- 새로운 주장이 아니다.
--
-- 그래서 **NULL → 값**만 허용한다. **값 → 다른 값**은 그대로 거부한다. 그것은
-- 여전히 청구를 바꾸는 일이고, 이 가드의 존재 이유다.
--
-- ## 이 완화가 끝나는 조건
--
-- 키 없는 행이 0이 되면 이 예외는 죽은 조항이 된다. 지금은 187,964행이지만
-- 각 행은 정정이 도착할 때 한 번씩만 이 경로를 탄다. 남은 수를 세는 곳이
-- 없으므로 여기 적어둔다 — 다음 감사자가 "왜 아직 이게 있나" 를 물을 때
-- 답은 \`SELECT count(*) FROM world.numeric_fact
--        WHERE NOT (metadata ? 'metricDefinitionKey')\` 이다.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION world.guard_numeric_fact_revision_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
DECLARE
  previous world.numeric_fact%ROWTYPE;
  previous_definition_key TEXT;
  new_definition_key TEXT;
BEGIN
  IF NEW.revision_no > 1 THEN
    SELECT prior.*
      INTO previous
      FROM world.numeric_fact prior
     WHERE prior.numeric_fact_id = NEW.supersedes_numeric_fact_id
     FOR SHARE;

    IF NOT FOUND
       OR previous.revision_no IS DISTINCT FROM NEW.revision_no - 1
       OR previous.restatement_group_key IS DISTINCT FROM NEW.restatement_group_key THEN
      RAISE EXCEPTION 'numeric-fact supersession must reference exact N-1 revision of the same restatement group';
    END IF;

    previous_definition_key := previous.metadata ->> 'metricDefinitionKey';
    new_definition_key := NEW.metadata ->> 'metricDefinitionKey';

    IF ROW(
         previous.entity_id,
         previous.concept_namespace,
         previous.concept_key,
         previous.unit,
         previous.currency,
         previous.scale_power,
         previous.period_start,
         previous.period_end,
         previous.instant_at,
         previous.fiscal_year,
         previous.fiscal_quarter,
         previous.dimensions_json
       ) IS DISTINCT FROM ROW(
         NEW.entity_id,
         NEW.concept_namespace,
         NEW.concept_key,
         NEW.unit,
         NEW.currency,
         NEW.scale_power,
         NEW.period_start,
         NEW.period_end,
         NEW.instant_at,
         NEW.fiscal_year,
         NEW.fiscal_quarter,
         NEW.dimensions_json
       ) THEN
      RAISE EXCEPTION 'numeric-fact revision changes immutable claim structure: %',
        NEW.fact_key;
    END IF;

    -- 지표정의키만 따로 본다. 기록되지 않았던 자리를 채우는 것은 허용하고,
    -- 이미 기록된 값을 다른 값으로 바꾸는 것은 위와 같은 이유로 거부한다.
    -- 지우는 것도 거부한다 — 그것은 채움의 반대이고 근거를 잃는 일이다.
    IF previous_definition_key IS NOT NULL
       AND previous_definition_key IS DISTINCT FROM new_definition_key THEN
      RAISE EXCEPTION 'numeric-fact revision changes recorded metric definition (% -> %): %',
        previous_definition_key, coalesce(new_definition_key, '(null)'), NEW.fact_key;
    END IF;

    IF NEW.known_at < previous.known_at
       OR NEW.available_at < previous.available_at THEN
      RAISE EXCEPTION 'numeric-fact revision time cannot move backwards: %', NEW.fact_key;
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
`;
