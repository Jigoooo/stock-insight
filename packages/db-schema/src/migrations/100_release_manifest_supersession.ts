export const releaseManifestSupersessionMigrationSql = `
-- Makes 'superseded' a state a release can actually reach.
--
-- Migration 081 built the manifest with three agreeing parts and one that disagreed:
--
--   release_state CHECK      allows 'building','published','superseded','failed'
--   the append-only trigger  allows published -> superseded
--   published_at             is immutable once set
--   CHECK (release_state = 'published') = (published_at IS NOT NULL)   <-- this one
--
-- The last line says a release is published exactly when it has a published_at. Move
-- a published release to 'superseded' and the left side goes false while the right
-- stays true, so the row is rejected. published_at cannot be cleared either — the
-- trigger freezes it. 'superseded' was therefore unreachable from the moment it was
-- written down.
--
-- Nobody hit it because nothing had ever inserted a release. K6 is the manifest's
-- first writer, and a daily builder needs supersession: rerunning any day has to
-- retire the previous release rather than collide with it.
--
-- The pairing rule 081 meant to enforce, and that migration 026 enforces for content
-- packs, is that the state and its timestamp cannot disagree. A superseded release
-- WAS published — that is what makes it superseded rather than failed — so the
-- honest form of the rule is that published_at is set exactly when the release has
-- reached publication at all.
--
-- 'building' and 'failed' keep published_at NULL, which is what makes this stricter
-- than a bare NOT NULL check: a release that failed while building must not carry a
-- publication timestamp.

ALTER TABLE governance.release_manifest
  DROP CONSTRAINT IF EXISTS release_manifest_check;

ALTER TABLE governance.release_manifest
  ADD CONSTRAINT release_manifest_published_at_pairing
  CHECK ((release_state IN ('published', 'superseded')) = (published_at IS NOT NULL));
`;
