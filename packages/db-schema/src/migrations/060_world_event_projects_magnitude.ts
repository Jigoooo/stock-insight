export const worldEventProjectsMagnitudeMigrationSql = `
-- Projects the fields the world-event serving view already reads and throws away.
--
-- serving.v_world_event_current_v1 resolves the current revision in a LATERAL
-- that selects magnitude, magnitude_unit, surprise_score, story_id,
-- source_revision_id and published_at — and then the outer SELECT keeps ten
-- columns and drops all of those. A consumer can see that an event exists and
-- what it says, but not how big it was or when it was published, which is most of
-- what makes an event judgeable.
--
-- What gets projected is decided by measured fill rate, not by what the LATERAL
-- happens to select (measured 2026-08-03 over 4,003 revisions):
--
--   magnitude           2,181  54.5%   projected
--   magnitude_unit        268   6.7%   projected — a magnitude whose unit is
--                                      unknown must not read as a bare number
--   published_at        4,003  100%    projected
--   story_id            4,003  100%    projected
--   surprise_score          0     0%   NOT projected
--   source_revision_id      0     0%   NOT projected
--
-- The last two are left out on purpose. Adding a column that is NULL on every row
-- creates exactly the placeholder this codebase has been removing elsewhere: it
-- looks like a supported field, reads as "no data for this event" rather than
-- "nothing ever writes this", and the next reader has to rediscover which it is.
-- When a producer fills them, projecting them is a one-line follow-up.

-- Column order is not a style choice here: CREATE OR REPLACE VIEW may only append
-- columns, so the original ten keep their exact positions and the new ones follow.
CREATE OR REPLACE VIEW serving.v_world_event_current_v1 AS
SELECT world_event.event_id,
       world_event.event_key,
       world_event.event_type,
       revision.event_revision_id,
       revision.revision_no,
       revision.lifecycle_state,
       revision.summary_text,
       revision.available_at,
       revision.known_at,
       revision.valid_from,
       revision.magnitude,
       revision.magnitude_unit,
       revision.story_id,
       revision.published_at
FROM world.event world_event
JOIN LATERAL (
  SELECT r.event_revision_id,
         r.revision_no,
         r.lifecycle_state,
         r.summary_text,
         r.magnitude,
         r.magnitude_unit,
         r.story_id,
         r.published_at,
         r.available_at,
         r.known_at,
         r.valid_from
  FROM world.event_revision r
  WHERE r.event_id = world_event.event_id
  ORDER BY r.revision_no DESC
  LIMIT 1
) revision ON true;

COMMENT ON VIEW serving.v_world_event_current_v1 IS
  'Current revision per world event. magnitude is NULL on roughly half the plane '
  'and magnitude_unit on most of it, so a reader must treat a bare magnitude as '
  'unitless rather than assume a default. surprise_score and source_revision_id '
  'are deliberately not projected: no producer writes them.';
`;
