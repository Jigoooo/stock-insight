export const macroTopicEntitiesMigrationSql = `
-- Macro topic entities, and the MEASURED_BY predicate that ties a topic to the
-- series that indicate it.
--
-- Why a topic node exists at all. knowledge.event.target_entity_id is a SINGLE
-- value, so an event about rates cannot attach to DGS10, DGS2, FEDFUNDS and
-- WALCL at once. run-event-text-attribution refuses to guess in exactly this
-- situation — "Ambiguity is not resolved by picking one" — so under the strict
-- rule only topics with exactly one mapped series could ever be attributed.
-- Measured 2026-08-05: that is fx (3 events) and energy (12), while rates (18)
-- stays unreachable because it has four series. The structure runs backwards:
-- broadening macro coverage makes attribution HARDER.
--
-- A topic is always one thing, so attaching the event to the topic removes the
-- ambiguity, and it keeps working as series are added. The cost is one extra
-- hop, which fits: event -> topic -> series -> stock is two hops from the
-- topic, exactly MAX_HOPS.
--
-- Entity type. 'Metric', the same type the series use, rather than 'Theme'.
-- analytics.theme already holds 138 rows whose evidence is 93% quarantined, and
-- borrowing that type would invite a bridge to a plane this repo has measured
-- and deliberately not connected.
--
-- Naming. 'topic:<key>' keeps these out of the way of the Metric entities that
-- already exist (BOK ECOS series, Macro:SPY, index levels) which use human names
-- or vendor keys.

INSERT INTO core.entity (entity_type, canonical_name, metadata)
SELECT DISTINCT 'Metric',
       'topic:' || mapping.topic,
       jsonb_build_object(
         'kind', 'macro_topic',
         'topic', mapping.topic,
         'created_by', 'migration-068'
       )
FROM analytics.macro_series_topic mapping
WHERE NOT EXISTS (
  SELECT 1 FROM core.entity existing
  WHERE existing.entity_type = 'Metric'
    AND existing.canonical_name = 'topic:' || mapping.topic
);

-- INTERNAL_KEY, not a new identifier type: core.entity_identifier constrains
-- identifier_type to a fixed list and INTERNAL_KEY is the slot for curated keys.
-- The 'MACRO_TOPIC:' prefix follows the existing 'EXCHANGE:KOSPI' convention so
-- the namespace stays legible without widening the constraint.
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity.entity_id, 'INTERNAL_KEY', 'MACRO_TOPIC:' || (entity.metadata->>'topic')
FROM core.entity entity
WHERE entity.entity_type = 'Metric'
  AND entity.metadata->>'kind' = 'macro_topic'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity_identifier existing
    WHERE existing.entity_id = entity.entity_id
      AND existing.identifier_type = 'INTERNAL_KEY'
      AND existing.identifier_value = 'MACRO_TOPIC:' || (entity.metadata->>'topic')
  );

-- effective_from is early for the same reason 066's is: the accepted-revision
-- guard checks ontology.effective_from <= NEW.valid_from, and valid_from comes
-- from the mapping's own history rather than from today.
INSERT INTO knowledge.predicate_ontology_revision (
  predicate, revision_no, relation_class, directional, policy_status,
  effective_from, description, metadata
)
SELECT 'MEASURED_BY',
       coalesce((
         SELECT max(existing.revision_no)
         FROM knowledge.predicate_ontology_revision existing
         WHERE existing.predicate = 'MEASURED_BY'
       ), 0) + 1,
       'hierarchy',
       true,
       'approved',
       '2000-01-01T00:00:00Z',
       'A macro topic and a series that indicates it, from the curated analytics.macro_series_topic mapping. Definitional, not measured: it carries no correlation and makes no claim that the series drives the topic.',
       jsonb_build_object('seeded_by', 'migration-068', 'source_table', 'analytics.macro_series_topic')
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.predicate_ontology_revision approved_existing
  WHERE approved_existing.predicate = 'MEASURED_BY'
    AND approved_existing.policy_status = 'approved'
);

-- The mapping snapshot needs a source of its own. Filing it under an existing
-- internal source would repeat the attribution bug fixed on 2026-08-05, where
-- five kinds of snapshot all landed under internal-etf-holdings-snapshot.
-- Shaped after internal-macro-series-window-snapshot (source 89) rather than
-- invented: same source_type, tier, enforcement and policy vocabulary, so the
-- contract reads the same way to anyone auditing either one.
INSERT INTO ingestion.source (
  provider_key, source_type, tier, license_status, redistribution, enforcement, metadata
)
SELECT 'internal-macro-topic-mapping-snapshot',
       'internal', 1, 'allowed', 'internal_only', 'hard',
       jsonb_build_object(
         'display_name', 'Curated macro topic-to-series mapping used by MEASURED_BY',
         'source_class', 'internal_curated',
         'source_table', 'analytics.macro_series_topic',
         'created_by', 'migration-068'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM ingestion.source WHERE provider_key = 'internal-macro-topic-mapping-snapshot'
);

INSERT INTO ingestion.source_contract_revision (
  source_id, revision_no, policy_status, cadence_policy, cutoff_policy, delay_policy,
  correction_policy, required_fields, license_policy, redistribution_policy,
  raw_retention_policy, quality_gate_policy, effective_from, known_from, content_hash
)
SELECT src.source_id, 1, 'approved',
       jsonb_build_object('kind', 'on_change_materialized_snapshot', 'timezone', 'Asia/Seoul'),
       jsonb_build_object('kind', 'capture_time', 'no_backdating', true),
       jsonb_build_object('state', 'observed_at_capture'),
       jsonb_build_object('mode', 'append_revision'),
       jsonb_build_array('series_key', 'topic'),
       jsonb_build_object('basis', 'internal_curation', 'status', 'allowed'),
       jsonb_build_object('mode', 'internal_only'),
       jsonb_build_object('mode', 'retain'),
       -- This mapping is an editorial judgement, not an observation, and the
       -- contract should say so plainly rather than imply it was collected.
       jsonb_build_object(
         'require_non_empty', true,
         'curated_not_observed', true,
         'exact_source_table_disclosure', 'analytics.macro_series_topic'
       ),
       '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z',
       encode(sha256('internal-macro-topic-mapping-snapshot:v1'::bytea), 'hex')
FROM ingestion.source src
WHERE src.provider_key = 'internal-macro-topic-mapping-snapshot'
  AND NOT EXISTS (
    SELECT 1 FROM ingestion.source_contract_revision existing
    WHERE existing.source_id = src.source_id
  );
`;
