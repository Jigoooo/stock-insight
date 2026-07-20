export const stalePublicationServingMigrationSql = `
-- Task 20 closure — stale publication serving consistency.
-- A stale projection remains the latest immutable PIT snapshot. Keep all binding,
-- lifecycle, payload-hash, domain, run-date, and briefing/run-type guards intact;
-- only widen the status envelope from available to available-or-stale.

CREATE OR REPLACE VIEW ops.internal_web_publication_records AS
SELECT
  status.analysis_run_id,
  status.analysis_revision,
  status.cutoff_at,
  status.source_watermark_at,
  status.fresh_until,
  publication.id,
  publication.record_key,
  publication.record_type,
  publication.domain,
  publication.market,
  publication.run_date,
  publication.run_type,
  publication.source_system,
  publication.source_table,
  publication.source_pk,
  publication.entity_id,
  publication.entity_key,
  publication.ticker,
  publication.name,
  publication.category,
  publication.title,
  publication.body_text,
  publication.summary_text,
  publication.numeric_value,
  publication.change_pct,
  publication.currency,
  publication.confidence,
  publication.horizon,
  publication.quality_flags,
  publication.raw_refs,
  publication.raw_json,
  publication.created_at,
  publication.published_at,
  binding.lifecycle_state
FROM ops.publication_projection_status status
JOIN ops.analysis_run_record binding
  ON binding.analysis_run_id = status.analysis_run_id
 AND binding.revision = status.analysis_revision
 AND binding.lifecycle_state = 'active'
JOIN public.publication_records publication
  ON publication.id = binding.record_id
WHERE status.projection_status IN ('available', 'stale')
  AND publication.domain = status.domain
  AND publication.run_date = status.run_date
  AND (publication.record_type <> 'briefing' OR publication.run_type = status.run_type)
  AND binding.payload_sha256 = ops.publication_record_payload_sha256(binding.record_id);

GRANT SELECT ON ops.internal_web_publication_records TO stock_insight_reader;
`;
