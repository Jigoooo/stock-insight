export const marketDataEnrichmentMigrationSql = `
-- SET C / C-1: market data enrichment schema.
-- corporate actions, trading calendar, filing-level financial facts, concept dictionary,
-- macro vintages (ALFRED-style), and US daily short volume.
-- Additive only; legacy tables (public.company_financials, stock.macro_observations) untouched.

CREATE SCHEMA IF NOT EXISTS market;

CREATE TABLE IF NOT EXISTS market.corporate_action (
    action_id          BIGSERIAL PRIMARY KEY,
    security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    action_type        TEXT NOT NULL CHECK (action_type IN
                        ('dividend','split','merge','delist','rights','spinoff')),
    announced_at       TIMESTAMPTZ,
    effective_date     DATE NOT NULL,
    ratio              NUMERIC,          -- split: new/old (e.g. 10 for 10:1)
    amount             NUMERIC,          -- dividend per share
    currency           TEXT,
    source_provider    TEXT NOT NULL,
    available_at       TIMESTAMPTZ NOT NULL,
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (security_entity_id, action_type, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_market_ca_effective ON market.corporate_action (effective_date DESC);

CREATE TABLE IF NOT EXISTS market.trading_calendar (
    exchange_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    session_date       DATE NOT NULL,
    session_type       TEXT NOT NULL CHECK (session_type IN ('full','half','closed')),
    open_at            TIMESTAMPTZ,
    close_at           TIMESTAMPTZ,
    source_provider    TEXT NOT NULL DEFAULT 'derived_ohlcv',
    PRIMARY KEY (exchange_entity_id, session_date)
);

CREATE TABLE IF NOT EXISTS market.financial_concept (
    concept        TEXT PRIMARY KEY,
    label_ko       TEXT NOT NULL,
    statement      TEXT NOT NULL CHECK (statement IN ('IS','BS','CF','ratio')),
    dart_account_ids TEXT[] NOT NULL DEFAULT '{}',
    us_gaap_tags   TEXT[] NOT NULL DEFAULT '{}',
    unit_class     TEXT NOT NULL CHECK (unit_class IN ('currency','shares','pure'))
);

INSERT INTO market.financial_concept (concept, label_ko, statement, dart_account_ids, us_gaap_tags, unit_class) VALUES
  ('Revenues',            '매출액',       'IS', ARRAY['ifrs-full_Revenue'], ARRAY['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet'], 'currency'),
  ('OperatingIncome',     '영업이익',     'IS', ARRAY['dart_OperatingIncomeLoss'], ARRAY['OperatingIncomeLoss'], 'currency'),
  ('NetIncome',           '당기순이익',   'IS', ARRAY['ifrs-full_ProfitLoss'], ARRAY['NetIncomeLoss','ProfitLoss'], 'currency'),
  ('GrossProfit',         '매출총이익',   'IS', ARRAY['ifrs-full_GrossProfit'], ARRAY['GrossProfit'], 'currency'),
  ('TotalAssets',         '자산총계',     'BS', ARRAY['ifrs-full_Assets'], ARRAY['Assets'], 'currency'),
  ('TotalLiabilities',    '부채총계',     'BS', ARRAY['ifrs-full_Liabilities'], ARRAY['Liabilities'], 'currency'),
  ('TotalEquity',         '자본총계',     'BS', ARRAY['ifrs-full_Equity'], ARRAY['StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], 'currency'),
  ('CashAndEquivalents',  '현금및현금성자산', 'BS', ARRAY['ifrs-full_CashAndCashEquivalents'], ARRAY['CashAndCashEquivalentsAtCarryingValue'], 'currency'),
  ('OperatingCashFlow',   '영업활동현금흐름', 'CF', ARRAY['ifrs-full_CashFlowsFromUsedInOperatingActivities'], ARRAY['NetCashProvidedByUsedInOperatingActivities'], 'currency'),
  ('CapEx',               '설비투자',     'CF', ARRAY[]::text[], ARRAY['PaymentsToAcquirePropertyPlantAndEquipment'], 'currency'),
  ('SharesOutstanding',   '발행주식수',   'ratio', ARRAY[]::text[], ARRAY['CommonStockSharesOutstanding','EntityCommonStockSharesOutstanding'], 'shares'),
  ('EPS',                 '주당순이익',   'ratio', ARRAY[]::text[], ARRAY['EarningsPerShareDiluted','EarningsPerShareBasic'], 'pure')
ON CONFLICT (concept) DO NOTHING;

CREATE TABLE IF NOT EXISTS market.financial_fact (
    fact_id          BIGSERIAL PRIMARY KEY,
    issuer_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    concept          TEXT NOT NULL REFERENCES market.financial_concept(concept),
    value            NUMERIC NOT NULL,
    unit             TEXT NOT NULL,
    currency         TEXT,
    period_start     DATE,
    period_end       DATE NOT NULL,
    fiscal_year      INTEGER NOT NULL CHECK (fiscal_year > 1900),
    fiscal_period    TEXT NOT NULL CHECK (fiscal_period IN ('FY','Q1','Q2','Q3','Q4','H1','H2')),
    filing_ref       TEXT NOT NULL,
    form             TEXT,
    filed_at         TIMESTAMPTZ,
    available_at     TIMESTAMPTZ NOT NULL,
    amends_fact_id   BIGINT REFERENCES market.financial_fact(fact_id),
    source_provider  TEXT NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (issuer_entity_id, concept, period_end, fiscal_period, filing_ref)
);
CREATE INDEX IF NOT EXISTS idx_market_ff_issuer_concept
  ON market.financial_fact (issuer_entity_id, concept, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_market_ff_filing ON market.financial_fact (filing_ref);

CREATE TABLE IF NOT EXISTS market.macro_vintage (
    series_key       TEXT NOT NULL,      -- provider:series (e.g. fred:FEDFUNDS)
    observation_date DATE NOT NULL,
    vintage_date     DATE NOT NULL,      -- when this value became known (ALFRED realtime_start)
    value            NUMERIC,            -- NULL = missing observation in that vintage
    vintage_quality  TEXT NOT NULL DEFAULT 'realtime'
                     CHECK (vintage_quality IN ('realtime','approx_collected')),
    available_at     TIMESTAMPTZ NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (series_key, observation_date, vintage_date)
);
CREATE INDEX IF NOT EXISTS idx_market_mv_series_vintage
  ON market.macro_vintage (series_key, vintage_date DESC);

CREATE TABLE IF NOT EXISTS market.short_volume_daily (
    trade_date       DATE NOT NULL,
    symbol           TEXT NOT NULL,      -- US local ticker (uppercase)
    short_volume     NUMERIC NOT NULL,
    short_exempt_volume NUMERIC,
    total_volume     NUMERIC NOT NULL,
    market_codes     TEXT,
    source_provider  TEXT NOT NULL DEFAULT 'finra_cnms',
    available_at     TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (trade_date, symbol)
);
COMMENT ON TABLE market.short_volume_daily IS
  'FINRA daily short sale volume (CNMS). NOT short interest — venue coverage is FINRA TRF/ADF only.';

-- Grants: workers RW, app roles read-only.
DO $$
BEGIN
  GRANT USAGE ON SCHEMA market TO si_collector, si_analytics, si_publisher, si_readapi;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA market TO si_collector;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA market TO si_collector;
  GRANT SELECT ON ALL TABLES IN SCHEMA market TO si_analytics, si_publisher, si_readapi;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT USAGE ON SCHEMA market TO stock_insight_app_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA market TO stock_insight_app_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA market GRANT SELECT ON TABLES TO stock_insight_app_reader;
  END IF;
END $$;
`;
