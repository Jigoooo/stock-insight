export const macroSeriesEntitiesMigrationSql = `
-- Gives the 13 FRED series an identity, so a relation can point at one.
--
-- market.macro_vintage has carried 55,775 rows across 13 series since 2014 and
-- none of it reaches the graph: measured 2026-08-04, entities of type 'Metric'
-- have zero edges in the sealed snapshot, and no core.entity exists for any
-- series at all. A relation needs both endpoints to be entities, so this is the
-- first thing in the way.
--
-- This migration only creates identity. It asserts no relationship between a
-- series and any company — that is the correlation builder's job, and it will
-- bind its model configuration so the result can be re-run and disagreed with.

CREATE TABLE IF NOT EXISTS analytics.macro_series_topic (
    macro_series_topic_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    series_key            TEXT NOT NULL UNIQUE,
    -- Matches analytics.market_topic_term.topic so a market-news item and a
    -- macro series can be recognised as being about the same thing.
    topic                 TEXT NOT NULL CHECK (length(btrim(topic)) > 0),
    display_name          TEXT NOT NULL,
    active                BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE analytics.macro_series_topic IS
  'Which market-news topic each FRED series belongs to. A mapping somebody chose, '
  'not an observation — kept in a table so a wrong row is a delete rather than a '
  'deploy, the same reason analytics.market_topic_term is a table.';

-- The topic column is a judgement and is written as one. WALCL is the Fed
-- balance sheet, filed under 'rates' because the vocabulary's rates topic already
-- carries 연준 and FOMC; if that reads wrong later it is one row to change.
INSERT INTO analytics.macro_series_topic (series_key, topic, display_name) VALUES
  ('fred:DGS10',    'rates',     '미국 10년물 국채 금리'),
  ('fred:DGS2',     'rates',     '미국 2년물 국채 금리'),
  ('fred:FEDFUNDS', 'rates',     '연방기금금리'),
  ('fred:WALCL',    'rates',     '연준 대차대조표 총자산'),
  ('fred:CPIAUCSL', 'inflation', '미국 소비자물가지수'),
  ('fred:PCEPI',    'inflation', '개인소비지출 물가지수'),
  ('fred:UNRATE',   'growth',    '미국 실업률'),
  ('fred:PAYEMS',   'growth',    '비농업 부문 고용'),
  ('fred:ICSA',     'growth',    '주간 신규 실업수당 청구'),
  ('fred:INDPRO',   'growth',    '산업생산지수'),
  ('fred:RSAFS',    'growth',    '소매판매'),
  ('fred:UMCSENT',  'growth',    '미시간대 소비자심리지수'),
  ('fred:DEXKOUS',  'fx',        '원/달러 환율')
ON CONFLICT (series_key) DO NOTHING;

-- One entity per series. canonical_name is the series key itself: it is already
-- namespaced ('fred:') and matching market.macro_vintage.series_key exactly means
-- the join needs no translation table and cannot drift from one.
INSERT INTO core.entity (entity_type, canonical_name, metadata)
SELECT 'Metric',
       mapping.series_key,
       jsonb_build_object(
         'source', 'fred',
         'series_key', mapping.series_key,
         'topic', mapping.topic,
         'display_name', mapping.display_name,
         'created_by', 'migration-065'
       )
FROM analytics.macro_series_topic mapping
WHERE NOT EXISTS (
  SELECT 1 FROM core.entity existing
  WHERE existing.entity_type = 'Metric'
    AND existing.canonical_name = mapping.series_key
);

-- FRED_SERIES rather than INTERNAL_KEY: INTERNAL_KEY is the security namespace
-- (KR:###### / US:TICKER) and putting a macro series in it would let a bad join
-- silently treat a series as a stock.
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity.entity_id, 'FRED_SERIES', entity.canonical_name
FROM core.entity entity
JOIN analytics.macro_series_topic mapping ON mapping.series_key = entity.canonical_name
WHERE entity.entity_type = 'Metric'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity_identifier existing
    WHERE existing.entity_id = entity.entity_id
      AND existing.identifier_type = 'FRED_SERIES'
  );
`;
