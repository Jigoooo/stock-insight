export const wrapperFailureStreakSloMigrationSql = `
-- The gauge that would have caught the 2026-08-08 outage, which none of the eight
-- existing ones do.
--
-- WHY A NEW DEFINITION AND NOT A THRESHOLD CHANGE. ops.pipeline.expected_runs looked
-- like the right gauge and is not. Replaying it across the outage shows it clean on
-- every one of those days: 18, 18 and 12 wrapper attempts were made while analytics
-- failed six consecutive times and market-enrichment five. It counts whether the
-- scheduler fired, and the scheduler never stopped firing. Raising its threshold to
-- four would not change that — the attempts were there, they just failed.
--
-- What was missing is the streak. Migration 095 named it as a view; this makes it a
-- measured gauge so REQ-SAFE-002 has an input that corresponds to the failure the
-- as-built keeps recording.
--
-- WHY artifact_count. slo_kind is CHECKed against the five names canonical/08 §8
-- grounds, and a streak is none of them. Widening that CHECK to add a sixth would
-- claim the freeze names a measurement axis it does not. A count of wrappers
-- compared with at_most is the same shape ingestion.parser.drift already uses
-- (at_most 0 sources), so the row says what it means without moving the vocabulary.
--
-- WHY at_most 0 OVER A STREAK OF TWO. One failure is a transient — a lock, a
-- network blip, a source timing out. Two consecutive settled failures of the same
-- wrapper is a pattern. breach_consecutive_required stays at the column default of
-- 2, so two consecutive observations of that pattern are needed before anything
-- moves; a single noisy sample cannot walk the product's state.
--
-- Seeded report-only (breach_safety_state NULL) like the other eight. Promotion is a
-- separate, evidence-backed decision and this definition has not been observed yet.

INSERT INTO governance.slo_definition (
  slo_key, slo_kind, subject, description,
  comparison, threshold, unit, window_hours, breach_safety_state, created_by
)
SELECT 'ops.pipeline.wrapper_failure_streak', 'artifact_count',
       'governance.pipeline_wrapper_health_v1',
       'Wrappers whose two most recent settled attempts both failed. Between 2026-08-08 and 08-10 analytics failed six consecutive times and market-enrichment five; every failure was recorded correctly and nothing read it for two days. ops.pipeline.expected_runs stayed clean throughout because the scheduler kept firing — attempts are not outcomes, and this is the difference.',
       'at_most', 0, 'wrappers', 24, NULL, 'migration-096'
 WHERE NOT EXISTS (
   SELECT 1 FROM governance.slo_definition
    WHERE slo_key = 'ops.pipeline.wrapper_failure_streak'
 );
`;
