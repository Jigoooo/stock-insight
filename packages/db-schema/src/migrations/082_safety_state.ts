export const safetyStateMigrationSql = `
-- Product safety state — canonical/00 §8, REQ-SAFE-001/002/003.
--
--   NORMAL → CAUTION → INFORMATION_ONLY → HALTED
--
-- REQ-SAFE-001 is the reason this exists: a pipeline exiting 0 says nothing about
-- whether the product's meaning is healthy. This repository has the canonical
-- example already — the 2026-08-07 knowledge pipeline stall ended with a
-- successful job and a table that simply stopped growing, found by someone asking
-- "why is claim not increasing", not by an alert. Exit codes track processes.
-- This tracks whether what we are serving still means what it claims.
--
-- WHY A TRANSITION LEDGER RATHER THAN A CURRENT-STATE ROW. A single mutable row
-- answers "what is the state" and destroys "how did we get here". Safety state is
-- exactly the thing an incident review asks about backwards, and the reason for a
-- downgrade is more useful than the downgrade. The current state is the newest
-- transition, resolved by a view — the same shape the source contract ledger uses.
--
-- WHY A DOWNGRADE NEEDS A REASON AND A RECOVERY DOES NOT AUTO-APPLY. REQ-SAFE-002
-- lets semantic SLO, coverage, freshness and invariant failures lower the state.
-- If recovery were automatic, a flapping SLO would walk the product in and out of
-- INFORMATION_ONLY unattended, and the state would stop meaning anything. A
-- transition toward safety may be automatic; a transition back records who
-- decided the condition had cleared.
--
-- GRANTS: pipeline roles only. See migration 078.

CREATE TABLE IF NOT EXISTS governance.safety_state_transition (
    safety_state_transition_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Scope: 'global' is the product-wide state canonical/00 §8 defines. A named
    -- scope lets one surface degrade without halting everything, which is the
    -- difference between "source outage causes partial degradation" (golden
    -- fixture 16) and taking the product down.
    scope TEXT NOT NULL DEFAULT 'global' CHECK (length(btrim(scope)) > 0),

    from_state TEXT
      CHECK (from_state IS NULL
             OR from_state IN ('NORMAL','CAUTION','INFORMATION_ONLY','HALTED')),
    to_state TEXT NOT NULL
      CHECK (to_state IN ('NORMAL','CAUTION','INFORMATION_ONLY','HALTED')),

    -- What moved it. 'slo' / 'coverage' / 'freshness' / 'invariant' are the four
    -- REQ-SAFE-002 names; 'manual' and 'release' cover a human decision and a
    -- deployment.
    trigger_kind TEXT NOT NULL CHECK (trigger_kind IN (
      'slo','coverage','freshness','invariant','manual','release'
    )),

    -- A downgrade with no stated cause is indistinguishable from a mistake, and
    -- nobody can tell later whether the condition cleared.
    reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),

    -- What to look at: an slo_key, an invariant name, an incident id.
    evidence_ref TEXT,

    decided_by TEXT NOT NULL CHECK (length(btrim(decided_by)) > 0),
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The release in force when the state moved, where one applies.
    release_id TEXT REFERENCES governance.release_manifest(release_id),

    CHECK (from_state IS NULL OR from_state <> to_state)
);

CREATE INDEX IF NOT EXISTS safety_state_transition_scope_idx
  ON governance.safety_state_transition (scope, decided_at DESC, safety_state_transition_id DESC);

CREATE OR REPLACE FUNCTION governance.reject_safety_state_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.safety_state_transition is append-only (delete rejected for %)',
      OLD.safety_state_transition_id;
  END IF;
  RAISE EXCEPTION
    'governance.safety_state_transition is append-only; record a new transition instead (%)',
    OLD.safety_state_transition_id;
END;
$$;

DROP TRIGGER IF EXISTS safety_state_transition_append_only
  ON governance.safety_state_transition;
CREATE TRIGGER safety_state_transition_append_only
  BEFORE DELETE OR UPDATE ON governance.safety_state_transition
  FOR EACH ROW EXECUTE FUNCTION governance.reject_safety_state_mutation();

-- Severity order from contracts/safety-state.json, as a function so a caller can
-- ask "is this at least as restrictive as that" without duplicating the ranking.
CREATE OR REPLACE FUNCTION governance.safety_state_severity(state TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE state
    WHEN 'NORMAL' THEN 0
    WHEN 'CAUTION' THEN 1
    WHEN 'INFORMATION_ONLY' THEN 2
    WHEN 'HALTED' THEN 3
  END;
$fn$;

-- Current state per scope, plus whether recommendations may be issued.
--
-- contracts/safety-state.json marks CAUTION as "policy-dependent" rather than a
-- boolean. It stays NULL here instead of collapsing to true or false: a tri-state
-- forces the caller to consult the policy, where a default would silently pick a
-- side — and picking 'allowed' is how a degraded product keeps recommending
-- (REQ-SAFE-003).
CREATE OR REPLACE VIEW governance.safety_state_current_v1 AS
SELECT DISTINCT ON (transition.scope)
       transition.scope,
       transition.to_state AS safety_state,
       governance.safety_state_severity(transition.to_state) AS severity,
       CASE transition.to_state
         WHEN 'NORMAL' THEN true
         WHEN 'CAUTION' THEN NULL
         ELSE false
       END AS recommendation_allowed,
       transition.trigger_kind,
       transition.reason,
       transition.evidence_ref,
       transition.decided_by,
       transition.decided_at,
       transition.release_id
  FROM governance.safety_state_transition transition
 ORDER BY transition.scope, transition.decided_at DESC, transition.safety_state_transition_id DESC;

-- Seed: the product starts NORMAL and says so, rather than leaving the view empty.
-- An empty view would make "no state recorded" indistinguishable from NORMAL at
-- every call site, and the fail-closed reading of a missing state is HALTED —
-- which would take the product down on first deploy.
INSERT INTO governance.safety_state_transition
  (scope, from_state, to_state, trigger_kind, reason, decided_by)
SELECT 'global', NULL, 'NORMAL', 'manual',
       'Initial state recorded by migration 082. No degradation observed at introduction.',
       'migration-082'
 WHERE NOT EXISTS (
   SELECT 1 FROM governance.safety_state_transition WHERE scope = 'global'
 );

GRANT SELECT, INSERT ON governance.safety_state_transition
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON governance.safety_state_transition, governance.safety_state_current_v1
  TO si_readapi;
GRANT SELECT ON governance.safety_state_current_v1
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
`;
