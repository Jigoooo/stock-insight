export const institutionalHolderEntitiesMigrationSql = `
-- Institutional holders as entities, so the ownership builder has a subject.
--
-- apps/api/src/relations/builders/ownership.ts has existed with approved ontology
-- (migration 024 seeds OWNS, HELD_BY and COMMON_OWNER as 'approved') and golden,
-- determinism and superhub-safety tests since B6. Measured 2026-08-07: its only
-- callers are those tests, HELD_BY has never held a single edge, and COMMON_OWNER's
-- 1,062 rows are all legacy quarantine from migration 023.
--
-- It was never a wiring job. buildOwnershipCandidates takes ownerEntityId and
-- ownedEntityId as core.entity ids, and the owned side already resolves —
-- public.institutional_holdings.entity_id joins to a core Stock through
-- public.entities.entity_key for 250 of 250 rows. The OWNER side had nowhere to
-- land: core.entity holds no institution at all.
--
-- WHY 'LegalEntity'. It is the type already used for non-issuer legal persons
-- (156 rows). 'Company' is reserved for issuers in our universe and would make an
-- asset manager indistinguishable from a holding.
--
-- WHY 'INTERNAL_KEY' WITH AN 'INSTITUTION:' PREFIX RATHER THAN 'CIK'. Six of the
-- thirteen holders publish a CIK and it is tempting to use it. But
-- core.entity_identifier is UNIQUE (identifier_type, identifier_value, namespace),
-- and a holder can also be an issuer we cover — Berkshire Hathaway is in this very
-- table as a filer. Minting a CIK row for the holder would then collide with, or
-- silently claim, the issuer's identifier. The CIK is kept in entity metadata,
-- where it is still joinable and cannot collide. Same reasoning as migration 068's
-- 'MACRO_TOPIC:' prefix: use the curated-key slot instead of widening a constraint.
--
-- Derived from the table rather than hardcoded, so a holder appearing later gets
-- an entity from a re-run instead of needing a new migration. Seven of the
-- thirteen have no CIK at all (국민연금공단, 삼성자산운용 …) — Korean holders are
-- disclosed through different filings, and requiring a CIK would drop them.

INSERT INTO core.entity (entity_type, canonical_name, metadata)
SELECT DISTINCT 'LegalEntity',
       holdings.institution,
       jsonb_build_object(
         'kind', 'institutional_holder',
         'institution_cik', nullif(btrim(coalesce(holdings.institution_cik, '')), ''),
         'source_table', 'public.institutional_holdings',
         'created_by', 'migration-077'
       )
FROM public.institutional_holdings holdings
WHERE btrim(coalesce(holdings.institution, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM core.entity existing
    WHERE existing.entity_type = 'LegalEntity'
      AND existing.canonical_name = holdings.institution
  );

INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity.entity_id, 'INTERNAL_KEY', 'INSTITUTION:' || entity.canonical_name
FROM core.entity entity
WHERE entity.entity_type = 'LegalEntity'
  AND entity.metadata->>'kind' = 'institutional_holder'
  AND NOT EXISTS (
    SELECT 1 FROM core.entity_identifier existing
    WHERE existing.identifier_type = 'INTERNAL_KEY'
      AND existing.identifier_value = 'INSTITUTION:' || entity.canonical_name
  );
`;
