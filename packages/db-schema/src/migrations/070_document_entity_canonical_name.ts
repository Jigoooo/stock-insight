export const documentEntityCanonicalNameMigrationSql = `
-- Admit 'canonical_name' as a document→entity link method.
--
-- The linker matched documents against core.entity_alias and US tickers only, and
-- never against core.entity.canonical_name — the one catalog that has a name for
-- every stock. Measured 2026-08-06 across 4,895 news documents:
--
--   core.entity_alias        354 rows for 325 Stock entities (1.09 names each)
--     of which Hangul         94
--   news documents in Korean  2,712 of 4,895
--   canonical_name matches    770 documents on its own
--   union of all linkers      672 → 914 documents (13.7% → 18.7%)
--
-- Folding these into 'alias_exact' was the alternative and is rejected: the whole
-- finding is that one catalog was never consulted, and a link method that cannot
-- say which catalog produced it would hide exactly that on the next audit.
--
-- The remaining 81% is NOT a matching problem — the universe is 325 stocks and the
-- news covers a whole market, so most articles name no company we hold. This
-- migration does not change that and should not be read as if it did.
ALTER TABLE knowledge.document_entity
  DROP CONSTRAINT IF EXISTS document_entity_link_method_check;

ALTER TABLE knowledge.document_entity
  ADD CONSTRAINT document_entity_link_method_check
  CHECK (link_method = ANY (ARRAY[
    'symbol_exact',
    'alias_exact',
    -- Exact match on core.entity.canonical_name after stripping Korean corporate
    -- forms ((주), 주식회사, ㈜, (유), 유한회사) and whitespace. Hangul names only:
    -- stripping whitespace also removes token boundaries, and a Latin name without
    -- boundaries hides inside longer Latin words — measured the same day: sk inside
    -- novonordiskas, ls inside appliedmaterialsinc, gm inside figma. 76 collisions
    -- across 10 short Latin names against 7 across 24 Hangul ones. Latin stays with
    -- the ticker and alias linkers, which keep their boundaries.
    'canonical_name',
    'context_scored',
    'legacy_key',
    'manual'
  ]));
`;
