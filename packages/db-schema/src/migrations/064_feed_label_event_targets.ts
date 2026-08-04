export const feedLabelEventTargetsMigrationSql = `
-- Take collection-feed labels out of the event target column.
--
-- Measured 2026-08-04: 1,478 rows in knowledge.event point at entities whose
-- legacy type is 'macro' — us_insider_buys, us_corporate_events, gl_major_event,
-- crypto_regulation. Those are the names of collection feeds, not things a
-- headline is about. "SEC 8-K JOHNSON & JOHNSON" was attributed to
-- us_corporate_events; all 258 gl_major_event rows are SpaceX stories.
--
-- run-event-entity-resolution.ts followed the legacy chain faithfully
-- (event.metadata.legacy_signal_id -> market_signals -> entities -> core.entity)
-- and the chain ends at the macro row. The signal carries nothing better:
-- raw_json is empty, so there is no ticker in the payload either. The defect was
-- accepting a feed label as an answer, and that pass now declines it.
--
-- This migration clears what the pass already wrote. Two things follow:
--
--   1. run-event-text-attribution.ts sees these rows on every run, so they
--      self-heal the day their company enters the universe. While the target
--      held a feed label they were invisible to it.
--   2. The "attributed" count stops counting feed labels as companies. It drops
--      from 3,099 to about 1,621 — that is a correction, not a regression. The
--      old number asserted that 1,478 events had reached a company, and they
--      had not.
--
-- The previous value goes into the same metadata field the text attribution pass
-- uses, so there is exactly one way to reverse a target move rather than two.

UPDATE knowledge.event AS event
SET target_entity_id = NULL,
    metadata = event.metadata || jsonb_build_object(
      'feed_label', legacy_entity.entity_key,
      'entity_resolution',
        coalesce(event.metadata->'entity_resolution', '{}'::jsonb)
        || jsonb_build_object(
             'previous_target_entity_id', event.target_entity_id,
             'declined_reason', 'feed_label_target',
             'declined_by', 'migration-064',
             'declined_at', to_char(clock_timestamp() AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS"Z"')
           )
    )
-- core.entity is a bare FROM item, not a JOIN. In UPDATE ... FROM, a JOIN's ON
-- clause may not reference the table being updated, so the correlation to
-- event.target_entity_id has to live in WHERE.
FROM public.market_signals signal
JOIN public.entities legacy_entity ON legacy_entity.id = signal.entity_id,
     core.entity target
WHERE signal.id = (event.metadata->>'legacy_signal_id')::bigint
  AND target.entity_id = event.target_entity_id
  AND legacy_entity.entity_type = 'macro'
  -- Clear only rows still sitting on the feed label. Without this join the
  -- filter is "came from a macro signal", which is 1,491 rows — 13 more than the
  -- 1,478 that hold a label, because run-event-text-attribution.ts already moved
  -- those 13 onto real companies (Uber, Delta, HCA, J&J). Matching on the legacy
  -- origin instead of the current value would undo correct work.
  AND target.entity_type = 'Metric';
`;
