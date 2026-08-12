export const marketAnomalyLedgerMigrationSql = `
-- ─────────────────────────────────────────────────────────────────────────────
-- 121 · analytics.market_anomaly_revision — 설명되지 않는 움직임 레이더
--
-- 정본 01 §2 가 Market Home 필수 섹션으로 요구하고, 정본 05 §9 가 절차를 정한다:
--
--     price/volume anomaly
--       → known event search
--       → entity/theme/factor exposure search
--       → competing hypotheses
--       → EXPLAINED / PARTIAL / UNEXPLAINED
--
-- 그리고 같은 절이 REQ-MKT-001 로 못을 박는다: **원인을 찾지 못한 움직임에 억지
-- 인과를 지어내지 않는다.**
--
-- ## 이 표가 인과를 저장하지 않는 이유
--
-- 이 원장의 각 행이 말하는 것은 "무엇이 이 움직임을 일으켰는가" 가 아니라
-- **"우리가 어디를 뒤졌고 거기서 무엇이 나왔는가"** 다. 그래서 컬럼이 원인이
-- 아니라 채널별 발견 수다. 인과문을 쓸 자리가 스키마에 없다.
--
-- 이 구분이 실무에서 어떻게 갈리는지 실측으로 남긴다. 처음 설계에서는 두 번째
-- 채널을 serving.impact_summary_v2 의 노출 경로 수로 잡으려 했다. 2026-08-11
-- 기준 XOM 은 70개, XLE 는 56개를 갖는다. 그 수로 EXPLAINED 를 매기면 화면은
-- "70개 경로가 이 4.3% 상승을 설명합니다" 라고 말하게 되는데, **그 경로들은
-- 오늘과 아무 상관이 없다.** 노출 경로는 "관련 충격이 오면 이렇게 반응한다"
-- 이지 "오늘 이렇게 움직인 이유" 가 아니다. 정적인 수를 시점 설명으로 쓰는 것이
-- REQ-MKT-001 이 이름으로 막는 형태다.
--
-- 그래서 채널은 전부 **시점에 묶인 것**만 쓴다.
--
-- ## 채널 셋을 뒤지고, 못 뒤진 것은 이름으로 남긴다
--
-- | 채널 | 무엇을 보는가 | 원천 |
-- | --- | --- | --- |
-- | known_event | 이 종목에 7일 내 알려진 사건 | knowledge.event |
-- | peer_comove | accepted 동종 이웃이 같은 날 같은 방향 | SAME_INDUSTRY |
-- | market_factor | 그날 시장 전체가 같은 방향으로 크게 | serving.daily_change_v1 |
--
-- 정본 §9 는 theme exposure 도 요구한다. **뒤지지 않는다** — analytics.theme 은
-- 2026-07-18 일회성 덤프이고 theme_membership 의 tier 가 전부 adjacent 다.
-- 분류기가 없으므로 거기서 나오는 답은 아무 뜻이 없고, 뜻 없는 답을 채널 하나로
-- 세면 UNEXPLAINED 가 EXPLAINED 로 바뀐다. unsearched_channels 에 이름을 적는다.
--
-- 이것이 이 표에서 가장 중요한 컬럼이다. 그것이 없으면 UNEXPLAINED 가 "아무것도
-- 이것을 설명하지 못한다" 로 읽히는데, 실제로는 **"넷 중 셋만 뒤졌다"** 다.
-- REQ-SRC-001 이 "없다" 와 "묻지 않았다" 를 구분하라고 하는 것이 정확히 이것이고,
-- 우리 자신의 산출물에도 같은 규칙을 적용한다.
--
-- ## market_factor 가 sample_count 를 요구하는 이유
--
-- 마이그레이션 120 이 serving.daily_change_v1 에 sample_count 를 낸 이유가
-- 여기서 처음 쓰인다. 한 종목만 관측된 날의 평균은 시장이 아니다. 표본이 얇은
-- 날에는 이 채널을 "확인함/못 찾음" 이 아니라 **못 뒤진 채널**로 기록한다.
-- 얇은 표본을 시장으로 취급하면, 데이터가 적은 날일수록 설명이 잘 되는
-- 이상한 결과가 나온다.
--
-- ## 임계값
--
-- 이상치는 |ret_1d| 가 그 종목 자신의 일간 변동성(vol_20d / sqrt(252))의 2배
-- 이상인 경우다. 시장 전체 고정 퍼센트를 쓰지 않는 이유는 변동성이 종목마다
-- 다르기 때문이다 — 저변동 종목의 3% 와 고변동 종목의 3% 는 다른 사건이다.
--
-- 실측(2026-08-11, 253종목): 중앙값 0.56σ · p90 1.34σ · 최대 2.94σ · 2σ 이상 4개.
-- 정규분포라면 4.6% 가 걸릴 자리에 1.6% 가 걸렸다. **이 숫자는 목표가 아니다** —
-- 다음에 이 임계값을 옮길 사람이 무엇과 비교해야 하는지 알도록 적어둔다.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics.market_anomaly_revision (
    market_anomaly_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    anomaly_key         TEXT NOT NULL CHECK (length(btrim(anomaly_key)) > 0),
    revision_no         INTEGER NOT NULL CHECK (revision_no > 0),
    subject_entity_id   BIGINT NOT NULL REFERENCES core.entity(entity_id),
    observation_date    DATE NOT NULL,
    as_of_at            TIMESTAMPTZ NOT NULL,
    -- 움직임 자체. 부호를 지우지 않는다 — 방향은 그 자체로 정보이고,
    -- 절댓값만 남기면 이웃과 같은 방향인지 판정할 수 없다.
    move_return         NUMERIC NOT NULL,
    move_sigma          NUMERIC NOT NULL CHECK (move_sigma >= 0),
    volume_z            NUMERIC,
    -- 채널별 발견 수. 인과의 세기가 아니라 **찾은 개수**다.
    known_event_count   INTEGER NOT NULL CHECK (known_event_count >= 0),
    peer_comove_count   INTEGER NOT NULL CHECK (peer_comove_count >= 0),
    peer_priced_count   INTEGER NOT NULL CHECK (peer_priced_count >= 0),
    market_move_pct     NUMERIC,
    market_sample_count INTEGER CHECK (market_sample_count IS NULL OR market_sample_count >= 0),
    -- 뒤진 채널 중 무언가를 돌려준 것의 수. 아래 상태는 이것만으로 정해진다.
    matched_channel_count INTEGER NOT NULL CHECK (matched_channel_count >= 0),
    searched_channels   TEXT[] NOT NULL CHECK (array_length(searched_channels, 1) >= 1),
    -- REQ-SRC-001. 비어 있어도 되지만 NULL 이면 안 된다 — NULL 은 "못 뒤진 채널이
    -- 없다" 와 "적지 않았다" 를 같게 만든다.
    unsearched_channels TEXT[] NOT NULL,
    explanation_state   TEXT NOT NULL
      CHECK (explanation_state IN ('EXPLAINED','PARTIAL','UNEXPLAINED')),
    information_set_id  TEXT NOT NULL
      REFERENCES governance.analysis_information_set(information_set_id),
    -- **NULL 을 허용하는 이유** — REQ-ARCH-001 을 느슨하게 푸는 것이 아니라,
    -- 없는 계보를 지어내지 않기 위해서다.
    --
    -- 이 판정의 1차 입력은 일봉이다. 커널의 knowledge.derivation_input 이 받는
    -- 여덟 종류(source_revision · assertion · numeric_fact · relation_revision ·
    -- relation_evidence · impact_path · relation_measurement · derivation_step)에
    -- **가격 봉을 가리키는 것이 없고**, market_ts.ohlcv 는 ingestion.source_revision
    -- 으로 가는 연결도 들고 있지 않다(source_id 는 'yfinance' 라는 문자열 딱지다).
    --
    -- 그러므로 선택지는 둘이었다: (가) 입력이 아니었던 numeric_fact 를 아무거나
    -- 끌어다 인용한다, (나) 표현할 수 있는 것만 잇고 나머지는 비운다.
    -- (가)는 감사 사슬을 이어붙인 것처럼 보이게 만들면서 실제로는 거짓을 적는다.
    --
    -- 그래서 동종 이웃을 실제로 조회한 행은 그 relation_revision 들을 입력으로
    -- 삼아 도출을 남기고, 이웃이 없어 조회할 것이 없었던 행은 NULL 이다.
    -- information_set_id 는 어느 쪽이든 NOT NULL 이라 PIT 세계는 항상 고정된다.
    derivation_id       BIGINT REFERENCES knowledge.derivation(derivation_id),
    supersedes_market_anomaly_revision_id BIGINT
      REFERENCES analytics.market_anomaly_revision(market_anomaly_revision_id),
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(metadata) = 'object'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (anomaly_key, revision_no),
    CHECK (matched_channel_count <= coalesce(array_length(searched_channels, 1), 0)),
    -- 상태를 발견 수와 **한 곳에서** 묶는다. 두 컬럼이 따로 놀면 원장이 스스로와
    -- 모순되고, 어느 쪽이 진실인지 다음 사람이 알 수 없다.
    CHECK (
      (matched_channel_count = 0 AND explanation_state = 'UNEXPLAINED')
      OR (matched_channel_count = 1 AND explanation_state = 'PARTIAL')
      OR (matched_channel_count >= 2 AND explanation_state = 'EXPLAINED')
    ),
    CHECK (
      (revision_no = 1 AND supersedes_market_anomaly_revision_id IS NULL)
      OR (revision_no > 1 AND supersedes_market_anomaly_revision_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_market_anomaly_subject_date
  ON analytics.market_anomaly_revision (subject_entity_id, observation_date DESC, revision_no DESC);
CREATE INDEX IF NOT EXISTS ix_market_anomaly_date_state
  ON analytics.market_anomaly_revision (observation_date DESC, explanation_state);

DROP TRIGGER IF EXISTS market_anomaly_revision_append_only
  ON analytics.market_anomaly_revision;
CREATE TRIGGER market_anomaly_revision_append_only
  BEFORE UPDATE OR DELETE ON analytics.market_anomaly_revision
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_k4_ledger_mutation();

-- 화면이 읽을 자리. 키마다 최신 리비전 하나.
CREATE OR REPLACE VIEW serving.market_anomaly_current_v1 AS
SELECT DISTINCT ON (anomaly.anomaly_key)
       anomaly.market_anomaly_revision_id,
       anomaly.anomaly_key,
       anomaly.revision_no,
       anomaly.subject_entity_id,
       anomaly.observation_date,
       anomaly.as_of_at,
       anomaly.move_return,
       anomaly.move_sigma,
       anomaly.volume_z,
       anomaly.known_event_count,
       anomaly.peer_comove_count,
       anomaly.peer_priced_count,
       anomaly.market_move_pct,
       anomaly.market_sample_count,
       anomaly.matched_channel_count,
       anomaly.searched_channels,
       anomaly.unsearched_channels,
       anomaly.explanation_state,
       anomaly.information_set_id,
       anomaly.derivation_id
  FROM analytics.market_anomaly_revision anomaly
 ORDER BY anomaly.anomaly_key, anomaly.revision_no DESC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON serving.market_anomaly_current_v1 TO stock_insight_app_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_writer') THEN
    GRANT SELECT ON serving.market_anomaly_current_v1 TO stock_insight_app_writer;
  END IF;
END $$;
`;
