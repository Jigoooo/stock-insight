export const commonAssetViewMigrationSql = `
-- K6 — serving.common_asset_view. The deterministic packet canonical/06 §2 requires:
-- twelve blocks about one asset, carrying no private user data.
--
-- WHAT THIS STAGE ACTUALLY DELIVERS. Four of the twelve blocks have no content to
-- carry yet, measured 2026-08-10 against live data. So the deliverable here is the
-- packet contract and the honest-state machinery, NOT twelve populated blocks.
-- Anyone reading "K6 complete" later should read it as "the shape is fixed and the
-- gaps are named", because that is what it is.
--
-- WHY BLOCKS ARE ROWS, NOT ONE JSONB PACKET. Same reasoning migration 081 wrote
-- down for release components: the questions asked of blocks are relational —
-- "which blocks are underived across the universe", "which entities have block 3",
-- "did any block regress since yesterday". Answering those against a single JSONB
-- document means a lateral unnest in every query. The block payload stays JSONB
-- because its interior shape is per-block and no constraint could police it; the
-- wire packet is rebuilt on read.
--
-- WHY block_state IS NOT REQ-PROD-021'S VOCABULARY. REQ-PROD-021 defines
-- NOT_COMPARABLE / INSUFFICIENT_COVERAGE for one narrow question: whether a KPI can
-- be ranked against peers. A block that has no producer is a different fact about a
-- different subject, and borrowing that vocabulary would make INSUFFICIENT_COVERAGE
-- mean two things — which is to say, nothing. The states below are deliberately
-- disjoint from it, and each one names a different fix:
--
--   available          derived, with content
--   partial            derived, but under the block's own coverage bar
--   unverified_only    a source exists and nothing in it passed verification.
--                      Fix: build the verification path. (block 10 — all 271
--                      knowledge.assertion rows sit at verification_state
--                      'extracted', covering 62 of 297 entities)
--   not_produced       a producer exists and has emitted nothing.
--                      Fix: run or repair the producer. (block 7 —
--                      analytics.valuation_estimate_revision is 0 rows and
--                      k4-market-intelligence-writer.ts is its writer)
--   no_eligible_source no source this contract is allowed to read.
--                      Fix: build a compliant producer. (block 9 —
--                      analytics.scenario_set/_branch are empty and the only
--                      populated thesis table is personalization.thesis_revision,
--                      which REQ-REC-001 forbids. This is NOT the same as
--                      not_produced: running a producer harder cannot fix it.)
--
-- The distinction is load-bearing. Collapsing these into one "no data" marker would
-- make the four empty blocks look like one problem with one fix; they are four
-- problems with four different owners.
--
-- REQ-REC-001. No column here references personalization. The gate is not the
-- absence of the word — a builder could read personalization through a view — so
-- common-asset-view.test.ts perturbs a portfolio snapshot and asserts the packet
-- digest does not move. That is the anti-shortcut check canonical/10 §2 asks for.
--
-- GRANTS: pipeline roles only, deliberately. Migration 081 left the release
-- manifest ungranted with the note that "K6/K7 grant and re-pin together when a
-- read path actually consumes the release pointer". K6 is shadow — no product
-- surface reads this table, so there is no read path and therefore NO grant to
-- stock_insight_app_reader and NO EXPECTED_CATALOG_DIGESTS change. Granting it now
-- "to finish the job" moves the catalog digest and crashloops the brain on boot,
-- which is precisely what migration 059 did on 2026-08-03. The grant belongs to K7,
-- in the same commit as the digest re-pin.

CREATE TABLE IF NOT EXISTS serving.common_asset_view (
    common_asset_view_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Stable identity across revisions: one asset as observed on one date.
    view_key TEXT NOT NULL
      CHECK (view_key ~ '^[0-9]+@[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    revision_no INTEGER NOT NULL CHECK (revision_no > 0),

    subject_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    as_of_date DATE NOT NULL,

    -- REQ-REL-001: the packet names the release it belongs to, so a surface mixing
    -- it with an impact or theme panel can check they agree instead of each
    -- resolving its own latest.
    release_id TEXT NOT NULL REFERENCES governance.release_manifest(release_id),
    semantic_snapshot_id TEXT NOT NULL
      REFERENCES governance.semantic_snapshot(semantic_snapshot_id),

    -- Twelve, always. A packet with eleven blocks is not a smaller packet, it is a
    -- packet whose reader cannot tell which block is missing from which is empty.
    block_count INTEGER NOT NULL DEFAULT 12 CHECK (block_count = 12),

    packet_digest TEXT NOT NULL CHECK (packet_digest ~ '^[0-9a-f]{64}$'),

    supersedes_common_asset_view_id BIGINT
      REFERENCES serving.common_asset_view(common_asset_view_id),

    built_by TEXT NOT NULL CHECK (length(btrim(built_by)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (view_key, revision_no),
    CHECK (supersedes_common_asset_view_id IS NULL
           OR supersedes_common_asset_view_id <> common_asset_view_id)
);

CREATE INDEX IF NOT EXISTS common_asset_view_entity_idx
  ON serving.common_asset_view (subject_entity_id, as_of_date DESC, revision_no DESC);

CREATE INDEX IF NOT EXISTS common_asset_view_release_idx
  ON serving.common_asset_view (release_id, as_of_date DESC);

CREATE TABLE IF NOT EXISTS serving.common_asset_view_block (
    common_asset_view_block_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    common_asset_view_id BIGINT NOT NULL
      REFERENCES serving.common_asset_view(common_asset_view_id),

    -- Ordinal and key both, because the ordinal is canonical/06 §2's list order and
    -- the key is what code reads. Storing only one makes the other a lookup table
    -- living in a comment.
    block_no INTEGER NOT NULL CHECK (block_no BETWEEN 1 AND 12),
    block_key TEXT NOT NULL CHECK (block_key IN (
      'identity_economic_claim',
      'business_sector_context',
      'comparable_financial_facts',
      'recent_events_surprise',
      'expectation_priced_in',
      'exposure_impact',
      'valuation_market_implied',
      'market_reaction_tradability',
      'multi_horizon_thesis',
      'catalysts_risks_counter_evidence',
      'coverage_freshness_uncertainty',
      'derivation_release_manifest'
    )),

    block_state TEXT NOT NULL CHECK (block_state IN (
      'available', 'partial', 'unverified_only', 'not_produced', 'no_eligible_source'
    )),

    -- Why this state, in the builder's own words. A state without a reason forces
    -- the next reader to re-derive the census this migration header records.
    state_reason TEXT NOT NULL CHECK (length(btrim(state_reason)) > 0),

    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),

    -- How many underlying records the payload stands on. Zero with state
    -- 'available' is a contradiction the CHECK below refuses.
    evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (common_asset_view_id, block_no),
    UNIQUE (common_asset_view_id, block_key),

    -- An empty block cannot claim to be available, and a block with content cannot
    -- claim it has no source. Both directions have to hold or the state column is
    -- decoration.
    CHECK (block_state <> 'available' OR evidence_count > 0),
    CHECK (block_state NOT IN ('not_produced', 'no_eligible_source') OR evidence_count = 0)
);

CREATE INDEX IF NOT EXISTS common_asset_view_block_state_idx
  ON serving.common_asset_view_block (block_key, block_state);

-- Append-only. A packet is a claim about what was derivable at one moment under one
-- release; editing it in place would rewrite that claim after the fact. Corrections
-- arrive as a new revision pointing back through supersedes_.
CREATE OR REPLACE FUNCTION serving.reject_common_asset_view_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'serving.common_asset_view is append-only (% rejected for %)',
    TG_OP, COALESCE(OLD.view_key, NEW.view_key);
END;
$$;

DROP TRIGGER IF EXISTS common_asset_view_append_only ON serving.common_asset_view;
CREATE TRIGGER common_asset_view_append_only
  BEFORE DELETE OR UPDATE ON serving.common_asset_view
  FOR EACH ROW EXECUTE FUNCTION serving.reject_common_asset_view_mutation();

CREATE OR REPLACE FUNCTION serving.reject_common_asset_view_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'serving.common_asset_view_block is append-only (% rejected)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS common_asset_view_block_append_only ON serving.common_asset_view_block;
CREATE TRIGGER common_asset_view_block_append_only
  BEFORE DELETE OR UPDATE ON serving.common_asset_view_block
  FOR EACH ROW EXECUTE FUNCTION serving.reject_common_asset_view_block_mutation();

-- The current packet per asset. DISTINCT ON over (entity, date) rather than a
-- max(revision_no) subquery so a superseded revision can never tie its way back in.
CREATE OR REPLACE VIEW serving.common_asset_view_current_v1 AS
SELECT DISTINCT ON (view.subject_entity_id, view.as_of_date)
       view.common_asset_view_id,
       view.view_key,
       view.revision_no,
       view.subject_entity_id,
       view.as_of_date,
       view.release_id,
       view.semantic_snapshot_id,
       view.packet_digest,
       view.created_at
  FROM serving.common_asset_view view
 ORDER BY view.subject_entity_id, view.as_of_date DESC, view.revision_no DESC;

-- Which blocks are underived, and why, across the whole universe. This is the
-- gauge that tells K7 what it inherited: a block stuck at no_eligible_source needs
-- a new producer, one at not_produced needs an existing one repaired.
CREATE OR REPLACE VIEW serving.common_asset_view_block_coverage_v1 AS
SELECT block.block_no,
       block.block_key,
       block.block_state,
       count(*) AS asset_count,
       max(view.as_of_date) AS latest_as_of_date
  FROM serving.common_asset_view_block block
  JOIN serving.common_asset_view_current_v1 view
    ON view.common_asset_view_id = block.common_asset_view_id
 GROUP BY block.block_no, block.block_key, block.block_state;

GRANT SELECT, INSERT ON serving.common_asset_view, serving.common_asset_view_block
  TO si_analytics, si_publisher;
GRANT SELECT ON serving.common_asset_view, serving.common_asset_view_block,
  serving.common_asset_view_current_v1, serving.common_asset_view_block_coverage_v1
  TO si_readapi, si_knowledge;
-- No sequence grant: both primary keys are GENERATED ALWAYS AS IDENTITY, whose
-- sequences PostgreSQL drives internally. Adding one here would widen every
-- pre-existing sequence in the schema for no gain.
`;
