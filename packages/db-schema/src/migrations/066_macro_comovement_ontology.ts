export const macroComovementOntologyMigrationSql = `
-- Approves MACRO_COMOVEMENT so the correlation builder's candidates can be
-- accepted rather than rejected at the ledger gate.
--
-- 065 gave the 13 FRED series an identity; this gives the relation between a
-- series and a stock a name. The name is the whole point of the row: what the
-- builder measures is "these two moved together over a stated window", and
-- AFFECTS or EXPOSES would assert a direction and a mechanism that no
-- correlation contains. This sits with PRODUCT_SIMILARITY and SAME_ETF_BASKET,
-- not with the causal predicates.
--
-- directional=false, matching PRODUCT_SIMILARITY/SAME_ETF_BASKET: correlation is
-- symmetric, and the builder writes the pair in a canonical order rather than
-- claiming the series "acts on" the stock.
--
-- effective_from is 2000-01-01, copied from 024 for the same reason. The guard
-- knowledge.guard_accepted_relation_revision checks
-- ontology.effective_from <= NEW.valid_from, and candidate valid_from is derived
-- from the observation window, which starts long before this migration runs. A
-- now() here would reject every candidate the builder ever produces.
--
-- The revision_no/NOT EXISTS shape is 024's, so re-running is a no-op and an
-- already-approved predicate is never given a second approved revision.

INSERT INTO knowledge.predicate_ontology_revision (
  predicate, revision_no, relation_class, directional, policy_status,
  effective_from, description, metadata
)
SELECT seed.predicate,
       coalesce((
         SELECT max(existing.revision_no)
         FROM knowledge.predicate_ontology_revision existing
         WHERE existing.predicate = seed.predicate
       ), 0) + 1,
       seed.relation_class,
       seed.directional,
       seed.policy_status,
       '2000-01-01T00:00:00Z',
       seed.description,
       jsonb_build_object('seeded_by', 'migration-066', 'builder_wave', 'macro-comovement-v1')
FROM (VALUES
  ('MACRO_COMOVEMENT', 'association', false, 'approved',
   'Measured co-movement between a macro series and a stock over a stated window (model config bound). Statistical only: asserts no direction, mechanism, or cause.')
) AS seed(predicate, relation_class, directional, policy_status, description)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.predicate_ontology_revision approved_existing
  WHERE approved_existing.predicate = seed.predicate
    AND approved_existing.policy_status = 'approved'
)
ON CONFLICT (predicate, revision_no) DO NOTHING;
`;
