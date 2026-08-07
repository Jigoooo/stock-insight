export const analysisInformationSetMigrationSql = `
-- Analysis information set: what a derivation was allowed to see.
--
-- v2-final canonical/02 §1. Every report, forecast, recommendation and backtest
-- carries an analysis_information_set_id, and the row is the machine-checkable
-- form of "what could we legitimately have known when this was computed".
--
-- WHY FOUR CUTOFFS AND NOT ONE. canonical/00 §5 keeps the time axes apart —
-- valid/event, published, available, known. Collapsing them loses the ability to
-- state "this was true then, but we could not have known it", which is precisely
-- the sentence a leak-free backtest depends on. market_observation_cutoff is
-- separate again because market reaction is the one input an ex-ante run must be
-- blind to (REQ-KERN-001).
--
-- WHY NO DEFAULTS ON THE CUTOFFS. REQ-PIT-003 forbids using now() as a business
-- cutoff. A column default is exactly how now() becomes a cutoff without anyone
-- deciding to — the writer omits the field and the database invents an answer.
-- NOT NULL with no default makes the caller state the boundary.
--
-- The CHECK constraints below mirror packages/contracts/src/analysis-information-set.ts
-- one for one. Both layers enforce them because they fail at different times: the
-- contract rejects a bad request before work starts, the constraint rejects a bad
-- row however it was produced — including by SQL that never went through the
-- contract. A leak that only the application can catch is a leak.
--
-- GRANTS: pipeline roles only. See migration 078's note on why the app roles get
-- nothing here and why that means no boot-digest re-pin.

-- PostgreSQL forbids a subquery inside a CHECK expression, and there is no
-- subquery-free way to ask whether a text[] holds duplicates. An IMMUTABLE
-- function may contain one and may be called from a CHECK, so the test lives
-- here. Found by the rehearsal in apps/api/scripts/run-kernel-db-rehearsal.mjs:
-- the inline ARRAY(SELECT DISTINCT unnest(...)) form parses as valid SQL text and
-- only fails when a real database tries to create the table.
-- Parameter is named candidate_values, not values: VALUES is a reserved word and
-- a SQL-language function body cannot reference it as an identifier.
CREATE OR REPLACE FUNCTION governance.text_array_has_duplicates(candidate_values TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN candidate_values IS NULL THEN false
    ELSE cardinality(candidate_values)
           <> (SELECT count(DISTINCT item) FROM unnest(candidate_values) AS item)
  END;
$fn$;

CREATE TABLE IF NOT EXISTS governance.analysis_information_set (
    information_set_id TEXT PRIMARY KEY
      CHECK (information_set_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),

    mode TEXT NOT NULL CHECK (mode IN ('EX_ANTE','LIVE','EX_POST','RETROSPECTIVE')),

    valid_cutoff              TIMESTAMPTZ NOT NULL,
    source_available_cutoff   TIMESTAMPTZ NOT NULL,
    system_known_cutoff       TIMESTAMPTZ NOT NULL,
    market_observation_cutoff TIMESTAMPTZ NOT NULL,
    outcome_embargo_until     TIMESTAMPTZ,

    market_calendar TEXT,
    timezone        TEXT NOT NULL DEFAULT 'UTC' CHECK (length(btrim(timezone)) > 0),

    semantic_snapshot_id TEXT NOT NULL
      REFERENCES governance.semantic_snapshot(semantic_snapshot_id),

    -- Frozen schema types this as plain strings, so the column does not narrow to
    -- the 14 truth classes. Narrowing past the freeze is the drift the freeze
    -- exists to prevent; the contract layer offers the stricter check to callers
    -- that want it.
    allowed_information_classes TEXT[] NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),

    -- REQ-KERN-001 / REQ-PIT-001. An ex-ante or live set that admits market
    -- observation from after its decision point would let the analysis "predict"
    -- a move it was shown.
    CONSTRAINT analysis_information_set_no_market_leak CHECK (
      mode NOT IN ('EX_ANTE','LIVE') OR market_observation_cutoff <= valid_cutoff
    ),

    -- The system cannot have known something before it was reachable.
    CONSTRAINT analysis_information_set_collection_order CHECK (
      system_known_cutoff >= source_available_cutoff
    ),

    -- REQ-PIT-001. EX_POST and RETROSPECTIVE may read later knowledge; that is
    -- what they are for.
    CONSTRAINT analysis_information_set_no_hindsight CHECK (
      mode <> 'EX_ANTE' OR system_known_cutoff <= valid_cutoff
    ),

    -- REQ-KERN-002. An embargo already lifted at the decision point embargoes
    -- nothing — it silently admits the outcome it exists to hide.
    CONSTRAINT analysis_information_set_embargo_effective CHECK (
      outcome_embargo_until IS NULL
      OR mode <> 'EX_ANTE'
      OR outcome_embargo_until >= valid_cutoff
    ),

    CONSTRAINT analysis_information_set_classes_unique CHECK (
      NOT governance.text_array_has_duplicates(allowed_information_classes)
    )
);

CREATE INDEX IF NOT EXISTS analysis_information_set_snapshot_idx
  ON governance.analysis_information_set (semantic_snapshot_id, valid_cutoff DESC);

CREATE INDEX IF NOT EXISTS analysis_information_set_mode_idx
  ON governance.analysis_information_set (mode, valid_cutoff DESC);

-- Fully append-only, with no state machine exception. An information set has no
-- lifecycle: it describes the boundary a past computation ran under, and a
-- boundary that can be edited is not a boundary. REQ-KERN-002 says retrospective
-- results do not overwrite past records; this is that rule at the row level.
CREATE OR REPLACE FUNCTION governance.reject_analysis_information_set_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.analysis_information_set is append-only (delete rejected for %)',
      OLD.information_set_id;
  END IF;
  RAISE EXCEPTION 'governance.analysis_information_set is append-only (update rejected for %)',
    OLD.information_set_id;
END;
$$;

DROP TRIGGER IF EXISTS analysis_information_set_append_only
  ON governance.analysis_information_set;
CREATE TRIGGER analysis_information_set_append_only
  BEFORE DELETE OR UPDATE ON governance.analysis_information_set
  FOR EACH ROW EXECUTE FUNCTION governance.reject_analysis_information_set_mutation();

GRANT SELECT, INSERT ON governance.analysis_information_set
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON governance.analysis_information_set TO si_readapi;
`;
