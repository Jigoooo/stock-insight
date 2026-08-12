export const scenarioSetSubjectMigrationSql = `
-- ─────────────────────────────────────────────────────────────────────────────
-- 119 · analytics.scenario_set 에 주체를 준다 (CAV 블록 9 · 정본 05 §7)
--
-- 040 이 만든 scenario_set 은 엔티티 컬럼이 없다. 시나리오는 그것을 일으킨
-- impact_shock 에 매달리고, 주체는 shock → event revision → event 로 거슬러
-- 찾도록 설계됐다. 그 경로가 오늘 무엇을 돌려주는지 실측했다(2026-08-12):
--
--   analytics.impact_shock                                   48행
--   그중 world.event_revision 에 조인되는 것                  48행 (35개 리비전)
--   그 리비전이 world.event 에 조인되는 것                    35행
--   world.event 의 target_entity_id                          컬럼이 없다
--
-- 즉 shock 경로는 **주체에 닿을 수 없다.** 도달 0이 데이터가 얇아서가 아니라
-- 구조가 그렇다 — 'world.event' 는 event_key·event_type·subject_scope 만 갖고
-- 대상 엔티티를 들지 않는다. (serving 쪽 읽기 쿼리는 한술 더 떠
-- 'knowledge.event' 를 조인하는데, 그 테이블의 event_id 는 다른 id 공간이라
-- 35행 중 0행이 매치한다. 그 조인은 이 마이그레이션과 같은 변경에서 고친다.)
--
-- 그리고 정본 05 §7 의 thesis 는 애초에 shock 의 산물이 아니다. "한 종목의
-- 원인을 하나로 고정하지 않는다" 는 문장이 말하는 것은 **자산의 horizon 별
-- 경쟁 가설**이고, 충격이 있든 없든 성립한다. 040 이 shock 을 유일한 앵커로
-- 둔 것은 그때 shock 이 유일한 생산자였기 때문이지 정본이 그렇게 요구해서가
-- 아니다.
--
-- 그래서 주체 컬럼을 더하되 shock 경로를 지우지 않는다. 두 앵커 중 **하나는
-- 반드시** 있어야 한다는 것을 CHECK 로 못 박는다 — 둘 다 없는 시나리오는
-- 무엇에 대한 이야기인지 말하지 못한다.
--
-- 0행 테이블이라 컬럼 추가·CHECK 모두 재작성 없이 즉시 적용된다.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE analytics.scenario_set
  ADD COLUMN IF NOT EXISTS subject_entity_id BIGINT REFERENCES core.entity(entity_id);

-- REQ-ARCH-001. 040 은 정보집합·도출 커널보다 먼저 만들어져 두 컬럼이 없다.
-- 뒤에 붙는 생산자는 자기가 무엇을 읽고 무엇으로 계산했는지 남겨야 한다.
-- 기존 0행이므로 NOT NULL 로 시작할 수도 있지만, shock 앵커 경로가 되살아날 때
-- 그 생산자가 정보집합을 갖지 않을 수 있어 nullable 로 둔다 — 대신 주체 앵커
-- 생산자는 코드에서 항상 채우고, 그 사실을 계약 테스트가 지킨다.
ALTER TABLE analytics.scenario_set
  ADD COLUMN IF NOT EXISTS information_set_id TEXT
    REFERENCES governance.analysis_information_set(information_set_id);

ALTER TABLE analytics.scenario_set
  ADD COLUMN IF NOT EXISTS derivation_id BIGINT
    REFERENCES knowledge.derivation(derivation_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'analytics.scenario_set'::regclass
      AND conname = 'scenario_set_anchor_present'
  ) THEN
    ALTER TABLE analytics.scenario_set
      ADD CONSTRAINT scenario_set_anchor_present
      CHECK (impact_shock_id IS NOT NULL OR subject_entity_id IS NOT NULL);
  END IF;
END $$;

-- 읽기 경로는 주체로 조회한다(패킷 한 건당 한 종목). 부분 인덱스로 두는 이유는
-- shock 앵커 행이 채워지기 시작해도 그쪽은 이 인덱스를 쓰지 않기 때문이다.
CREATE INDEX IF NOT EXISTS ix_scenario_set_subject
  ON analytics.scenario_set (subject_entity_id)
  WHERE subject_entity_id IS NOT NULL;
`;
