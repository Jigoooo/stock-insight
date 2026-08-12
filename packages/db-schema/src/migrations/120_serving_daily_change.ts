export const servingDailyChangeMigrationSql = `
-- ─────────────────────────────────────────────────────────────────────────────
-- 120 · serving.daily_change_v1 — 일별 평균 등락을 살아있는 생산자에서
--
-- 대시보드의 일별 추세는 'stock.market_snapshots' 를 읽는다. 그 표는 이
-- 저장소에 **쓰는 코드가 없다** — 참조는 일회성 backfill 과 주석뿐이고 시세는
-- 2026-07-25 에 멈춰 있다. 그래서 추세가 36종목 · 7월 표본으로 굳었고,
-- 표본 수가 날마다 40배씩 널뛴다(07-19 n=1 / 07-17 n=3,755).
--
-- 살아있는 생산자는 따로 있다. 'market_ts.ohlcv' 의 stock/1D 는 301,220행에
-- 최신 2026-08-11 이고 'stock-insight-yfinance-ohlcv' 가 매일 채운다.
-- 007 이 만든 'serving.latest_price_v1' 이 이미 그 위에 서 있고,
-- 'stocks/read-model.ts' 는 그것을 우선 읽는다. 대시보드만 그 처치를 받지
-- 못했다 — 이 저장소가 반복해 겪은 "뷰는 있었고 읽는 곳만 없었다" 다.
--
-- 이 뷰는 그 짝을 맞춘다: 가격은 latest_price_v1, 추세는 여기.
--
-- ## 창을 뷰 안에 넣는 이유
--
-- 60일로 자르는 것을 호출자에게 맡기지 않는다. 맡기면 301,220행 위에서
-- 윈도 함수가 매번 돌고, 자르는 규칙이 화면마다 갈라진다. 추세는 최근을
-- 보는 것이고 60일이면 어느 화면이 요구하는 8~30 거래일을 모두 덮는다.
--
-- ## 표본 수를 함께 낸다
--
-- 'sample_count' 가 없으면 한 종목만 관측된 날의 평균과 361종목이 관측된 날의
-- 평균이 같은 굵기로 그려진다. 화면이 그 차이를 말할 수 있어야 한다.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW serving.daily_change_v1 AS
WITH windowed AS (
  SELECT symbol,
         ts,
         close,
         lag(close) OVER (PARTITION BY symbol ORDER BY ts) AS previous_close
    FROM market_ts.ohlcv
   WHERE domain = 'stock'
     AND timeframe = '1D'
     AND ts > now() - interval '60 days'
)
SELECT ts::date AS day,
       avg((close - previous_close) / previous_close * 100.0) AS average_change_pct,
       count(*)::int AS sample_count
  FROM windowed
 WHERE previous_close IS NOT NULL
   AND previous_close > 0
 GROUP BY ts::date;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON serving.daily_change_v1 TO stock_insight_app_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_writer') THEN
    GRANT SELECT ON serving.daily_change_v1 TO stock_insight_app_writer;
  END IF;
END $$;
`;
