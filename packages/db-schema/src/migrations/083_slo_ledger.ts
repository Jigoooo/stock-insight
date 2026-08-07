export const sloLedgerMigrationSql = `
-- Semantic SLO ledger — canonical/08 §8, canonical/09 §5, REQ-SAFE-002.
--
-- Migration 082 lets a semantic SLO breach lower the safety state. Without a
-- ledger of what the SLOs are and what they measured, that clause has no input
-- and safety state is decoration. The two ship together for that reason.
--
-- WHY governance.slo_* AND NOT ops.slo_* — DELIBERATE DEVIATION FROM THE FREEZE.
-- canonical/09 §5 and e2e-layers X4 both name ops.slo_*. The ops schema is split
-- table by table with research-app-db (operations/database-ownership.md lists
-- seventeen tables that belong to that project, including ops.analysis_run_contract
-- whose name would have made it a tempting host for the information set). Putting
-- new tables there means either a name collision or a cross-project write, both of
-- which verify-table-ownership.sh exists to prevent. governance is ours alone.
-- REQ-ARCH-010 fixes the twelve families as a logical classification and does not
-- prescribe schema names, so ownership wins over naming here.
--
-- WHAT AN SLO IS FOR HERE. Not uptime. canonical/09 §5 treats silent failure as a
-- first-class risk, and the eight measured instances in this system are all of the
-- same shape: a job succeeds and something stops meaning what it claims. Expected
-- artifact growth, coverage delta, freshness, parser drift — these are the gauges
-- that would have caught them. The 2026-08-07 knowledge stall was found by a
-- person asking why a count was flat.
--
-- GRANTS: pipeline roles only. See migration 078.

CREATE TABLE IF NOT EXISTS governance.slo_definition (
    slo_key TEXT PRIMARY KEY
      CHECK (slo_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),

    -- The five gauge kinds canonical/08 §8 and 09 §5 name between them.
    slo_kind TEXT NOT NULL CHECK (slo_kind IN (
      'artifact_count',     -- expected rows/artifacts actually appeared
      'coverage_delta',     -- semantic coverage did not silently shrink
      'freshness',          -- the newest artifact is not stale
      'parser_drift',       -- a source's shape has not changed under us
      'information_gain'    -- new material is arriving, not just re-runs
    )),

    subject TEXT NOT NULL CHECK (length(btrim(subject)) > 0),
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),

    -- Comparison is explicit rather than implied by kind: an artifact count is a
    -- floor, staleness is a ceiling, and guessing which from the kind is how a
    -- gauge ends up asserting the opposite of what it means.
    comparison TEXT NOT NULL CHECK (comparison IN ('at_least','at_most')),
    threshold NUMERIC NOT NULL,
    unit TEXT NOT NULL CHECK (length(btrim(unit)) > 0),
    window_hours INTEGER NOT NULL CHECK (window_hours > 0),

    -- REQ-SAFE-002: the state a sustained breach forces. NULL means "report only,
    -- never move safety state" — a gauge, in the same sense the reachability audit
    -- is a gauge rather than a failure.
    breach_safety_state TEXT
      CHECK (breach_safety_state IS NULL
             OR breach_safety_state IN ('CAUTION','INFORMATION_ONLY','HALTED')),

    -- How many consecutive breaching observations before the state moves. One
    -- noisy sample should not walk the product into INFORMATION_ONLY; see
    -- migration 082 on why flapping would make the state meaningless.
    breach_consecutive_required INTEGER NOT NULL DEFAULT 2
      CHECK (breach_consecutive_required >= 1),

    definition_state TEXT NOT NULL DEFAULT 'active'
      CHECK (definition_state IN ('active','retired')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),

    -- A definition that can move safety state but never repeats is a definition
    -- that fires on a single sample; the guard above would be inert.
    CHECK (breach_safety_state IS NULL OR breach_consecutive_required >= 1)
);

CREATE INDEX IF NOT EXISTS slo_definition_kind_idx
  ON governance.slo_definition (slo_kind, definition_state);

CREATE TABLE IF NOT EXISTS governance.slo_observation (
    slo_observation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slo_key TEXT NOT NULL REFERENCES governance.slo_definition(slo_key),

    observed_value NUMERIC NOT NULL,
    threshold_at_observation NUMERIC NOT NULL,
    comparison_at_observation TEXT NOT NULL CHECK (comparison_at_observation IN ('at_least','at_most')),

    -- Stored rather than derived on read. A threshold can be revised, and a past
    -- observation must keep the verdict it was judged under — recomputing it
    -- against today's threshold would rewrite history, which is the same rule
    -- REQ-KERN-002 applies to retrospective results.
    breached BOOLEAN NOT NULL,

    window_start TIMESTAMPTZ NOT NULL,
    window_end   TIMESTAMPTZ NOT NULL,
    observed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    observed_by  TEXT NOT NULL CHECK (length(btrim(observed_by)) > 0),
    detail JSONB NOT NULL DEFAULT '{}',

    CHECK (window_end > window_start),

    -- The verdict must follow from the numbers recorded beside it. Without this a
    -- writer can store "not breached" next to a value that plainly breaches, and
    -- the ledger stops being evidence.
    CONSTRAINT slo_observation_verdict_matches CHECK (
      breached = CASE comparison_at_observation
        WHEN 'at_least' THEN observed_value < threshold_at_observation
        ELSE observed_value > threshold_at_observation
      END
    )
);

CREATE INDEX IF NOT EXISTS slo_observation_key_idx
  ON governance.slo_observation (slo_key, observed_at DESC);

CREATE INDEX IF NOT EXISTS slo_observation_breach_idx
  ON governance.slo_observation (slo_key, observed_at DESC) WHERE breached;

CREATE OR REPLACE FUNCTION governance.reject_slo_observation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance.slo_observation is append-only (delete rejected for %)',
      OLD.slo_observation_id;
  END IF;
  RAISE EXCEPTION 'governance.slo_observation is append-only (update rejected for %)',
    OLD.slo_observation_id;
END;
$$;

DROP TRIGGER IF EXISTS slo_observation_append_only ON governance.slo_observation;
CREATE TRIGGER slo_observation_append_only
  BEFORE DELETE OR UPDATE ON governance.slo_observation
  FOR EACH ROW EXECUTE FUNCTION governance.reject_slo_observation_mutation();

-- Latest observation per SLO, with the consecutive breach run beside it. The run
-- length is what migration 082's downgrade rule consumes: a definition fires only
-- once its breach_consecutive_required is met.
CREATE OR REPLACE VIEW governance.slo_current_v1 AS
WITH ordered AS (
  SELECT observation.*,
         row_number() OVER (PARTITION BY observation.slo_key
                            ORDER BY observation.observed_at DESC,
                                     observation.slo_observation_id DESC) AS recency,
         -- Rows since the most recent non-breaching observation.
         sum(CASE WHEN observation.breached THEN 0 ELSE 1 END)
           OVER (PARTITION BY observation.slo_key
                 ORDER BY observation.observed_at DESC,
                          observation.slo_observation_id DESC
                 ROWS UNBOUNDED PRECEDING) AS clean_seen
    FROM governance.slo_observation observation
)
SELECT definition.slo_key,
       definition.slo_kind,
       definition.subject,
       definition.definition_state,
       definition.breach_safety_state,
       definition.breach_consecutive_required,
       latest.observed_value,
       latest.breached,
       latest.observed_at,
       COALESCE((
         SELECT count(*)
           FROM ordered run
          WHERE run.slo_key = definition.slo_key
            AND run.breached
            AND run.clean_seen = 0
       ), 0) AS consecutive_breaches
  FROM governance.slo_definition definition
  LEFT JOIN ordered latest
    ON latest.slo_key = definition.slo_key AND latest.recency = 1;

-- ── seed definitions ───────────────────────────────────────────────────────────
-- Grounded in the eight silent failures measured in the 2026-08-07 as-built, not
-- invented. Each names the failure it would have caught. Every one starts as a
-- report-only gauge (breach_safety_state NULL): a threshold that has never been
-- observed cannot be trusted to move the product's state, and turning them on
-- before they have a baseline is how a gauge becomes noise. Promotion to a real
-- downgrade is a later, evidence-backed decision.

INSERT INTO governance.slo_definition
  (slo_key, slo_kind, subject, description, comparison, threshold, unit, window_hours,
   breach_safety_state, created_by)
SELECT * FROM (VALUES
  ('knowledge.claim.growth', 'artifact_count', 'knowledge.claim',
   'Claim rows must keep appearing. The 2026-08-07 stall ended with a successful job and a table frozen at id 348; nothing failed and a person found it by asking why the count was flat.',
   'at_least', 1, 'rows', 24, NULL, 'migration-083'),
  ('serving.content_pack.servable', 'artifact_count', 'serving.content_pack',
   'Servable packs must exist. servable is computed at read time from published + sealed + fresh_until, so all three can lapse without any write failing.',
   'at_least', 1, 'packs', 24, NULL, 'migration-083'),
  ('serving.content_pack.freshness', 'freshness', 'serving.content_pack',
   'Age of the newest servable pack. A stale-but-present pack reads as healthy to every count-based check.',
   'at_most', 48, 'hours', 24, NULL, 'migration-083'),
  ('governance.coverage_ledger.delta', 'coverage_delta', 'governance.coverage_ledger',
   'Coverage must not silently shrink. REQ-SRC-001 separates absent from not-collected, and a coverage drop is how that distinction quietly disappears.',
   'at_least', 0, 'ratio_delta', 24, NULL, 'migration-083'),
  ('ingestion.source_revision.growth', 'artifact_count', 'ingestion.source_revision',
   'New source revisions must arrive. A collector that fetches and parses to nothing still exits 0.',
   'at_least', 1, 'rows', 24, NULL, 'migration-083'),
  ('ingestion.parser.drift', 'parser_drift', 'ingestion.source',
   'Sources whose parsed shape changed since the last run. Schema drift under a working fetch is the failure a success code cannot show.',
   'at_most', 0, 'sources', 24, NULL, 'migration-083'),
  ('ops.pipeline.expected_runs', 'artifact_count', 'public.migration_runs',
   'Wrapper attempts observed versus scheduled. Lock contention exits 75 before pipeline_start_wrapper_attempt writes a row, so a skipped run leaves neither a success nor a failure — the quietest failure in the system (as-built §11 ①). Counting expected against observed is the only way it becomes visible.',
   'at_least', 1, 'runs', 24, NULL, 'migration-083'),
  ('knowledge.relation_evidence.growth', 'information_gain', 'knowledge.relation_evidence_ledger',
   'Evidence must keep accruing, not just be re-derived. A re-run that adds no independent root is not new information.',
   'at_least', 1, 'rows', 168, NULL, 'migration-083')
) AS seed(slo_key, slo_kind, subject, description, comparison, threshold, unit, window_hours,
          breach_safety_state, created_by)
 WHERE NOT EXISTS (
   SELECT 1 FROM governance.slo_definition existing WHERE existing.slo_key = seed.slo_key
 );

GRANT SELECT, INSERT ON governance.slo_definition, governance.slo_observation
  TO si_knowledge, si_analytics, si_publisher;
GRANT UPDATE (definition_state, threshold, breach_safety_state, breach_consecutive_required)
  ON governance.slo_definition TO si_analytics, si_publisher;
GRANT SELECT ON governance.slo_definition, governance.slo_observation,
  governance.slo_current_v1 TO si_readapi;
GRANT SELECT ON governance.slo_current_v1
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance
  TO si_knowledge, si_analytics, si_publisher;
`;
