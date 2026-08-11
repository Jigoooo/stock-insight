export const k4FiscalYearComparisonWindowMigrationSql = `
-- K4 수용 가드의 "1년 간격" 을 회계연도 폭(350-380일)으로 넓힌다.
--
-- 무엇이 실제로 어긋나 있었나. 마이그레이션 089 의
-- analytics.validate_k4_evaluation_basis 는 전년 대비 비교의 짝을
--   current.instant_at = comparison.instant_at + interval '1 year'
-- 로, 기간형은 period_start·period_end 양쪽에 같은 등식으로 요구한다. 달력상
-- 같은 날짜여야 한다는 뜻이다. 반면 2026-08-10 에 계획기
-- (apps/api/src/analytics/k4-market-intelligence-plan.ts) 는 같은 규칙을
-- 350-380일 창으로 넓혔다. 실측 근거가 파일 주석에 남아 있다: 달력 일치를
-- 요구하면 AMD·Broadcom·Intel·Micron·Marvell·NVIDIA 에서 짝이 0개가 되고
-- 달력연도로 마감하는 ARM 만 통과한다. 52/53주 회계연도를 쓰는 발행사는
-- 기간 끝이 해마다 하루 이틀씩 밀리기 때문이다 (MICRON InventoryNet
-- 2026-05-28 vs 2025-05-29).
--
-- 계획기만 넓히고 가드는 그대로 두었으므로, 계획기가 정당하다고 판단한 짝을
-- 가드가 거부한다. 2026-08-11 기준 실데이터에서 수용 평가 48건 중 20건이
-- 창에만 걸린다(간격 364일 또는 371일). 나이틀리 파이프라인은 이 20건의
-- 첫 삽입에서 'duration YoY requires one-year-separated matching periods' 로
-- 죽는다.
--
-- 왜 가드를 넓히고 계획기를 되돌리지 않는가. Micron 의 FY26 3분기와 FY25
-- 3분기를 견주는 것은 회계적으로 옳은 전년 대비 비교다. 달력 일치 요구는
-- 보수적인 규칙이 아니라 52/53주 발행사에 대해 틀린 규칙이고, 저장소는 이미
-- 같은 교훈을 두 번 치렀다(k4-prior-model-expectation.ts 가 같은 이유로 같은
-- 창을 들고 있다). 계획기를 되돌리면 반도체 대형주의 전년 대비 근거가 통째로
-- 사라진다.
--
-- 무엇을 넓히지 않았나. 창은 계획기와 글자 그대로 같은 350-380일이고, 그
-- 이상은 아니다. 18개월 전 기간은 여전히 거부된다 — 전년 대비라는 이름을 쓴
-- 다른 비교이기 때문이다. 기간형은 period_start 와 period_end 양쪽이 모두
-- 창에 들어야 한다: 1년 전에 시작해 15개월 전에 끝난 기간과의 차분은 변화가
-- 아니라 기간 길이를 재는 것이다. 이 두 분기 외 가드의 모든 조건 — 거버넌스
-- 해석, PIT 등급, 단위·통화 일치, 파생 입력 정합, AIS 컷오프, 측정값이
-- 정확히 current - comparison 인지 — 은 089 원문 그대로다.
--
-- 089 의 함수를 CREATE OR REPLACE 로 대체할 뿐 어떤 테이블·제약도 건드리지
-- 않는다. 되돌리려면 089 의 본문을 다시 실행하면 된다.

CREATE OR REPLACE FUNCTION analytics.validate_k4_evaluation_basis(
  p_evaluation_id BIGINT,
  p_exposure_id BIGINT,
  p_exposure_unit TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $basis_guard$
DECLARE
  evaluation analytics.impact_evaluation_revision%ROWTYPE;
  information_set governance.analysis_information_set%ROWTYPE;
  rule governance.business_driver_measurement_rule%ROWTYPE;
  current_fact world.numeric_fact%ROWTYPE;
  comparison_fact world.numeric_fact%ROWTYPE;
  v_evidence_count INTEGER;
  v_current_count INTEGER;
  v_comparison_count INTEGER;
BEGIN
  SELECT candidate.* INTO evaluation
    FROM analytics.impact_evaluation_revision candidate
    JOIN analytics.impact_exposure_revision exposure
      ON exposure.impact_exposure_revision_id = p_exposure_id
     AND exposure.entity_id = candidate.security_entity_id
   WHERE candidate.impact_evaluation_revision_id = p_evaluation_id
     AND candidate.impact_exposure_revision_id = p_exposure_id
     AND candidate.evaluation_disposition = 'accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accepted evaluation does not resolve to the exposure security';
  END IF;

  SELECT * INTO information_set
    FROM governance.analysis_information_set
   WHERE information_set_id = evaluation.information_set_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accepted evaluation has no analysis information set';
  END IF;
  SELECT * INTO rule
    FROM governance.business_driver_measurement_rule
   WHERE business_driver_measurement_rule_id =
         evaluation.business_driver_measurement_rule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accepted evaluation has no executable measurement rule';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM governance.sector_playbook playbook
      JOIN governance.playbook_assignment assignment
        ON assignment.sector_playbook_id = evaluation.sector_playbook_id
       AND assignment.entity_id = evaluation.issuer_entity_id
       AND assignment.valid_from <= information_set.valid_cutoff
       AND (assignment.valid_to IS NULL
            OR assignment.valid_to > information_set.valid_cutoff)
       AND assignment.known_at <= information_set.system_known_cutoff
       AND (assignment.security_issuer_identity_id IS NULL
            OR assignment.security_issuer_identity_id =
               evaluation.security_issuer_identity_id)
      JOIN governance.business_driver driver
        ON driver.sector_playbook_id = playbook.sector_playbook_id
       AND driver.business_driver_id = evaluation.business_driver_id
      JOIN governance.business_driver_measurement_rule measurement_rule
        ON measurement_rule.business_driver_id = driver.business_driver_id
       AND measurement_rule.business_driver_measurement_rule_id =
           evaluation.business_driver_measurement_rule_id
      JOIN core.security_issuer_identity identity
        ON identity.security_issuer_identity_id = evaluation.security_issuer_identity_id
       AND identity.security_entity_id = evaluation.security_entity_id
       AND identity.issuer_entity_id = evaluation.issuer_entity_id
      JOIN knowledge.derivation derivation
        ON derivation.derivation_id = evaluation.derivation_id
       AND derivation.status = 'sealed'
     WHERE playbook.sector_playbook_id = evaluation.sector_playbook_id
       AND playbook.playbook_state = 'active'
       AND playbook.effective_from <= information_set.valid_cutoff
       AND (playbook.effective_to IS NULL
            OR playbook.effective_to > information_set.valid_cutoff)
       AND playbook.known_at <= information_set.system_known_cutoff
       AND measurement_rule.effective_from <= information_set.valid_cutoff
       AND (measurement_rule.effective_to IS NULL
            OR measurement_rule.effective_to > information_set.valid_cutoff)
       AND measurement_rule.known_at <= information_set.system_known_cutoff
       AND identity.valid_from <= information_set.valid_cutoff
       AND identity.known_from <= information_set.system_known_cutoff
  ) THEN
    RAISE EXCEPTION 'accepted evaluation does not resolve through canonical governance at AIS cutoffs';
  END IF;

  SELECT count(DISTINCT evidence.numeric_fact_id),
         count(*) FILTER (WHERE evidence.input_role = 'current'),
         count(*) FILTER (WHERE evidence.input_role = 'comparison')
    INTO v_evidence_count, v_current_count, v_comparison_count
    FROM analytics.impact_evaluation_evidence evidence
   WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id;
  IF v_evidence_count < rule.minimum_history_observations
     OR v_current_count <> 1
     OR v_comparison_count <> 1 THEN
    RAISE EXCEPTION 'accepted evaluation requires minimum history and one current/comparison pair';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM analytics.impact_evaluation_evidence evidence
      JOIN world.numeric_fact fact ON fact.numeric_fact_id = evidence.numeric_fact_id
      JOIN governance.source_pit_quality quality
        ON quality.source_pit_quality_id = evidence.source_pit_quality_id
      JOIN ingestion.source_revision revision
        ON revision.source_revision_id = evidence.source_revision_id
      JOIN ingestion.source_record_identity source_identity
        ON source_identity.source_record_identity_id = revision.source_record_identity_id
     WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id
       AND (
         fact.entity_id IS DISTINCT FROM evaluation.issuer_entity_id
         OR NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(rule.input_concept_selectors) selector
            WHERE selector ->> 'concept_namespace' = fact.concept_namespace
              AND selector -> 'concept_keys' ? fact.concept_key
         )
         OR NOT EXISTS (
           SELECT 1
             FROM knowledge.derivation_step step
             JOIN knowledge.derivation_input input
               ON input.derivation_step_id = step.derivation_step_id
              AND input.input_kind = 'numeric_fact'
              AND input.numeric_fact_id = fact.numeric_fact_id
            WHERE step.derivation_id = evaluation.derivation_id
         )
         OR fact.source_revision_id IS DISTINCT FROM evidence.source_revision_id
         OR quality.source_id IS DISTINCT FROM source_identity.source_id
         OR quality.pit_quality_class NOT IN (
           'PIT_A_NATIVE_VINTAGE','PIT_B_VERSIONED_ARTIFACT','PIT_C_OUR_ARCHIVE'
         )
         OR NOT (quality.pit_quality_class = ANY(rule.allowed_pit_classes))
         OR quality.known_at > information_set.system_known_cutoff
         OR fact.unit IS DISTINCT FROM evaluation.measurement_unit
         OR fact.currency IS DISTINCT FROM evaluation.measurement_currency
         OR fact.available_at > information_set.source_available_cutoff
         OR fact.known_at > information_set.system_known_cutoff
       )
  ) THEN
    RAISE EXCEPTION 'accepted evidence fails issuer, selector, derivation, PIT, unit, or AIS policy';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM knowledge.derivation_step step
      JOIN knowledge.derivation_input input
        ON input.derivation_step_id = step.derivation_step_id
       AND input.input_kind = 'numeric_fact'
     WHERE step.derivation_id = evaluation.derivation_id
       AND NOT EXISTS (
         SELECT 1
           FROM analytics.impact_evaluation_evidence evidence
          WHERE evidence.impact_evaluation_revision_id =
                evaluation.impact_evaluation_revision_id
            AND evidence.numeric_fact_id = input.numeric_fact_id
       )
  ) THEN
    RAISE EXCEPTION 'accepted evidence must exactly cover derivation numeric-fact inputs';
  END IF;

  SELECT fact.* INTO current_fact
    FROM analytics.impact_evaluation_evidence evidence
    JOIN world.numeric_fact fact ON fact.numeric_fact_id = evidence.numeric_fact_id
   WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id
     AND evidence.input_role = 'current';
  SELECT fact.* INTO comparison_fact
    FROM analytics.impact_evaluation_evidence evidence
    JOIN world.numeric_fact fact ON fact.numeric_fact_id = evidence.numeric_fact_id
   WHERE evidence.impact_evaluation_revision_id = evaluation.impact_evaluation_revision_id
     AND evidence.input_role = 'comparison';

  IF current_fact.concept_namespace IS DISTINCT FROM comparison_fact.concept_namespace
     OR current_fact.concept_key IS DISTINCT FROM comparison_fact.concept_key THEN
    RAISE EXCEPTION 'current and comparison evidence must measure the same concept';
  END IF;
  IF rule.comparison_method = 'period_end_year_over_year_delta' THEN
    IF current_fact.instant_at IS NULL
       OR comparison_fact.instant_at IS NULL
       OR round(
            extract(epoch FROM (current_fact.instant_at - comparison_fact.instant_at)) / 86400
          ) NOT BETWEEN 350 AND 380 THEN
      RAISE EXCEPTION 'period-end YoY requires instant facts 350-380 days apart';
    END IF;
  ELSIF rule.comparison_method = 'duration_year_over_year_delta' THEN
    IF current_fact.period_start IS NULL OR current_fact.period_end IS NULL
       OR comparison_fact.period_start IS NULL OR comparison_fact.period_end IS NULL
       OR (current_fact.period_start - comparison_fact.period_start) NOT BETWEEN 350 AND 380
       OR (current_fact.period_end - comparison_fact.period_end) NOT BETWEEN 350 AND 380 THEN
      RAISE EXCEPTION 'duration YoY requires both period ends 350-380 days apart';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported executable comparison method %', rule.comparison_method;
  END IF;

  IF evaluation.measurement_value IS DISTINCT FROM current_fact.value - comparison_fact.value THEN
    RAISE EXCEPTION 'evaluation measurement does not equal the executable comparison result';
  END IF;
  IF rule.output_unit IS DISTINCT FROM evaluation.measurement_unit
     OR rule.output_currency IS DISTINCT FROM evaluation.measurement_currency
     OR p_exposure_unit IS DISTINCT FROM
        coalesce(evaluation.measurement_currency, evaluation.measurement_unit) THEN
    RAISE EXCEPTION 'exposure, evaluation, and rule unit/currency must match';
  END IF;
END
$basis_guard$;
`;
