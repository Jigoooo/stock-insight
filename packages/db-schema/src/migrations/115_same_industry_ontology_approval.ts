export const sameIndustryOntologyApprovalMigrationSql = `
-- Approves the SAME_INDUSTRY predicate so its edges can be written.
--
-- Revision 1 says "Imported from active relation vocabulary; semantic approval
-- pending" — the placeholder every predicate got when the vocabulary was lifted into
-- the ontology table. persistRelationCandidates throws rather than quarantines when a
-- predicate has no approved revision, so nothing could ever write this edge.
--
-- Approval is appended as revision 2, following SAME_ETF_BASKET, because an ontology
-- revision is a statement about what the predicate MEANS and the old statement stays
-- readable rather than being edited into the new one.
--
-- WHAT IS BEING APPROVED, PRECISELY. Two securities carry the same industry code in the
-- same classification system, as reported by a source and recorded in
-- core.entity_taxonomy_membership. That is all it claims.
--
-- relation_class is 'hierarchy', not 'association'. Revision 1 said association, copied
-- from the vocabulary import along with everything else. It is wrong here and the
-- difference is load-bearing: relationSignalTier in the common asset view maps
-- association to 'weak' and hierarchy to 'structural', and canonical/01 §5 needs
-- competitor/peer to be admissible as a Discovery REASON. Association would file a
-- shared SIC code next to ETF co-membership and text similarity, which is the bucket
-- REQ-PROD-030 exists to keep out of the exposure slot — but so would erasing the
-- distinction the other way. Hierarchy says what it is: both securities sit under one
-- node of a classification tree.
--
-- Not directional. A shares an industry with B exactly when B shares one with A, and
-- the builder emits both directions of every pair for symmetry rather than because the
-- relation has a subject and an object in any meaningful sense.

INSERT INTO knowledge.predicate_ontology_revision (
  predicate, revision_no, relation_class, directional, policy_status,
  effective_from, known_from, description, metadata
)
SELECT 'SAME_INDUSTRY',
       (SELECT max(revision_no) + 1 FROM knowledge.predicate_ontology_revision
         WHERE predicate = 'SAME_INDUSTRY'),
       'hierarchy', false, 'approved',
       TIMESTAMPTZ '2026-08-11T00:00:00Z', now(),
       'Two securities classified under the same industry code in the same system (KSIC or SIC), as reported by a source revision. Structural co-membership, not an economic link.',
       jsonb_build_object(
         'approved_by', 'migration-115',
         'derived_from', 'core.entity_taxonomy_membership',
         'excluded_codes', 'legal-form and residual buckets; see NON_INDUSTRY_CODES in same-industry-candidates.ts',
         'supersedes_relation_class', 'association'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.predicate_ontology_revision
   WHERE predicate = 'SAME_INDUSTRY' AND policy_status = 'approved'
);
`;
