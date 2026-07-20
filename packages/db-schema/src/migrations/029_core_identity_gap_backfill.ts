// 029 — P0-5: core identity backfill for legacy-only US roots.
// US:AAL / US:NOK / US:T exist in public.entities (legacy) but never received
// a core.entity + INTERNAL_KEY identifier, so the V2 adapter could not even
// look them up and fell back to V1. Additive, idempotent: inserts only when
// the INTERNAL_KEY mapping is missing.

export const coreIdentityGapBackfillMigrationSql = `
SELECT pg_advisory_xact_lock(hashtextextended('migration:029_core_identity_gap_backfill', 0));

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_entity_p0_legacy_key
ON core.entity ((metadata ->> 'legacy_key'))
WHERE metadata ->> 'backfill' = 'p0-core-identity-gap-v1';

WITH missing(internal_key, canonical_name) AS (
  VALUES
    ('US:AAL', 'American Airlines Group'),
    ('US:NOK', 'Nokia Corporation (ADR)'),
    ('US:T',   'AT&T Inc')
), to_create AS (
  SELECT missing.internal_key, missing.canonical_name
  FROM missing
  WHERE NOT EXISTS (
    SELECT 1 FROM core.entity_identifier identifier
    WHERE identifier.identifier_type = 'INTERNAL_KEY'
      AND identifier.identifier_value = missing.internal_key
  )
), created AS (
  INSERT INTO core.entity (entity_type, canonical_name, country_code, metadata)
  SELECT 'Stock', to_create.canonical_name, 'US',
         jsonb_build_object('backfill', 'p0-core-identity-gap-v1', 'legacy_key', to_create.internal_key)
  FROM to_create
  ON CONFLICT ((metadata ->> 'legacy_key'))
    WHERE metadata ->> 'backfill' = 'p0-core-identity-gap-v1'
  DO UPDATE SET canonical_name = core.entity.canonical_name
  RETURNING entity_id, (metadata ->> 'legacy_key') AS internal_key
)
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value, namespace, valid_from)
SELECT created.entity_id, 'INTERNAL_KEY', created.internal_key, 'stock-insight', now()
FROM created
ON CONFLICT DO NOTHING;
`;
