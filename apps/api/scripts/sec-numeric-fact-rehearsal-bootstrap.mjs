/**
 * The additive registry intentionally starts after the legacy research schema.
 * A fresh disposable database therefore needs the same relation contract, with
 * empty tables: this is fixture shape only, never production data or policy.
 */
export const legacyBootstrapSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS stock;
CREATE SCHEMA IF NOT EXISTS crypto;
CREATE SCHEMA IF NOT EXISTS watchlist;
CREATE SCHEMA IF NOT EXISTS market_ts;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE public.entities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id bigint,
  entity_key text NOT NULL UNIQUE,
  entity_type text NOT NULL DEFAULT 'ticker',
  market text,
  symbol text,
  ticker text,
  name text,
  country_code text,
  exchange_key text,
  currency text,
  listed_from timestamptz,
  sector text,
  industry text,
  industry_code_system text,
  industry_code text,
  industry_code_desc text,
  metadata jsonb NOT NULL DEFAULT '{}',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_positions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  entity_key text NOT NULL REFERENCES public.entities(entity_key),
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_watchlist (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  entity_key text NOT NULL REFERENCES public.entities(entity_key),
  active boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE TABLE public.source_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_system text NOT NULL,
  source_type text NOT NULL,
  source_key text,
  source_ref text,
  provider_key text,
  entity_key text,
  url text,
  source_url text,
  title text,
  summary text,
  content text,
  content_hash text,
  policy_decision text,
  revision_no integer,
  revision_fingerprint text,
  published_at timestamptz,
  collected_at timestamptz,
  known_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.market_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  signal_key text UNIQUE,
  domain text NOT NULL DEFAULT 'stock',
  entity_id bigint REFERENCES public.entities(id),
  signal_type text,
  occurred_at timestamptz,
  collected_at timestamptz,
  magnitude numeric,
  summary_text text,
  source_name text,
  source_document_id bigint,
  known_at timestamptz NOT NULL DEFAULT now(),
  payload_json jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.app_users (
  id uuid PRIMARY KEY,
  external_ref text NOT NULL UNIQUE,
  display_name text NOT NULL,
  channel_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.migration_runs (
  run_id text PRIMARY KEY,
  job_name text NOT NULL,
  source_system text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  rows_read bigint,
  rows_written bigint,
  rows_skipped bigint,
  error text,
  summary jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.institutional_holdings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id bigint REFERENCES public.entities(id),
  institution text,
  institution_cik text,
  reported_at timestamptz
);

CREATE TABLE stock.market_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_type text NOT NULL,
  symbol text,
  collected_at text
);
CREATE TABLE stock.macro_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_id text,
  value numeric,
  observed_at timestamptz,
  collected_at text
);
CREATE TABLE stock.candidates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text,
  predicted_probability numeric
);
CREATE TABLE crypto.candidates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text,
  predicted_probability numeric
);
CREATE TABLE watchlist.predictions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text,
  predicted_probability numeric
);
CREATE TABLE market_ts.ohlcv (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain text NOT NULL,
  timeframe text NOT NULL,
  symbol text NOT NULL,
  exchange text,
  ts timestamptz NOT NULL,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric
);

CREATE TABLE ops.source_collection_policy (
  provider_key text PRIMARY KEY,
  display_name text NOT NULL,
  source_class text NOT NULL,
  license_status text NOT NULL,
  redistribution_scope text NOT NULL,
  terms_url text,
  attribution_required boolean NOT NULL DEFAULT false,
  credential_kind text NOT NULL,
  credential_ref text NOT NULL,
  collection_allowed boolean NOT NULL,
  enforcement_mode text NOT NULL,
  decision_reason text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  policy_revision integer NOT NULL DEFAULT 1
);
CREATE TABLE ops.current_temporal_graph_edge (
  edge_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  src_entity_id bigint,
  dst_entity_id bigint,
  edge_type text,
  inference_kind text,
  graph_edge_id bigint,
  relation_key text,
  revision integer NOT NULL DEFAULT 1,
  weight real,
  evidence_quality text,
  approved boolean NOT NULL DEFAULT false,
  inferred boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_to timestamptz,
  known_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ops.forecast_issuance_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  forecast_key text UNIQUE,
  market text,
  horizon_days integer,
  confidence_label text,
  predicted_probability numeric,
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ops.forecast_outcome_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  forecast_id bigint REFERENCES ops.forecast_issuance_ledger(id),
  evaluation_phase text,
  confidence_label text,
  target_hit boolean,
  invalidation_hit boolean,
  direction_hit boolean,
  outcome_value real,
  outcome_score numeric,
  observed_on date,
  known_at timestamptz NOT NULL DEFAULT now()
);
`;
