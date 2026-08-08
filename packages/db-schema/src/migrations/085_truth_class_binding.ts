export const truthClassBindingMigrationSql = `
-- Truth class metadata (canonical/11 §5 ADDITIVE list, REQ-SEM-010).
--
-- THE GAP THIS CLOSES. REQ-SEM-010 says a truth class must be visually
-- distinguished in the UI. Measured 2026-08-08, the projection the UI actually
-- reads cannot do that: serving.content_pack_item carries item_kind with three
-- values — evidence (2,282,119), relation (912,988), impact_path (207,486) —
-- which is the storage vocabulary, not one of the fourteen classes in
-- contracts/truth-classes.json. Nothing downstream can tell a source from a
-- hypothesis, so nothing can render them differently.
--
-- WHY A BINDING TABLE RATHER THAN A COLUMN. Adding truth_class to
-- content_pack_item means an UPDATE over 3.4M rows of a table the product reads,
-- and it would put the classification in the data where it cannot be reviewed.
-- The classification is a judgement about what a kind of object *is*; it belongs
-- somewhere it can be read, argued with and revised without rewriting rows. The
-- view at the bottom resolves it at read time.
--
-- WHY SOME BINDINGS HAVE NO CLASS. Of the 67,700 relation evidence rows, 8,645
-- are model_config and 254 are identity_mapping. A model configuration is
-- provenance of an inference, and an identity mapping is a statement about which
-- record is which — neither is a claim about the world, and the fourteen classes
-- have no word for them. Recording them as unclassified is the honest answer;
-- defaulting them to SOURCE would tell a reader that a model config is evidence
-- somebody filed.

CREATE TABLE IF NOT EXISTS governance.truth_class_binding (
    truth_class_binding_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- What is being classified: the projection vocabulary a reader meets, not a
    -- table name. Two items can sit in one table and be different classes, which
    -- is exactly the case for content_pack_item's evidence rows.
    object_domain TEXT NOT NULL CHECK (length(btrim(object_domain)) > 0),
    object_kind   TEXT NOT NULL CHECK (length(btrim(object_kind)) > 0),
    object_subkind TEXT,

    truth_class TEXT CHECK (truth_class IN (
      'SOURCE', 'ASSERTION', 'FACT', 'EVENT', 'RELATION', 'EXPOSURE',
      'STATISTICAL_ESTIMATE', 'CAUSAL_ESTIMATE', 'FORECAST', 'HYPOTHESIS',
      'NARRATIVE', 'RECOMMENDATION', 'PERSONAL_DECISION', 'OUTCOME'
    )),

    binding_state TEXT NOT NULL DEFAULT 'bound'
      CHECK (binding_state IN ('bound', 'not_a_truth_object', 'undecided')),

    -- The measurement or document the classification rests on. A binding without
    -- one is an opinion, and this table exists so opinions can be told apart from
    -- readings.
    basis TEXT NOT NULL CHECK (length(btrim(basis)) > 0),

    declared_by TEXT NOT NULL CHECK (length(btrim(declared_by)) > 0),
    known_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One binding per addressable kind. A subkind of NULL is its own address, so
    -- the index has to treat it as a value rather than as unknown.
    UNIQUE NULLS NOT DISTINCT (object_domain, object_kind, object_subkind),

    CONSTRAINT truth_class_binding_state_agrees CHECK (
      (binding_state = 'bound' AND truth_class IS NOT NULL)
      OR (binding_state <> 'bound' AND truth_class IS NULL)
    )
);

COMMENT ON TABLE governance.truth_class_binding IS
  'Which of the fourteen truth classes a projected object kind carries (REQ-SEM-010).';

-- ── the bindings, each with what it was read from ────────────────────────────

INSERT INTO governance.truth_class_binding
  (object_domain, object_kind, object_subkind, truth_class, binding_state, basis, declared_by)
VALUES
  ('serving.content_pack_item', 'relation', NULL, 'RELATION', 'bound',
   'knowledge.relation_revision is a persisting stated relation between entities, carrying valid_from/valid_to and an acceptance revision. That is canonical/00 §4 RELATION.',
   'migration-085'),

  -- Deliberately not EXPOSURE. All 248,236 impact_path_v2 rows measured
  -- 2026-08-08 are inference_kind='rule_derived' with direction='unknown', and an
  -- exposure without a sign is not an exposure. run-portfolio-snapshot.ts:18
  -- already refuses to promote these into analytics.impact_exposure_revision
  -- because "filling it would mean inventing sign, materiality and economic
  -- magnitude". Labelling them EXPOSURE here would make in the UI the claim the
  -- pipeline declines to make in the data.
  ('serving.content_pack_item', 'impact_path', NULL, 'HYPOTHESIS', 'bound',
   'analytics.impact_path_v2: 248,236 rows, all inference_kind=rule_derived and direction=unknown. A rule-derived chain from a trigger to an entity, with no established sign or magnitude, is canonical/00 §4 HYPOTHESIS.',
   'migration-085'),

  ('serving.content_pack_item', 'evidence', 'source_revision', 'SOURCE', 'bound',
   'knowledge.relation_evidence_ledger.evidence_kind=source_revision, 58,801 rows, each naming an ingestion.source_revision. The object is the retained source itself.',
   'migration-085'),

  ('serving.content_pack_item', 'evidence', 'model_config', NULL, 'not_a_truth_object',
   'knowledge.relation_evidence_ledger.evidence_kind=model_config, 8,645 rows. A model configuration is provenance of an inference, not a claim about the world, and none of the fourteen classes describes it.',
   'migration-085'),

  ('serving.content_pack_item', 'evidence', 'identity_mapping', NULL, 'not_a_truth_object',
   'knowledge.relation_evidence_ledger.evidence_kind=identity_mapping, 254 rows. A statement about which record is which is identity resolution, not truth about the world.',
   'migration-085')
ON CONFLICT DO NOTHING;

-- ── the resolved projection ──────────────────────────────────────────────────
--
-- A view rather than a column so the 3.4M-row table the product reads is not
-- rewritten, and so a revised binding takes effect without a backfill.
--
-- An item whose kind has no binding resolves to NULL rather than to a default.
-- REQ-SEM-010 asks for a visible distinction, and a made-up class is worse than
-- an admitted gap: a reader can render "unclassified" honestly, but cannot
-- un-see a wrong badge.

CREATE OR REPLACE VIEW serving.content_pack_item_truth_v1 AS
SELECT item.content_pack_item_id,
       item.content_pack_id,
       item.item_no,
       item.item_kind,
       ledger.evidence_kind AS item_subkind,
       binding.truth_class,
       coalesce(binding.binding_state, 'undecided') AS truth_binding_state
  FROM serving.content_pack_item item
  LEFT JOIN knowledge.relation_evidence_ledger ledger
    ON ledger.relation_evidence_ledger_id = item.relation_evidence_ledger_id
  LEFT JOIN governance.truth_class_binding binding
    ON binding.object_domain = 'serving.content_pack_item'
   AND binding.object_kind = item.item_kind
   AND binding.object_subkind IS NOT DISTINCT FROM
       CASE WHEN item.item_kind = 'evidence' THEN ledger.evidence_kind END;

COMMENT ON VIEW serving.content_pack_item_truth_v1 IS
  'content_pack_item with the truth class its kind carries; NULL where nothing is bound.';

-- GRANTS: pipeline roles write the bindings, the read API and the app reader see
-- the resolved view. The app reader needs it because REQ-SEM-010 is a rendering
-- requirement — this is the one place in this migration series where the app
-- roles gain reach, so the boot digest will move and must be re-pinned.
GRANT SELECT, INSERT, UPDATE ON governance.truth_class_binding
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON governance.truth_class_binding TO si_readapi;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON serving.content_pack_item_truth_v1
  TO si_readapi, si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON serving.content_pack_item_truth_v1 TO stock_insight_app_reader;
`;
