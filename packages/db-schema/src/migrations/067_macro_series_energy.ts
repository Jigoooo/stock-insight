export const macroSeriesEnergyMigrationSql = `
-- Gives the energy topic a macro series, so the events that match it can reach
-- the graph at all.
--
-- Measured 2026-08-05: of the 872 unattributed macro-natured events, 95 match
-- market vocabulary, and 12 of those are the 'energy' topic (유가 11, 원유 1).
-- That topic had zero series mapped to it, so those 12 could not reach a Metric
-- entity no matter how attribution was designed — there was nothing to attach
-- them to. 065 seeded 13 series and all of them are rates, inflation, growth or
-- fx.
--
-- WTI rather than Brent: both are daily and the two are near-collinear, so
-- carrying both would add a second series that says the same thing and double
-- the degree every oil-sensitive stock takes. WTI is the contract US filings and
-- US-listed energy names price against.
--
-- Why this migration covers energy and not trade or market:
--   trade  (37 events) — the vocabulary is tariff/관세/무역수지. FRED's trade
--          balance BOPGSTB is MONTHLY and NETEXP is QUARTERLY, both below the
--          co-movement model's 60-observation minimum once resampled. There is
--          no daily series representing tariffs. Left uncovered on purpose.
--   market (23 events) — SP500 and VIXCLS are daily and would work mechanically,
--          but every stock correlates with the index. That edge says "this stock
--          moves with the market", which is beta: true, undifferentiating, and a
--          300-degree hub that would put every stock two hops from every other.
--          Adding it is a product judgement, not a data gap.

INSERT INTO analytics.macro_series_topic (series_key, topic, display_name) VALUES
  ('fred:DCOILWTICO', 'energy', 'WTI 원유 현물가')
ON CONFLICT (series_key) DO NOTHING;

-- Same shape as 065: entity first, then the FRED_SERIES identifier. Both are
-- guarded so a re-run is a no-op.
INSERT INTO core.entity (entity_type, canonical_name, metadata)
SELECT 'Metric',
       mapping.series_key,
       jsonb_build_object(
         'source', 'fred',
         'series_key', mapping.series_key,
         'topic', mapping.topic,
         'display_name', mapping.display_name,
         'created_by', 'migration-067'
       )
FROM analytics.macro_series_topic mapping
WHERE mapping.series_key = 'fred:DCOILWTICO'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity existing
    WHERE existing.entity_type = 'Metric'
      AND existing.canonical_name = mapping.series_key
  );

INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity.entity_id, 'FRED_SERIES', entity.canonical_name
FROM core.entity entity
WHERE entity.entity_type = 'Metric'
  AND entity.canonical_name = 'fred:DCOILWTICO'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity_identifier existing
    WHERE existing.entity_id = entity.entity_id
      AND existing.identifier_type = 'FRED_SERIES'
  );
`;
