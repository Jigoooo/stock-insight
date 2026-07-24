export const cryptoServingViewsMigrationSql = `
-- P6-6 — read-only crypto serving views. These views preserve revision time and
-- source lineage; PIT selection remains explicit in the API query.
CREATE SCHEMA IF NOT EXISTS crypto_serving;

CREATE OR REPLACE VIEW crypto_serving.entity_revision AS
SELECT
  entity.crypto_entity_id,
  entity.entity_key,
  entity.entity_kind,
  entity.chain_id,
  revision.crypto_entity_revision_id,
  revision.revision_no,
  revision.display_name,
  revision.symbol,
  revision.source_revision_id,
  revision.available_at,
  revision.known_at,
  revision.valid_from,
  revision.valid_until
FROM crypto_identity.entity entity
JOIN crypto_identity.entity_revision revision
  ON revision.crypto_entity_id = entity.crypto_entity_id;

CREATE OR REPLACE VIEW crypto_serving.event_revision AS
SELECT
  event.crypto_event_id,
  event.event_key,
  event.event_type,
  event.blockchain_entity_id,
  revision.crypto_event_revision_id,
  revision.revision_no,
  revision.lifecycle_state,
  revision.summary_text AS summary,
  revision.primary_reference_kind,
  revision.primary_reference_value,
  revision.finality_state,
  revision.source_revision_id,
  revision.occurred_at,
  revision.available_at,
  revision.known_at,
  revision.valid_from,
  revision.valid_until
FROM crypto_truth.event event
JOIN crypto_truth.event_revision revision
  ON revision.crypto_event_id = event.crypto_event_id;

CREATE OR REPLACE VIEW crypto_serving.core_relation_revision AS
SELECT
  relation.crypto_core_relation_revision_id,
  relation.relation_key,
  relation.revision_no,
  relation.crypto_entity_id,
  crypto.entity_key AS crypto_entity_key,
  crypto_revision.display_name AS crypto_name,
  relation.core_entity_id,
  core_identifier.identifier_value AS core_entity_key,
  core.canonical_name AS core_name,
  core.entity_type AS core_entity_type,
  relation.relation_kind,
  relation.relation_state,
  relation.economic_magnitude,
  relation.economic_magnitude_unit,
  relation.epistemic_confidence,
  relation.source_revision_id,
  relation.available_at,
  relation.known_at,
  relation.valid_from,
  relation.valid_until
FROM cross_domain.crypto_core_relation_revision relation
JOIN crypto_identity.entity crypto
  ON crypto.crypto_entity_id = relation.crypto_entity_id
JOIN core.entity core
  ON core.entity_id = relation.core_entity_id
LEFT JOIN LATERAL (
  SELECT revision.display_name
  FROM crypto_identity.entity_revision revision
  WHERE revision.crypto_entity_id = relation.crypto_entity_id
    AND revision.known_at <= relation.known_at
    AND (revision.valid_from IS NULL OR revision.valid_from <= relation.known_at)
    AND (revision.valid_until IS NULL OR revision.valid_until > relation.known_at)
  ORDER BY revision.known_at DESC, revision.revision_no DESC
  LIMIT 1
) crypto_revision ON true
LEFT JOIN LATERAL (
  SELECT identifier.identifier_value
  FROM core.entity_identifier identifier
  WHERE identifier.entity_id = relation.core_entity_id
    AND identifier.identifier_type = 'INTERNAL_KEY'
    AND (identifier.valid_from IS NULL OR identifier.valid_from <= relation.known_at)
    AND (identifier.valid_to IS NULL OR identifier.valid_to > relation.known_at)
  ORDER BY identifier.valid_from DESC NULLS LAST, identifier.identifier_id DESC
  LIMIT 1
) core_identifier ON true
WHERE relation.relation_kind IN (
  'issued_by_company','treasury_held_by_company','reserve_managed_by_company',
  'operated_by_company','mined_by_company','custodied_by_company',
  'revenue_exposure_company','cost_exposure_company',
  'payment_distribution_company','etf_underlying_exposure'
);

CREATE OR REPLACE VIEW crypto_serving.risk_exposure_revision AS
SELECT
  exposure.risk_exposure_revision_id AS crypto_risk_exposure_revision_id,
  exposure.exposure_key,
  exposure.revision_no,
  exposure.crypto_entity_id,
  crypto.entity_key AS crypto_entity_key,
  crypto_revision.display_name AS crypto_name,
  shock.shock_type,
  channel.channel_class AS channel_key,
  CASE exposure.sign
    WHEN 'positive' THEN 1
    WHEN 'negative' THEN -1
    ELSE 0
  END AS direction_sign,
  exposure.economic_magnitude,
  exposure.economic_magnitude_unit,
  exposure.epistemic_confidence,
  exposure.exposure_state AS lifecycle_state,
  exposure.source_revision_id,
  exposure.available_at,
  exposure.known_at,
  exposure.valid_from,
  exposure.valid_until
FROM crypto_analytics.risk_exposure_revision exposure
JOIN crypto_analytics.risk_shock shock
  ON shock.risk_shock_id = exposure.risk_shock_id
JOIN crypto_analytics.transmission_channel channel
  ON channel.transmission_channel_id = exposure.transmission_channel_id
JOIN crypto_identity.entity crypto
  ON crypto.crypto_entity_id = exposure.crypto_entity_id
LEFT JOIN LATERAL (
  SELECT revision.display_name
  FROM crypto_identity.entity_revision revision
  WHERE revision.crypto_entity_id = exposure.crypto_entity_id
    AND revision.known_at <= exposure.known_at
    AND (revision.valid_from IS NULL OR revision.valid_from <= exposure.known_at)
    AND (revision.valid_until IS NULL OR revision.valid_until > exposure.known_at)
  ORDER BY revision.known_at DESC, revision.revision_no DESC
  LIMIT 1
) crypto_revision ON true;

GRANT USAGE ON SCHEMA crypto_serving TO si_publisher, si_readapi;
GRANT SELECT ON
  crypto_serving.entity_revision,
  crypto_serving.event_revision,
  crypto_serving.core_relation_revision,
  crypto_serving.risk_exposure_revision
TO si_publisher;
GRANT SELECT ON
  crypto_serving.entity_revision,
  crypto_serving.event_revision,
  crypto_serving.core_relation_revision,
  crypto_serving.risk_exposure_revision
TO si_readapi;
`;
