export const ecosMacroSeriesMigrationSql = `
-- Korean macro series reach the graph. Five ECOS series, all under 'rates'.
--
-- WHY THE TOPIC IS 'rates' AND NOT A NEW ONE. analytics.market_topic_term already
-- carries 국채 · 금리 · 기준금리 · 한국은행 under 'rates', so Korean rate events
-- have been matching that topic all along — while every series mapped to it was
-- American (DGS10, DGS2, FEDFUNDS, WALCL). The gap was never the vocabulary.
--
-- WHY THIS NEEDED MORE THAN A MAPPING ROW. Migration 065/067/073 could stop at
-- mapping + entity + identifier because run-v2-graph-publish joined
-- core.entity_identifier on identifier_type = 'FRED_SERIES'. ECOS_SERIES has been
-- a legal identifier_type since migration 008 and no row had ever used one, so
-- that join was a wall, not a filter. It now accepts both namespaces; this
-- migration is the half that mints the rows, and neither half is useful alone.
--
-- WHAT IS DELIBERATELY NOT HERE:
--   원/달러 환율 (731Y003) — the same quantity as fred:DEXKOUS, already collected
--     and already mapped to 'fx'. A second Metric entity for one exchange rate
--     would double-count it in any correlation computed against both.
--   KOSPI (802Y001) — daily since 1995 and the only series that would give the
--     'market' topic its first mapping, so leaving it out is a real cost. But
--     MARKET_FACTOR_SQL builds the KR beta control as an equal-weighted index of
--     our own holdings, and a KOSPI series would be nearly the same object as that
--     control. Whether KOSPI should become the factor, the series, or both is a
--     modelling decision with its own before/after measurement.
--   뉴스심리지수 (521Y001) — BOK publishes it as 실험적 통계.

INSERT INTO analytics.macro_series_topic (series_key, topic, display_name) VALUES
  ('ecos:817Y002:010200000', 'rates', '국고채(3년) 금리'),
  ('ecos:817Y002:010210000', 'rates', '국고채(10년) 금리'),
  ('ecos:817Y002:010300000', 'rates', '회사채(3년, AA-) 금리'),
  ('ecos:817Y002:010502000', 'rates', 'CD(91일) 금리'),
  ('ecos:722Y001:0101000',   'rates', '한국은행 기준금리')
ON CONFLICT (series_key) DO NOTHING;

INSERT INTO core.entity (entity_type, canonical_name, metadata)
SELECT 'Metric',
       mapping.series_key,
       jsonb_build_object(
         'source', 'bok-ecos',
         'series_key', mapping.series_key,
         'topic', mapping.topic,
         'display_name', mapping.display_name,
         'created_by', 'migration-076'
       )
FROM analytics.macro_series_topic mapping
WHERE mapping.series_key LIKE 'ecos:%'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity existing
    WHERE existing.entity_type = 'Metric'
      AND existing.canonical_name = mapping.series_key
  );

-- The first ECOS_SERIES rows this database has ever held.
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity.entity_id, 'ECOS_SERIES', entity.canonical_name
FROM core.entity entity
WHERE entity.entity_type = 'Metric'
  AND entity.canonical_name LIKE 'ecos:%'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity_identifier existing
    WHERE existing.entity_id = entity.entity_id
      AND existing.identifier_type = 'ECOS_SERIES'
      AND existing.identifier_value = entity.canonical_name
  );
`;
