export const claimDedupeKeyMigrationSql = `
-- knowledge.claim had no uniqueness of any kind. Every extraction INSERT was
-- unconditional: no ON CONFLICT, no pre-existence check, and no constraint to
-- conflict against — verified across all 70 migrations. knowledge.event has had
-- ON CONFLICT (dedupe_key) since it was written; claims were simply never given
-- the same treatment.
--
-- Measured 2026-08-06 over 327 claims, splitting duplicates by where they come
-- from, because the two kinds need different fixes:
--
--   same document, repeated      34   ← this migration
--   across two documents         10   ← run-claim-merge, and it stays
--
-- The cross-document ten cannot be a constraint. Two documents reporting one event
-- days apart are the same claim; two reporting it months apart are not, and a
-- unique index cannot express "within 7 days". run-claim-merge answers that with a
-- measured window and attaches the second document as EVIDENCE, which is the shape
-- claim_evidence's (claim_id, document_id) primary key was built for.
--
-- NULLABLE, and that is the point. Existing rows keep a NULL key and never
-- conflict, so nothing is deleted and no history is rewritten to install this.
-- Claims cannot be deleted anyway — status transitions are trigger-guarded and
-- audited, and there is no deletion path. New extractions carry a key and dedupe.
ALTER TABLE knowledge.claim
  ADD COLUMN IF NOT EXISTS dedupe_key text;

COMMENT ON COLUMN knowledge.claim.dedupe_key IS
  'Document-scoped extraction identity: extract-claim-v1:<documentId>:r<revisionNo>:<predicate>:<subject>:<object>. NULL on rows predating 2026-08-06; those are deduped after the fact by run-claim-merge.';

-- Partial, so the NULL-keyed history is exempt rather than blocking. Postgres
-- treats NULLs as distinct in a plain unique index too, but the predicate states
-- the intent instead of relying on that.
CREATE UNIQUE INDEX IF NOT EXISTS claim_dedupe_key_unique
  ON knowledge.claim (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
`;
