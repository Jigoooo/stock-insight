/**
 * 시세 스냅샷을 읽는 **단 하나의 관계 이름**.
 *
 * `stock.market_snapshots` 에는 시세가 아닌 행이 섞여 있다. 수집기가 매일
 * `snapshot_type='api_key_status'` 진단 프로브를 같은 표에 적는다(라이브 1,943행,
 * `symbol` 은 `FRED_API_KEY` 같은 값). `WHERE symbol IS NOT NULL` 은 그것을 거르지
 * 못한다 — 진단행도 symbol 을 갖는다.
 *
 * 결과가 사용자에게 도달했다. 「시장 데이터」 기준 시각이
 * **2026-08-12** 로 보이는 동안 실제 시세는 **2026-07-25** 에서 멈춰 있었다 —
 * 18일 과대 표시다. 시세 수집이 멈춘 사실이 진단 프로브의 심장박동에 가려졌다.
 *
 * 규칙은 이미 저장소에 적혀 있었다. `007_serving_read_layer.ts:4` 가
 * "Diagnostic-row isolation: read paths must not see api_key_status/env rows" 라고
 * **복수형 read paths** 로 선언하고 `serving.market_snapshots_clean_v1` 을 만들어
 * `stock_insight_app_reader` 에 GRANT 까지 했다. 뷰는 있었고 읽는 곳만 없었다 —
 * 이 저장소의 반복 패턴이다.
 *
 * 그래서 원본 표를 직접 부르지 않는다. 같은 표현식이 여섯 자리에 복붙돼 있던 것이
 * 이 결함이 여섯 곳에서 동시에 참이었던 이유이므로, 관계 이름과 as-of 표현식을
 * 여기 한 번만 적는다.
 */
export const MARKET_SNAPSHOTS_RELATION = 'serving.market_snapshots_clean_v1';

/**
 * 「시장 데이터 기준 시각」. 뷰가 이미 `symbol IS NOT NULL` 을 포함하므로 조건을
 * 다시 걸지 않는다 — 두 벌로 두면 한쪽만 갱신된다.
 */
export const MARKET_DATA_AS_OF_SQL = `
  SELECT max(coalesce(nullif(collected_at, ''), nullif(snapshot_date, ''))) AS market_data_as_of
  FROM ${MARKET_SNAPSHOTS_RELATION}
`;

/** 서브쿼리 자리에 그대로 끼워 넣는 형태. 위 SQL 과 같은 값을 돌려준다. */
export const MARKET_DATA_AS_OF_EXPR = `(
      SELECT max(coalesce(nullif(collected_at, ''), nullif(snapshot_date, '')))
      FROM ${MARKET_SNAPSHOTS_RELATION}
    )`;
