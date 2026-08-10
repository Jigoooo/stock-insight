export const sameIndustryOntologyEffectiveFromMigrationSql = `
-- Corrects the date from which the approved SAME_INDUSTRY meaning holds.
--
-- Migration 115 approved the predicate with effective_from 2026-08-11, the day of the
-- approval. knowledge.guard_accepted_relation_revision requires
-- ontology.effective_from <= NEW.valid_from, and a SAME_INDUSTRY edge is valid from the
-- day the LATER of its two classifications began — 2026-07-19 for most of the universe,
-- because that is when the taxonomy was first populated. So 115 approved a predicate
-- that could not accept a single one of its own edges. The first --apply failed on the
-- trigger, which is the guard doing its job.
--
-- Appended as revision 3 rather than edited into revision 2, for the reason every
-- correction here is appended: revision 2 is what we said on 2026-08-11 and deleting it
-- would destroy the record that we once said it.
--
-- 2000-01-01 follows SAME_ETF_BASKET, which hit this exactly once before — revision 1
-- dated effective_from 2026-07-19 and revision 2 moved it to 2000-01-01. The date is not
-- a claim that anyone classified anything in 2000. It is the bitemporal statement the
-- two columns exist to separate: effective_from says from when the MEANING holds, and
-- this meaning has no start date because it is a definition, while known_from says when
-- we decided it and stays honestly at today.
--
-- Everything else is carried forward from revision 2 unchanged, relation_class
-- 'hierarchy' included. The only thing this revision says differently is the date.

INSERT INTO knowledge.predicate_ontology_revision (
  predicate, revision_no, relation_class, directional, policy_status,
  effective_from, known_from, description, metadata
)
SELECT 'SAME_INDUSTRY',
       (SELECT max(revision_no) + 1 FROM knowledge.predicate_ontology_revision
         WHERE predicate = 'SAME_INDUSTRY'),
       'hierarchy', false, 'approved',
       TIMESTAMPTZ '2000-01-01T00:00:00Z', now(),
       'Two securities classified under the same industry code in the same system (KSIC or SIC), as reported by a source revision. Structural co-membership, not an economic link.',
       jsonb_build_object(
         'approved_by', 'migration-116',
         'derived_from', 'core.entity_taxonomy_membership',
         'excluded_codes', 'legal-form and residual buckets; see NON_INDUSTRY_CODES in same-industry-candidates.ts',
         'supersedes_relation_class', 'association',
         'corrects', 'migration-115 effective_from 2026-08-11 postdated every edge it was meant to approve'
       )
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.predicate_ontology_revision
   WHERE predicate = 'SAME_INDUSTRY'
     AND policy_status = 'approved'
     AND effective_from <= TIMESTAMPTZ '2000-01-01T00:00:00Z'
);
`;
