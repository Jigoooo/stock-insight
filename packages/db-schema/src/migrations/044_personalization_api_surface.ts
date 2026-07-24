export const personalizationApiSurfaceMigrationSql = String.raw`
ALTER TABLE personalization.thesis_revision
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'system_generated';

ALTER TABLE personalization.decision_packet
  ADD COLUMN IF NOT EXISTS runtime_packet JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'personalization.thesis_revision'::regclass
      AND conname = 'ck_thesis_revision_source_kind'
  ) THEN
    ALTER TABLE personalization.thesis_revision
      ADD CONSTRAINT ck_thesis_revision_source_kind
      CHECK (source_kind IN ('user_authored', 'system_generated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'personalization.decision_packet'::regclass
      AND conname = 'ck_decision_packet_runtime_packet_object'
  ) THEN
    ALTER TABLE personalization.decision_packet
      ADD CONSTRAINT ck_decision_packet_runtime_packet_object
      CHECK (jsonb_typeof(runtime_packet) = 'object');
  END IF;
END
$migration$;
`;
