export const sloBreachSafetyStateMigrationSql = `
-- Promotion. Migration 083 seeded every SLO report-only and said why: "a threshold
-- that has never been observed cannot be trusted to move the product's state, and
-- turning them on before they have a baseline is how a gauge becomes noise.
-- Promotion to a real downgrade is a later, evidence-backed decision."
--
-- This is that decision. The baseline did not need waiting for: every window looks
-- backward, so run-slo-observation.ts replayed 2026-07-20..08-11 day by day and the
-- table below is what it measured. Two gauges were disproved by it and are NOT
-- promoted.
--
-- WHY CAUTION AND NOTHING WORSE. contracts/safety-state.json makes
-- recommendation_allowed false for INFORMATION_ONLY and HALTED. Nothing reads safety
-- state yet — the consumer arrives with REQ-SAFE-003 in K8 — so the blast radius is
-- zero today and the honest move is to record state, not to pre-arm a stop nobody
-- has calibrated. Raising an individual gauge later is a separate decision with
-- observations behind it.
--
-- PROMOTED, with what the replay showed:
--   ops.pipeline.wrapper_failure_streak   caught the 08-09/08-10 outage with both
--                                         wrappers named. Also breached 13 of 23
--                                         days — all corroborated as real: the
--                                         07-21..23 collection gap shows zero rows
--                                         in source_revision and claim on exactly
--                                         those days. The pipeline was genuinely
--                                         broken that often.
--   ingestion.source_revision.growth      breached exactly the 3-day gap and went
--                                         clean the day collection resumed.
--   knowledge.claim.growth                same three days, same recovery.
--   knowledge.relation_evidence.growth    clean across 23 days; a week with zero
--                                         evidence rows is unambiguous.
--   serving.content_pack.servable         measured live (659). Zero servable packs
--                                         is unambiguous.
--   serving.content_pack.freshness        measured live (1.93h against a 48h ceiling).
--
-- NOT PROMOTED, and why:
--   ops.pipeline.expected_runs      Replay shows it clean on every day of the
--                                   outage. 18, 18 and 12 wrapper attempts were
--                                   made while two wrappers failed repeatedly — it
--                                   counts whether the scheduler fired, not whether
--                                   anything succeeded. Raising its threshold would
--                                   not fix that; 096 measures the streak instead.
--   governance.coverage_ledger.delta  Zero observations in 23 replayed days. Its
--                                   window never contains a revision with both a
--                                   predecessor and a positive expected count, so
--                                   there is nothing to promote on.
--   ingestion.parser.drift          No measurement exists yet.
--
-- breach_consecutive_required stays at 2 for the growth and level gauges. The streak
-- gauge goes to 6: it is observed hourly, and a wrapper that fails twice inside one
-- retry cycle and then succeeds should not move the product's state, while six
-- sustained hours is not a transient.

UPDATE governance.slo_definition
   SET breach_safety_state = 'CAUTION'
 WHERE slo_key IN (
   'ops.pipeline.wrapper_failure_streak',
   'ingestion.source_revision.growth',
   'knowledge.claim.growth',
   'knowledge.relation_evidence.growth',
   'serving.content_pack.servable',
   'serving.content_pack.freshness'
 )
   AND breach_safety_state IS NULL;

UPDATE governance.slo_definition
   SET breach_consecutive_required = 6
 WHERE slo_key = 'ops.pipeline.wrapper_failure_streak';
`;
