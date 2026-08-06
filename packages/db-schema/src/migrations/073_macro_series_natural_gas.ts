export const macroSeriesNaturalGasMigrationSql = `
-- Henry Hub natural gas as a second series under the 'energy' topic.
--
-- 'energy' had exactly one series (WTI, migration 067), so every energy event
-- reached the graph through one instrument. A topic with one series cannot
-- distinguish "oil moved" from "energy moved".
--
-- WHY NOT gold, silver, copper — measured 2026-08-07 against the live FRED API
-- rather than assumed, because the expansion plan had assumed FRED carried them:
--   gold / silver   FRED no longer publishes a spot price. The LBMA fixings are
--                   discontinued; GVZCLS is a volatility index and the rest are
--                   producer/import price indices. Not a price.
--   copper          PCOPPUSDM exists and is current but is MONTHLY. The
--                   co-movement model aligns on trading days and drops monthly
--                   series (38/59 overlap, 64.4%), so it would collect vintages
--                   that nothing reads.
--
-- Same shape as 065 and 067: mapping row, then entity, then FRED_SERIES
-- identifier, each guarded so a re-run is a no-op.
INSERT INTO analytics.macro_series_topic (series_key, topic, display_name) VALUES
  ('fred:DHHNGSP', 'energy', '헨리허브 천연가스 현물가')
ON CONFLICT (series_key) DO NOTHING;

INSERT INTO core.entity (entity_type, canonical_name, metadata)
SELECT 'Metric',
       mapping.series_key,
       jsonb_build_object(
         'source', 'fred',
         'series_key', mapping.series_key,
         'topic', mapping.topic,
         'display_name', mapping.display_name,
         'created_by', 'migration-073'
       )
FROM analytics.macro_series_topic mapping
WHERE mapping.series_key = 'fred:DHHNGSP'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity existing
    WHERE existing.entity_type = 'Metric'
      AND existing.canonical_name = mapping.series_key
  );

INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity.entity_id, 'FRED_SERIES', entity.canonical_name
FROM core.entity entity
WHERE entity.entity_type = 'Metric'
  AND entity.canonical_name = 'fred:DHHNGSP'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity_identifier existing
    WHERE existing.entity_id = entity.entity_id
      AND existing.identifier_type = 'FRED_SERIES'
      AND existing.identifier_value = entity.canonical_name
  );
`;
