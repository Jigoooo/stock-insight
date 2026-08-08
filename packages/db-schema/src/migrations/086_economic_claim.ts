export const economicClaimMigrationSql = `
-- Economic claim (canonical/03 §2).
--
-- "투자 판단의 최종 대상은 회사가 아니라 경제적 권리다." The section names eight things a
-- claim must express, and four of them already have homes: the issuer is in
-- core.security_issuer_identity, and venue, currency and effective dates are in
-- core.listing. This table adds the four that have none — holder, seniority and
-- right type, the voting/dividend/cash-flow rights, and the conversion,
-- redemption and dilution mechanics — and points at the rest rather than copying
-- it.
--
-- WHY THIS MATTERS EVEN WHILE IT IS MOSTLY EMPTY. Measured 2026-08-08, all 297
-- securities carry entity_type='Stock', including SMH, which is the VanEck
-- Semiconductor ETF. Nothing in the database distinguishes a common share from a
-- fund unit, a preferred share, an ADR or a convertible, so every consumer that
-- reaches for a security is free to assume it holds common equity in the issuer.
-- canonical/03 §2 is explicit that this assumption is wrong — the same company
-- prospect can carry different claim-level valuations — and REQ-ID-003 is the
-- identity half of the same idea.
--
-- The value of this table today is therefore not the rows it fills but the
-- assumption it removes: a consumer that joins here gets NULL and has to decide
-- what to do about it, where before it got nothing and carried on.
--
-- WHAT CAN ACTUALLY BE DETERMINED. Two securities, XLE and XLK, have ETF holdings
-- snapshots in ingestion.raw_object and are therefore evidenced fund units. The
-- other 295 have no claim-type evidence anywhere: all 188 Korean six-digit
-- tickers end in 0, which under the KRX convention rules out a preferred share
-- but not a fund, and the 107 US listings carry nothing at all. Those rows are
-- written as undetermined with a basis that says what was looked at, rather than
-- defaulted to COMMON_EQUITY — a default here is exactly the assumption the
-- table exists to remove.

CREATE TABLE IF NOT EXISTS core.economic_claim (
    economic_claim_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    security_master_id BIGINT NOT NULL REFERENCES core.security_master(security_master_id),

    -- The underlying economic entity. canonical/03 §2 lists it as its own
    -- expression because the claim and the thing claimed against are not the same
    -- object: a claim can outlive an issuer's name and an issuer can carry many
    -- claims.
    issuer_entity_id BIGINT REFERENCES core.entity(entity_id),

    claim_type TEXT CHECK (claim_type IN (
      'COMMON_EQUITY', 'PREFERRED_EQUITY', 'DEPOSITARY_RECEIPT', 'FUND_UNIT',
      'CONVERTIBLE', 'DEBT', 'WARRANT', 'TOKEN'
    )),
    claim_type_state TEXT NOT NULL DEFAULT 'undetermined'
      CHECK (claim_type_state IN ('determined', 'undetermined')),

    -- Where this claim stands when the issuer pays out. Left null rather than
    -- assumed: seniority is the difference between a preferred share and a common
    -- one, and guessing it is guessing the answer.
    seniority_rank INTEGER CHECK (seniority_rank IS NULL OR seniority_rank >= 0),

    voting_rights     JSONB,
    dividend_rights   JSONB,
    cash_flow_rights  JSONB,
    conversion_terms  JSONB,
    redemption_terms  JSONB,
    dilution_mechanics JSONB,

    -- What was read to reach the state above, whichever state it is. An
    -- undetermined row has to say what was checked, or a later reader cannot tell
    -- a gap in the data from a gap in the effort.
    determination_basis TEXT NOT NULL CHECK (length(btrim(determination_basis)) > 0),

    valid_from TIMESTAMPTZ NOT NULL,
    valid_to   TIMESTAMPTZ,
    known_at   TIMESTAMPTZ NOT NULL,
    determined_by TEXT NOT NULL CHECK (length(btrim(determined_by)) > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (security_master_id, valid_from),

    CONSTRAINT economic_claim_state_agrees CHECK (
      (claim_type_state = 'determined' AND claim_type IS NOT NULL)
      OR (claim_type_state = 'undetermined' AND claim_type IS NULL)
    ),

    -- An undetermined claim cannot carry determined rights. Letting it would make
    -- a row that says "we do not know what this is" while also saying how it
    -- votes, and the second statement would be read as the first being a
    -- formality.
    CONSTRAINT economic_claim_undetermined_states_nothing CHECK (
      claim_type_state = 'determined'
      OR (voting_rights IS NULL AND dividend_rights IS NULL AND cash_flow_rights IS NULL
          AND conversion_terms IS NULL AND redemption_terms IS NULL
          AND dilution_mechanics IS NULL AND seniority_rank IS NULL)
    ),

    CONSTRAINT economic_claim_interval_ordered CHECK (
      valid_to IS NULL OR valid_to > valid_from
    )
);

CREATE INDEX IF NOT EXISTS ix_economic_claim_security
  ON core.economic_claim (security_master_id, valid_from DESC);

COMMENT ON TABLE core.economic_claim IS
  'The economic right a security represents (canonical/03 §2); NULL claim_type means undetermined, never common equity by default.';

-- The coverage this table has, stated as a number rather than left to be counted
-- by whoever wonders. canonical/03 §7 puts a coverage ledger next to the claim
-- model for exactly this reason.
CREATE OR REPLACE VIEW core.economic_claim_coverage_v1 AS
SELECT count(*)::bigint AS claims,
       count(*) FILTER (WHERE claim_type_state = 'determined')::bigint AS determined,
       count(*) FILTER (WHERE claim_type_state = 'undetermined')::bigint AS undetermined,
       count(*) FILTER (WHERE voting_rights IS NOT NULL)::bigint AS with_voting_rights,
       (SELECT count(*) FROM core.security_master)::bigint AS securities
  FROM core.economic_claim
 WHERE valid_to IS NULL;

COMMENT ON VIEW core.economic_claim_coverage_v1 IS
  'How much of the security universe has a determined economic claim.';

-- GRANTS: pipeline roles only. The app roles get nothing here — this is a kernel
-- object, not a rendering surface, so the boot digest does not move for it.
GRANT SELECT, INSERT, UPDATE ON core.economic_claim
  TO si_knowledge, si_analytics, si_publisher;
GRANT SELECT ON core.economic_claim, core.economic_claim_coverage_v1 TO si_readapi;
GRANT SELECT ON core.economic_claim_coverage_v1
  TO si_knowledge, si_analytics, si_publisher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core
  TO si_knowledge, si_analytics, si_publisher;
`;
