import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

import { Client, type PoolClient, type QueryResultRow } from 'pg';

import { planGraphSnapshotFromDatabase, type GraphSnapshotPlan } from './graph-snapshot.ts';
import {
  appendRawObjectManifest,
  CLOSE_FETCH_RUN_SQL,
  OPEN_FETCH_RUN_SQL,
  registerRawObjectWithRevision,
  writeRawObject,
  type RawObjectRef,
} from '../ingest/raw-object-store.ts';
import {
  buildEtfBasketCandidates,
  type EtfBasketObservation,
} from '../relations/builders/etf-overlap.ts';
import {
  buildMacroComovementCandidates,
  type MacroComovementObservation,
} from '../relations/builders/macro-comovement.ts';
import {
  buildMacroTopicCandidates,
  type MacroTopicObservation,
} from '../relations/builders/macro-topic.ts';
import {
  buildOfficialSectorCandidates,
  type OfficialSectorObservation,
} from '../relations/builders/official-sector.ts';
import {
  buildOwnershipCandidates,
  type OwnershipObservation,
} from '../relations/builders/ownership.ts';
import { buildProductSimilarityCandidates } from '../relations/builders/product-similarity.ts';
import {
  buildSupplyChainCandidates,
  type SupplyChainObservation,
} from '../relations/builders/supply-chain.ts';
import { type ContentPackSourceItem } from '../relations/content-pack-builder.ts';
import {
  CONTENT_PACK_MAX_ITEMS,
  publishContentPacks,
} from '../relations/content-pack-publisher.ts';
import {
  MACRO_COMOVEMENT_MODEL_CONFIG,
  MACRO_SERIES_TRANSFORMS,
  MACRO_WINDOW_DAYS_BY_FREQUENCY,
  planMacroComovementPairs,
  type MacroComovementPlan,
  type MarketFactorWindow,
  type MacroSeriesWindow,
  type StockPriceWindow,
} from '../relations/macro-comovement-model.ts';
import {
  planProductSimilarity,
  type ProductSimilarityMeasuredAbsence,
  type ProductSimilarityProfile,
} from '../relations/product-similarity-model.ts';
import { persistRelationCandidates } from '../relations/relation-candidate-store.ts';
import {
  buildRelationGraphProjections,
  type RelationGraphProjection,
  type RelationGraphProjectionEdge,
  type RelationGraphProjectionEntity,
} from '../relations/relation-graph-projector-v2.ts';
import {
  planRetractionsFromDatabase,
  planRetractionsNotInFromDatabase,
  retractEdges,
  retractEdgesNotIn,
  type MeasuredAbsence,
} from '../relations/relation-retraction.ts';

const APPLY = process.argv.includes('--apply');
// The run slot is the KST date, so a second publish in one day is impossible by
// design — which is right for accidental double-runs but leaves no supported way
// to re-run after a code fix. The only alternative was deleting the claim row by
// hand: no audit trail, and a DELETE against the table that prevents concurrent
// double-publishing.
//
// A suffix makes the re-run its own slot instead. The guard is untouched — each
// key is still claimed exactly once, so two concurrent runs still cannot collide —
// and the forced run leaves its own claim row, so "why are there two snapshots
// today" is answerable from the data.
const SLOT_SUFFIX = (() => {
  const index = process.argv.indexOf('--slot-suffix');
  // Also readable from the environment so the whole pipeline wrapper can be
  // re-run without teaching every script to forward the flag — env inherits.
  const fromEnv = process.env.STOCK_INSIGHT_SLOT_SUFFIX?.trim();
  if (index === -1) {
    if (!fromEnv) return '';
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(fromEnv)) {
      throw new Error(
        'STOCK_INSIGHT_SLOT_SUFFIX must be lowercase alphanumeric with dashes, max 32 chars',
      );
    }
    return `#${fromEnv}`;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error('--slot-suffix requires a value');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(value)) {
    throw new Error('--slot-suffix must be lowercase alphanumeric with dashes, max 32 chars');
  }
  return `#${value}`;
})();
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const FRESHNESS_HOURS = 36;
const SUPERHUB_DEGREE_THRESHOLD = 200;
const PACK_KIND = 'entity_relation_graph';
const RELEASE_COMMIT = 'f2ec673';
const ETF_PROVIDER = 'internal-etf-holdings-snapshot';
const SECTOR_PROVIDER = 'internal-industry-classification-snapshot';
const PROFILE_PROVIDER = 'internal-company-profile-snapshot';
const MACRO_SERIES_PROVIDER = 'internal-macro-series-window-snapshot';
// Created by migration 068 rather than by ensureSource, because its contract
// declares `curated_not_observed` — this mapping is an editorial judgement, and
// the shared ensureSource writes `internal_derived` / `transitional_source`,
// which would describe it as derived from data. If 068 has not been applied the
// MEASURED_BY ontology is also absent, so the whole step skips and the missing
// source is never reached.
const MACRO_TOPIC_PROVIDER = 'internal-macro-topic-mapping-snapshot';
const STOCK_PRICE_PROVIDER = 'internal-stock-price-window-snapshot';
// The sixth internal snapshot source, and the one that moves
// run-source-contract-audit's transitional-exemption ceiling from 5 to 6. That
// ceiling exists so a carve-out cannot grow without anyone deciding; this is the
// deciding.
const HOLDINGS_PROVIDER = 'internal-institutional-holdings-snapshot';

/**
 * Which ownership predicates actually reach the graph, and why COMMON_OWNER does
 * not. The builder still produces it — the exclusion is operational, so it lives
 * here next to the constraint rather than inside a tested builder.
 *
 * Measured 2026-08-07, the hard way. Enabling all three produced 1,641 candidates
 * with 0 quarantined, which read as healthy, and the apply died on
 * `pack US:AAPL exceeds lineage item cap: 672`.
 *
 * TWO CORRECTIONS TO THE FIRST WRITE-UP OF THIS, both found by re-reading rather
 * than re-measuring:
 *   - CONTENT_PACK_MAX_ITEMS is 512 and is an APPLICATION constant, not something
 *     migration 026 enforces. `512` appears in no migration. See the constant.
 *   - It was not "ownership edges" that blew the cap. The projector admits only
 *     SAME_ETF_BASKET, PRODUCT_SIMILARITY and COMMON_OWNER
 *     (relation-graph-projector-v2.ts DIRECT_PREDICATES), so HELD_BY contributes
 *     ZERO pack items — it reaches impact paths, which read graph_snapshot_edge
 *     and have their own separate budget. The overflow was entirely COMMON_OWNER.
 *
 * A pack counts relations PLUS their evidence, and position-grain source revisions
 * (required — see HOLDINGS_SOURCE) mean a pair held by five institutions carries
 * ten evidence rows. Edge count does not predict pack size. Re-measured through
 * the dry run once it accounted for candidates:
 *
 *   all three predicates   1,641 candidates · max pack 724 · 41 packs over cap
 *   HELD_BY only             250 candidates · max pack 285 ·  0 packs over cap
 *
 * Why the builder's own superhubDegreeCap does not save it: the cap is 100
 * holdings per owner and the largest holder here has 42, so it never fires.
 * A threshold low enough to bite (~30) excludes BlackRock 42, T Rowe 41,
 * State Street 41, FMR 41, Vanguard 39 and 국민연금 33 — every holder large enough
 * to form pairs at all. What survives holds 1-3 positions and produces nothing.
 * There is no threshold that keeps the predicate and fits the cap.
 *
 * So with THIS source COMMON_OWNER is entirely universal owners, which is the
 * case Antón-Polk treats as carrying little information. Shipping it would spend
 * every mega-cap's whole pack budget on "BlackRock holds both of these".
 *
 * To enable: a per-security pack budget, or a holdings source with non-index
 * owners. HELD_BY is unaffected and ships.
 */
const SHIPPED_OWNERSHIP_PREDICATES = new Set(['OWNS', 'HELD_BY']);

type EtfHoldingRow = QueryResultRow & {
  etf_ticker: string;
  etf_name: string;
  as_of: string;
  member_entity_key: string;
  member_name: string;
  member_entity_id: string | number | null;
  weight_pct: string | null;
  sector: string | null;
  source: string;
  collected_at: Date | string;
};

type InstitutionalHoldingRow = QueryResultRow & {
  holding_key: string | null;
  institution: string;
  owner_entity_id: string | number;
  owned_entity_id: string | number;
  owned_entity_key: string;
  as_of: string;
  filing_date: string;
  value_usd: string | null;
  rate_pct: string | null;
  source: string | null;
};

type SectorRow = QueryResultRow & {
  entity_key: string;
  entity_name: string;
  subject_entity_id: string | number | null;
  taxonomy_system: 'SIC' | 'KSIC';
  taxonomy_code: string;
  taxonomy_description: string | null;
  source_system: string;
  source_ref: string;
  valid_from: Date | string | null;
};

type CompanyProfileRow = QueryResultRow & {
  entity_key: string;
  entity_name: string;
  entity_id: string | number | null;
  summary_text: string;
  profile_json: Record<string, unknown>;
  source_refs_json: unknown;
  availability: string;
  captured_at: Date | string;
};

type MacroSeriesWindowRow = QueryResultRow & {
  series_key: string;
  observation_date: string;
  value: number;
  series_entity_id: string | number;
};

type StockPriceWindowRow = QueryResultRow & {
  security_entity_id: string | number;
  market: string;
  bar_date: string;
  close: number;
};

type MarketFactorRow = QueryResultRow & { market_key: string; bar_date: string; close: number };

type ManifestEntry = { providerKey: string; ref: RawObjectRef; fetchedAt: Date };

type SourceDefinition = {
  providerKey: string;
  displayName: string;
  sourceTable: string;
  requiredFields: string[];
};

const ETF_SOURCE: SourceDefinition = {
  providerKey: ETF_PROVIDER,
  displayName: 'Immutable ETF holdings snapshot from transitional serving data',
  sourceTable: 'public.etf_holdings',
  requiredFields: ['etf_ticker', 'as_of', 'member_entity_key', 'weight_pct', 'source'],
};
const SECTOR_SOURCE: SourceDefinition = {
  providerKey: SECTOR_PROVIDER,
  displayName: 'Immutable SIC/KSIC classification snapshot from transitional serving data',
  sourceTable: 'public.entities',
  requiredFields: ['entity_key', 'industry_code_system', 'industry_code', 'industry_code_source'],
};
const PROFILE_SOURCE: SourceDefinition = {
  providerKey: PROFILE_PROVIDER,
  displayName: 'Immutable company profile summary snapshot from transitional serving data',
  sourceTable: 'public.company_profiles',
  requiredFields: ['entity_key', 'summary_text', 'source_refs_json', 'captured_at'],
};
// The two windows behind a MACRO_COMOVEMENT number. They exist because the
// accepted-revision guard (migration 024) wants an immutable source revision
// bound to the payload, and neither input can supply one on its own:
// market.macro_vintage carries source_revision_id on only part of its rows
// (10,691 of 22,059 for DGS10, measured 2026-08-04), and market_ts.ohlcv has no
// lineage column at all — it belongs to research-common and we only read it.
// Registering the exact window that produced the correlation is what makes the
// number re-runnable; citing a partial set of upstream revisions would describe
// the input as something other than what was used.
const MACRO_SERIES_SOURCE: SourceDefinition = {
  providerKey: MACRO_SERIES_PROVIDER,
  displayName: 'Immutable point-in-time macro series window used by the co-movement model',
  sourceTable: 'market.macro_vintage',
  requiredFields: ['series_key', 'observation_date', 'vintage_date', 'value', 'available_at'],
};
// One 13F position per record, not one filing. COMMON_OWNER declares
// minSourceRevisions: 2 (relation-policy.ts), and its evidence is assembled from
// the subject holding's revisions plus the object holding's. At filing grain both
// legs of a pair cite the SAME revision, the pair sees one distinct id, and every
// candidate would be quarantined — the builder would look wired and produce
// nothing. At position grain the two legs cite different revisions and the pair
// clears the policy honestly, because two separately-recorded positions really are
// two observations.
const HOLDINGS_SOURCE: SourceDefinition = {
  providerKey: HOLDINGS_PROVIDER,
  displayName: 'Institutional 13F/holdings positions used by the ownership builder',
  sourceTable: 'public.institutional_holdings',
  requiredFields: ['institution', 'entity_id', 'as_of', 'filing_date'],
};
const STOCK_PRICE_SOURCE: SourceDefinition = {
  providerKey: STOCK_PRICE_PROVIDER,
  displayName: 'Immutable daily close window used by the co-movement model',
  // Owned by research-common (docs/operations/database-ownership.md). Read only:
  // this job never writes to market_ts.*, and verify-table-ownership.sh would
  // fail if it did.
  sourceTable: 'market_ts.ohlcv',
  requiredFields: ['symbol', 'exchange', 'domain', 'timeframe', 'ts', 'close'],
};

// The curated topic-to-series mapping, resolved to the entity ids on both ends.
// An INNER JOIN on both sides on purpose: a mapping row whose topic or series
// has no core.entity cannot become an edge, and inventing one here would create
// a node the rest of the system has never heard of. Rows that drop out are
// counted in the run summary rather than silently ignored.
const MACRO_TOPIC_MAPPING_SQL = `
SELECT mapping.topic,
       mapping.series_key,
       topic_entity.entity_id AS topic_entity_id,
       series_entity.entity_id AS series_entity_id,
       -- valid_from for the edge. A curated mapping holds from when the mapping was
       -- created, not from whenever we last read it, and using the read time made
       -- every publish append a fresh revision for an unchanged fact.
       mapping.created_at AS mapping_created_at
FROM analytics.macro_series_topic mapping
JOIN core.entity topic_entity
  ON topic_entity.entity_type='Metric'
 AND topic_entity.canonical_name='topic:'||mapping.topic
JOIN core.entity series_entity
  ON series_entity.entity_type='Metric'
 AND series_entity.canonical_name=mapping.series_key
ORDER BY mapping.topic, mapping.series_key
`;

const MACRO_TOPIC_MAPPING_TOTAL_SQL = `SELECT count(*)::int AS total FROM analytics.macro_series_topic`;

// B2 — the collected supply disclosures. This is the first CAUSAL predicate the
// graph gets: AFFECTS, SUPPLY_CHAIN and EXPOSES all stand at zero accepted
// revisions because nothing legitimate ever fed them, and the only door migration
// 024's evidence gate opens for these is source_revision — identity_mapping is
// ISSUED_BY-only, and claim/document require a verified claim of which production
// has none. So the source revision the collector recorded is carried through here
// rather than re-derived.
//
// valid_from is the FILING's date, already stored by the collector. A disclosure
// holds from when it was disclosed, not from when this publish read the row — the
// same distinction that made 14 MEASURED_BY revisions churn once per publish.
const SUPPLY_RELATION_SQL = `
SELECT relation.from_firm_entity_id,
       relation.to_firm_entity_id,
       (relation.evidence_locator->>'source_revision_id')::bigint AS source_revision_id,
       relation.available_at,
       relation.valid_from
FROM analytics.firm_supply_relation relation
WHERE relation.relation_kind = 'customer'
  AND relation.valid_until IS NULL
  AND relation.evidence_locator->>'source_revision_id' IS NOT NULL
ORDER BY relation.from_firm_entity_id, relation.to_firm_entity_id
`;

/**
 * Institutional holdings, resolved to core entities on BOTH ends.
 *
 * The owned end has always resolved (250 of 250 rows reach a core Stock through
 * public.entities.entity_key). The owner end is new: migration 077 mints a
 * LegalEntity per holder, keyed 'INSTITUTION:<name>', because core.entity held no
 * institution at all — which is the real reason buildOwnershipCandidates had only
 * test callers, rather than the missing 13F collector it was filed as.
 *
 * public.institutional_holdings is another project's table and is READ ONLY here,
 * the same standing as public.etf_holdings and public.entities above.
 *
 * INNER JOIN on both ends on purpose: a holding whose either side has no core
 * entity cannot become an edge, and minting one here would create a node the rest
 * of the system has never heard of. Dropped rows are counted in the run summary.
 */
const INSTITUTIONAL_HOLDINGS_SQL = `
SELECT DISTINCT ON (holding.institution, owned_identifier.entity_id, holding.as_of)
       holding.holding_key,
       holding.institution,
       holder.entity_id AS owner_entity_id,
       owned_identifier.entity_id AS owned_entity_id,
       legacy.entity_key AS owned_entity_key,
       holding.as_of::text AS as_of,
       -- A 13F position is knowable only once it is filed. filing_date is that
       -- moment; as_of is the quarter it describes. Using as_of as availableAt
       -- would let a position enter the graph up to 45 days before anyone could
       -- have seen it, which is exactly what the PIT gate exists to prevent.
       coalesce(holding.filing_date, holding.as_of)::text AS filing_date,
       holding.value_usd::text AS value_usd,
       holding.rate_pct::text AS rate_pct,
       holding.source
FROM public.institutional_holdings holding
JOIN public.entities legacy ON legacy.id = holding.entity_id
JOIN core.entity_identifier owned_identifier
  ON owned_identifier.identifier_type = 'INTERNAL_KEY'
 AND owned_identifier.identifier_value = legacy.entity_key
JOIN core.entity owned_entity
  ON owned_entity.entity_id = owned_identifier.entity_id
 AND owned_entity.entity_type = 'Stock'
JOIN core.entity holder
  ON holder.entity_type = 'LegalEntity'
 AND holder.canonical_name = holding.institution
ORDER BY holding.institution, owned_identifier.entity_id, holding.as_of,
         holding.collected_at DESC, holding.id DESC
`;

const INSTITUTIONAL_HOLDINGS_TOTAL_SQL = `SELECT count(*)::int AS total FROM public.institutional_holdings`;

const LATEST_ETF_HOLDINGS_SQL = `
WITH latest_date AS (
  SELECT etf_ticker,max(as_of) AS as_of
  FROM public.etf_holdings
  GROUP BY etf_ticker
), latest_row AS (
  SELECT DISTINCT ON (holding.etf_ticker,entity.entity_key)
         holding.etf_ticker,
         coalesce(nullif(holding.etf_name,''),holding.etf_ticker) AS etf_name,
         holding.as_of::text AS as_of,
         entity.entity_key AS member_entity_key,
         entity.name AS member_name,
         identifier.entity_id AS member_entity_id,
         holding.weight_pct::text AS weight_pct,
         holding.sector,
         holding.source,
         holding.collected_at
  FROM public.etf_holdings holding
  JOIN latest_date latest
    ON latest.etf_ticker=holding.etf_ticker AND latest.as_of=holding.as_of
  JOIN public.entities entity ON entity.id=holding.entity_id
  LEFT JOIN core.entity_identifier identifier
    ON identifier.identifier_type='INTERNAL_KEY'
   AND identifier.identifier_value=entity.entity_key
  ORDER BY holding.etf_ticker,entity.entity_key,holding.collected_at DESC,holding.id DESC
)
SELECT * FROM latest_row ORDER BY etf_ticker,member_entity_key
`;

const SECTOR_ROWS_SQL = `
SELECT entity.entity_key,
       entity.name AS entity_name,
       identifier.entity_id AS subject_entity_id,
       entity.industry_code_system AS taxonomy_system,
       entity.industry_code AS taxonomy_code,
       entity.industry_code_desc AS taxonomy_description,
       coalesce(nullif(entity.industry_code_source,''),entity.source_system,'unknown') AS source_system,
       coalesce(nullif(entity.source_ref,''),entity.entity_key) AS source_ref,
       entity.industry_code_as_of AS valid_from
FROM public.entities entity
LEFT JOIN core.entity_identifier identifier
  ON identifier.identifier_type='INTERNAL_KEY'
 AND identifier.identifier_value=entity.entity_key
WHERE entity.entity_key ~ '^(KR:[0-9]{6}|US:[A-Z][A-Z0-9]{0,7}([.-][A-Z0-9]{1,2})?)$'
  AND entity.industry_code_system IN ('SIC','KSIC')
  AND nullif(entity.industry_code,'') IS NOT NULL
ORDER BY entity.entity_key
`;

const COMPANY_PROFILE_ROWS_SQL = `
SELECT profile.entity_key,
       profile.name AS entity_name,
       identifier.entity_id,
       profile.summary_text,
       profile.profile_json,
       profile.source_refs_json,
       profile.availability,
       profile.captured_at
FROM public.company_profiles profile
LEFT JOIN core.entity_identifier identifier
  ON identifier.identifier_type='INTERNAL_KEY'
 AND identifier.identifier_value=profile.entity_key
WHERE nullif(profile.summary_text,'') IS NOT NULL
ORDER BY profile.entity_key
`;

// Point-in-time macro series window.
//
// market.macro_vintage holds every (observation_date, vintage_date) pair, so one
// observation date has many values as FRED revises it. DISTINCT ON picks the
// greatest vintage_date among those whose available_at is at or before the run
// cutoff — i.e. the newest value that WAS knowable then. Taking the newest value
// outright would feed the model a revision published after the fact and make the
// correlation look better than anything that could have been computed at the
// time. The rule is repeated verbatim in MACRO_COMOVEMENT_MODEL_CONFIG so a
// re-run is checkable against the row it produced.
const MACRO_SERIES_WINDOW_SQL = `
WITH pit AS (
  SELECT DISTINCT ON (vintage.series_key, vintage.observation_date)
         vintage.series_key,
         vintage.observation_date::text AS observation_date,
         vintage.value::float8 AS value
  FROM market.macro_vintage vintage
  WHERE vintage.series_key = ANY($3::text[])
    AND vintage.value IS NOT NULL
    AND vintage.available_at <= $1::timestamptz
    AND vintage.observation_date >= ($1::timestamptz - make_interval(days => $2))::date
    AND vintage.observation_date <= $1::timestamptz::date
  ORDER BY vintage.series_key, vintage.observation_date,
           vintage.vintage_date DESC, vintage.available_at DESC
)
SELECT pit.series_key, pit.observation_date, pit.value,
       identifier.entity_id AS series_entity_id
FROM pit
-- Both macro identifier namespaces. This was 'FRED_SERIES' alone until
-- 2026-08-07, which meant a Korean series could not enter the co-movement model
-- whatever mapping it was given: ECOS_SERIES has been in the identifier_type
-- CHECK since migration 008 and no row had ever used it, so the restriction read
-- as a filter when it was really a hard wall.
JOIN core.entity_identifier identifier
  ON identifier.identifier_type IN ('FRED_SERIES', 'ECOS_SERIES')
 AND identifier.identifier_value = pit.series_key
 AND identifier.valid_to IS NULL
JOIN core.entity series_entity
  ON series_entity.entity_id = identifier.entity_id
 AND series_entity.entity_type = 'Metric'
ORDER BY pit.series_key, pit.observation_date
`;

// Daily closes for the same window, keyed by the canonical Stock entity.
//
// core.v_security_universe is the mapping the rest of the pipeline uses
// (run-feature-snapshot.ts) — ticker + market to security_entity_id. Joining any
// other way risks the public.entities / core.entity id-space confusion that has
// produced wrong results twice in this repository.
//
// close, not adj_close: adj_close is null on all 298,754 stock 1D rows and
// adjustment_version is empty on all of them (measured 2026-08-04). close is
// already split-adjusted at the source.
const STOCK_PRICE_WINDOW_SQL = `
SELECT DISTINCT ON (universe.security_entity_id, (bar.ts AT TIME ZONE 'UTC')::date)
       universe.security_entity_id,
       universe.market,
       ((bar.ts AT TIME ZONE 'UTC')::date)::text AS bar_date,
       bar.close::float8 AS close
FROM market_ts.ohlcv bar
JOIN core.v_security_universe universe
  ON universe.ticker = regexp_replace(upper(bar.symbol), '\\.(KS|KQ)$', '')
 AND universe.market = CASE WHEN bar.exchange IN ('KOSPI','KOSDAQ') THEN 'KR' ELSE 'US' END
WHERE bar.domain = 'stock'
  AND bar.timeframe = '1D'
  AND bar.close > 0
  AND (bar.ts AT TIME ZONE 'UTC')::date >= ($1::timestamptz - make_interval(days => $2))::date
  AND (bar.ts AT TIME ZONE 'UTC')::date <= $1::timestamptz::date
ORDER BY universe.security_entity_id, (bar.ts AT TIME ZONE 'UTC')::date, bar.collected_at DESC
`;

// Market factors, one per market, so a stock is only ever controlled for the
// market it actually trades in.
//
// US uses ^GSPC, which market_ts.ohlcv carries with full history (1,267 daily
// bars, 2021-07 onward). KR has no usable index here: ^KS11 is absent from
// market_ts.ohlcv entirely and exists only in stock.market_snapshots, where it
// holds 141 ROWS spanning just 57 distinct dates (2026-04-30..2026-07-24, three
// sessions per day) and has not advanced since 2026-07-24. The correlation window
// this factor is loaded over is 1,095 days, so the gap is 57 vs 1,095.
//
// (An earlier version of this comment said "141 days". That was the row count
// read as a date count, and it is repeated in run-ecos-vintage.ts and migration
// 076 — corrected 2026-08-07.)
//
// So the KR factor is a daily-rebalanced equal-weighted index built from the KR
// universe itself — the average of what our own Korean holdings did each day.
//
// The asymmetry is deliberate and recorded rather than smoothed over: using
// ^GSPC for Korean stocks would subtract a factor they do not load on, and
// waiting for KOSPI history would leave every Korean edge restating beta in the
// meantime.
const MARKET_FACTOR_SQL = `
WITH bars AS (
  SELECT DISTINCT ON (universe.security_entity_id, (bar.ts AT TIME ZONE 'UTC')::date)
         universe.security_entity_id,
         universe.market,
         (bar.ts AT TIME ZONE 'UTC')::date AS bar_date,
         bar.close::float8 AS close
  FROM market_ts.ohlcv bar
  JOIN core.v_security_universe universe
    ON universe.ticker = regexp_replace(upper(bar.symbol), '\\.(KS|KQ)$', '')
   AND universe.market = CASE WHEN bar.exchange IN ('KOSPI','KOSDAQ') THEN 'KR' ELSE 'US' END
  WHERE bar.domain = 'stock' AND bar.timeframe = '1D' AND bar.close > 0
    AND (bar.ts AT TIME ZONE 'UTC')::date >= ($1::timestamptz - make_interval(days => $2))::date
    AND (bar.ts AT TIME ZONE 'UTC')::date <= $1::timestamptz::date
  ORDER BY universe.security_entity_id, (bar.ts AT TIME ZONE 'UTC')::date, bar.collected_at DESC
), stock_returns AS (
  SELECT market, bar_date,
         ln(close / lag(close) OVER (PARTITION BY security_entity_id ORDER BY bar_date)) AS r
  FROM bars
), mean_returns AS (
  SELECT market, bar_date, avg(r) AS mean_r
  FROM stock_returns WHERE r IS NOT NULL GROUP BY 1,2
), kr_index AS (
  -- Daily-rebalanced equal weight: the level is the running product of the
  -- cross-sectional mean return, so its log return IS the average stock's.
  SELECT 'KR'::text AS market_key, bar_date::text AS bar_date,
         exp(sum(mean_r) OVER (ORDER BY bar_date))::float8 AS close
  FROM mean_returns WHERE market = 'KR'
), us_index AS (
  SELECT 'US'::text AS market_key,
         ((bar.ts AT TIME ZONE 'UTC')::date)::text AS bar_date,
         bar.close::float8 AS close
  FROM market_ts.ohlcv bar
  WHERE bar.symbol = '^GSPC' AND bar.timeframe = '1D' AND bar.close > 0
    AND (bar.ts AT TIME ZONE 'UTC')::date >= ($1::timestamptz - make_interval(days => $2))::date
    AND (bar.ts AT TIME ZONE 'UTC')::date <= $1::timestamptz::date
)
SELECT * FROM kr_index UNION ALL SELECT * FROM us_index ORDER BY market_key, bar_date
`;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function numeric(value: string | number, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

// Each model names its number differently; the retraction ledger only needs the
// pair and the value that failed. Mapping here keeps relation-retraction.ts from
// having to know about correlations, cosines, or whatever comes next.
function macroAbsences(
  rows: readonly {
    seriesEntityId: number;
    stockEntityId: number;
    correlation: number;
    overlappingObservations: number;
    lastObservedDate: string;
  }[],
): MeasuredAbsence[] {
  return rows.map((row) => ({
    subjectEntityId: row.seriesEntityId,
    objectEntityId: row.stockEntityId,
    measuredValue: row.correlation,
    detail: {
      overlappingObservations: row.overlappingObservations,
      lastObservedDate: row.lastObservedDate,
    },
  }));
}

function productAbsences(rows: readonly ProductSimilarityMeasuredAbsence[]): MeasuredAbsence[] {
  return rows.map((row) => ({
    subjectEntityId: row.subjectEntityId,
    objectEntityId: row.objectEntityId,
    measuredValue: row.similarityScore,
  }));
}

function etfEntityKey(ticker: string): string {
  return /^\d{6}$/.test(ticker) ? `KR:${ticker}` : `US:${ticker}`;
}

function contractPolicy(definition: SourceDefinition): Record<string, unknown> {
  return {
    providerKey: definition.providerKey,
    sourceTable: definition.sourceTable,
    cadencePolicy: { kind: 'daily_materialized_snapshot', timezone: 'Asia/Seoul' },
    cutoffPolicy: { kind: 'capture_time', no_backdating: true },
    delayPolicy: { state: 'observed_at_capture' },
    correctionPolicy: { mode: 'append_revision' },
    requiredFields: definition.requiredFields,
    licensePolicy: { status: 'allowed', basis: 'internal_materialization' },
    redistributionPolicy: { mode: 'internal_only' },
    rawRetentionPolicy: { mode: 'retain' },
    qualityGatePolicy: {
      require_non_empty: true,
      exact_source_table_disclosure: definition.sourceTable,
      transitional_source: true,
    },
  };
}

async function loadInputs(client: Client): Promise<{
  holdings: EtfHoldingRow[];
  sectors: SectorRow[];
  profiles: CompanyProfileRow[];
  institutionalHoldings: InstitutionalHoldingRow[];
  /** Rows the join above dropped, so an unresolved holder is a number not a silence. */
  institutionalHoldingsTotal: number;
  /** Basket members core identity resolution has deferred; reported, never silent. */
  deferredMemberKeys: string[];
}> {
  const holdings = await client.query<EtfHoldingRow>(LATEST_ETF_HOLDINGS_SQL);
  const sectors = await client.query<SectorRow>(SECTOR_ROWS_SQL);
  const profiles = await client.query<CompanyProfileRow>(COMPANY_PROFILE_ROWS_SQL);
  const institutionalHoldings = await client.query<InstitutionalHoldingRow>(
    INSTITUTIONAL_HOLDINGS_SQL,
  );
  // Deliberately NOT a throw when empty, unlike the three above. Institutional
  // holdings arrive from a sibling project on its own cadence; an empty table is a
  // gap in coverage, not a broken publish, and taking the nightly graph down over
  // it would be the wrong trade.
  const institutionalHoldingsTotal = (
    await client.query<QueryResultRow & { total: number }>(INSTITUTIONAL_HOLDINGS_TOTAL_SQL)
  ).rows[0]!.total;
  if (holdings.rows.length === 0) throw new Error('latest ETF holdings are empty');
  if (sectors.rows.length === 0) throw new Error('SIC/KSIC classifications are empty');
  if (profiles.rows.length === 0) throw new Error('company profile summaries are empty');
  // A basket member without a canonical entity is one core identity resolution
  // has DEFERRED, not one that is broken.
  //
  // run-core-identity-sync classifies an identity as `deferred` when it cannot
  // anchor it yet — "wait for the upstream backfill rather than minting an
  // identity we cannot anchor". Measured 2026-08-05: 13 of 338 eligible
  // identities were deferred for "untrusted or missing company name", and two of
  // them (US:CAT, KR:139130) had just entered ETF baskets. Throwing here turned
  // that designed wait into a pipeline outage — one new ETF constituent stopped
  // the whole daily graph publish.
  //
  // Dropping them silently would be worse than throwing, so they are counted and
  // reported. Nothing real is lost: a member with no canonical entity has no
  // price series either, so it could never have carried an edge.
  const deferredMembers = holdings.rows.filter((row) => row.member_entity_id === null);
  const resolvedHoldings = holdings.rows.filter((row) => row.member_entity_id !== null);
  const deferredMemberKeys = [
    ...new Set(deferredMembers.map((row) => row.member_entity_key)),
  ].sort();
  // Fail-closed backstop: a handful of deferrals is normal operation, a flood is
  // identity resolution itself breaking, and that must still stop the run.
  const deferredShare =
    holdings.rows.length === 0 ? 0 : deferredMembers.length / holdings.rows.length;
  if (deferredShare > 0.05) {
    throw new Error(
      `ETF members lacking canonical core entities exceed the tolerated share: ` +
        `${deferredMembers.length}/${holdings.rows.length} (${deferredMemberKeys.slice(0, 5).join(', ')})`,
    );
  }
  const missingSector = sectors.rows.find((row) => row.subject_entity_id === null);
  if (missingSector)
    throw new Error(`classified stock lacks canonical core entity: ${missingSector.entity_key}`);
  const missingProfile = profiles.rows.find((row) => row.entity_id === null);
  if (missingProfile)
    throw new Error(`company profile lacks canonical core entity: ${missingProfile.entity_key}`);
  return {
    holdings: resolvedHoldings,
    sectors: sectors.rows,
    profiles: profiles.rows,
    institutionalHoldings: institutionalHoldings.rows,
    institutionalHoldingsTotal,
    deferredMemberKeys,
  };
}

/**
 * Load both sides of the co-movement window.
 *
 * Returns empty arrays rather than throwing when a side is missing. The other
 * three builders throw on empty input because their absence means the transitional
 * serving tables broke; this one is additive to a pipeline that already works, and
 * failing the whole publish because a macro collector was late would trade a
 * working graph for a missing one. The run summary reports the counts, so an empty
 * side is visible rather than silent.
 */
async function loadMacroComovementInputs(
  client: Client,
  asOf: string,
): Promise<{
  seriesWindows: MacroSeriesWindow[];
  stockWindows: StockPriceWindow[];
  marketFactors: MarketFactorWindow[];
}> {
  const includedSeries = Object.keys(MACRO_SERIES_TRANSFORMS).sort();
  // Load the widest window any frequency needs; the model trims each series to
  // its own. Loading only the daily 365 left the weekly series with ~52 points,
  // under the 60 minimum, and they produced nothing while still reporting as
  // loaded.
  const windowDays = Math.max(...Object.values(MACRO_WINDOW_DAYS_BY_FREQUENCY));
  const seriesRows = await client.query<MacroSeriesWindowRow>(MACRO_SERIES_WINDOW_SQL, [
    asOf,
    windowDays,
    includedSeries,
  ]);
  const seriesByKey = new Map<string, MacroSeriesWindow>();
  for (const row of seriesRows.rows) {
    const existing = seriesByKey.get(row.series_key);
    const window = existing ?? {
      seriesKey: row.series_key,
      seriesEntityId: numeric(row.series_entity_id, 'seriesEntityId'),
      observations: [] as Array<{ date: string; value: number }>,
    };
    (window.observations as Array<{ date: string; value: number }>).push({
      date: row.observation_date,
      value: row.value,
    });
    seriesByKey.set(row.series_key, window);
  }

  const priceRows = await client.query<StockPriceWindowRow>(STOCK_PRICE_WINDOW_SQL, [
    asOf,
    windowDays,
  ]);
  const stockByEntity = new Map<number, StockPriceWindow>();
  for (const row of priceRows.rows) {
    const stockEntityId = numeric(row.security_entity_id, 'stockEntityId');
    const existing = stockByEntity.get(stockEntityId);
    const window = existing ?? {
      stockEntityId,
      marketKey: row.market,
      observations: [] as Array<{ date: string; close: number }>,
    };
    (window.observations as Array<{ date: string; close: number }>).push({
      date: row.bar_date,
      close: row.close,
    });
    stockByEntity.set(stockEntityId, window);
  }

  const factorRows = await client.query<MarketFactorRow>(MARKET_FACTOR_SQL, [asOf, windowDays]);
  const factorByKey = new Map<string, MarketFactorWindow>();
  for (const row of factorRows.rows) {
    const existing = factorByKey.get(row.market_key);
    const factor = existing ?? {
      marketKey: row.market_key,
      observations: [] as Array<{ date: string; close: number }>,
    };
    (factor.observations as Array<{ date: string; close: number }>).push({
      date: row.bar_date,
      close: row.close,
    });
    factorByKey.set(row.market_key, factor);
  }

  return {
    seriesWindows: [...seriesByKey.values()].sort((left, right) =>
      left.seriesKey.localeCompare(right.seriesKey),
    ),
    stockWindows: [...stockByEntity.values()].sort(
      (left, right) => left.stockEntityId - right.stockEntityId,
    ),
    marketFactors: [...factorByKey.values()].sort((left, right) =>
      left.marketKey.localeCompare(right.marketKey),
    ),
  };
}

/**
 * Register one immutable revision per window that a surviving pair actually used,
 * then turn the pairs into builder observations.
 *
 * Only the endpoints that produced a candidate get a raw object. Minting one for
 * all 325 stocks every day would write roughly a gigabyte a year of price windows
 * that no relation ever cites; the ~13 that a candidate depends on are exactly the
 * provenance the ledger asks for. The trade is recorded here rather than left to
 * be inferred: a pair that fell below the threshold leaves a count in the run
 * summary, not a raw object.
 */
async function materializeMacroComovementSources(
  client: Client,
  plan: MacroComovementPlan,
  windows: {
    seriesWindows: readonly MacroSeriesWindow[];
    stockWindows: readonly StockPriceWindow[];
  },
  naturalRunKey: string,
  token: number,
  capturedAt: string,
): Promise<{
  observations: MacroComovementObservation[];
  manifests: ManifestEntry[];
  replayedRawObjects: number;
}> {
  const manifests: ManifestEntry[] = [];
  let replayedRawObjects = 0;
  if (plan.pairs.length === 0) return { observations: [], manifests, replayedRawObjects };

  const capturedDate = new Date(capturedAt);
  await ensureSource(client, MACRO_SERIES_SOURCE, capturedAt);
  await ensureSource(client, STOCK_PRICE_SOURCE, capturedAt);

  const usedSeriesKeys = [...new Set(plan.pairs.map((pair) => pair.seriesKey))].sort();
  const usedStockEntityIds = [...new Set(plan.pairs.map((pair) => pair.stockEntityId))].sort(
    (left, right) => left - right,
  );
  const seriesByKey = new Map(windows.seriesWindows.map((window) => [window.seriesKey, window]));
  const stockByEntity = new Map(
    windows.stockWindows.map((window) => [window.stockEntityId, window]),
  );

  const macroRun = await openFetchRun(
    client,
    MACRO_SERIES_PROVIDER,
    naturalRunKey,
    token,
    capturedAt,
  );
  const seriesRevisions = new Map<string, { sourceRevisionId: number; availableAt: string }>();
  let macroWritten = 0;
  for (const seriesKey of usedSeriesKeys) {
    const window = seriesByKey.get(seriesKey);
    if (window === undefined) throw new Error(`macro series window missing for ${seriesKey}`);
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: MACRO_SERIES_PROVIDER,
      seriesKey,
      seriesEntityId: window.seriesEntityId,
      vintageSelection: MACRO_COMOVEMENT_MODEL_CONFIG.vintageSelection,
      transform: MACRO_SERIES_TRANSFORMS[seriesKey],
      windowDays: MACRO_COMOVEMENT_MODEL_CONFIG.windowDays,
      asOf: capturedAt,
      observations: window.observations.map((row) => ({ date: row.date, value: row.value })),
    });
    const raw = await writeRawObject({
      providerKey: MACRO_SERIES_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: macroRun.fetchRunId,
      sourceId: macroRun.sourceId,
      providerRecordKey: `macro-series:${seriesKey}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'macro_series_window',
        source_table: MACRO_SERIES_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: MACRO_SERIES_PROVIDER, ref: raw, fetchedAt: capturedDate });
      macroWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    seriesRevisions.set(seriesKey, {
      sourceRevisionId: registered.sourceRevisionId,
      availableAt: registered.sourceAvailableAt,
    });
  }
  await closeFetchRun(
    client,
    macroRun.fetchRunId,
    capturedAt,
    windows.seriesWindows.length,
    macroWritten,
    usedSeriesKeys.length - macroWritten,
    { seriesLoaded: windows.seriesWindows.length, seriesUsed: usedSeriesKeys.length },
  );

  const priceRun = await openFetchRun(
    client,
    STOCK_PRICE_PROVIDER,
    naturalRunKey,
    token,
    capturedAt,
  );
  const stockRevisions = new Map<number, { sourceRevisionId: number; availableAt: string }>();
  let priceWritten = 0;
  for (const stockEntityId of usedStockEntityIds) {
    const window = stockByEntity.get(stockEntityId);
    if (window === undefined) throw new Error(`stock price window missing for ${stockEntityId}`);
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: STOCK_PRICE_PROVIDER,
      stockEntityId,
      priceField: MACRO_COMOVEMENT_MODEL_CONFIG.stockPriceField,
      transform: MACRO_COMOVEMENT_MODEL_CONFIG.stockTransform,
      windowDays: MACRO_COMOVEMENT_MODEL_CONFIG.windowDays,
      asOf: capturedAt,
      observations: window.observations.map((row) => ({ date: row.date, close: row.close })),
    });
    const raw = await writeRawObject({
      providerKey: STOCK_PRICE_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: priceRun.fetchRunId,
      sourceId: priceRun.sourceId,
      providerRecordKey: `stock-prices:${stockEntityId}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'stock_price_window',
        source_table: STOCK_PRICE_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: STOCK_PRICE_PROVIDER, ref: raw, fetchedAt: capturedDate });
      priceWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    stockRevisions.set(stockEntityId, {
      sourceRevisionId: registered.sourceRevisionId,
      availableAt: registered.sourceAvailableAt,
    });
  }
  await closeFetchRun(
    client,
    priceRun.fetchRunId,
    capturedAt,
    windows.stockWindows.length,
    priceWritten,
    usedStockEntityIds.length - priceWritten,
    { stocksLoaded: windows.stockWindows.length, stocksUsed: usedStockEntityIds.length },
  );

  const observations: MacroComovementObservation[] = plan.pairs.map((pair) => {
    const series = seriesRevisions.get(pair.seriesKey)!;
    const stock = stockRevisions.get(pair.stockEntityId)!;
    const availableAt =
      new Date(series.availableAt).getTime() >= new Date(stock.availableAt).getTime()
        ? series.availableAt
        : stock.availableAt;
    return {
      seriesEntityId: pair.seriesEntityId,
      stockEntityId: pair.stockEntityId,
      seriesKey: pair.seriesKey,
      correlation: pair.correlation,
      rawCorrelation: pair.rawCorrelation,
      stockMarketCorrelation: pair.stockMarketCorrelation,
      overlappingObservations: pair.overlappingObservations,
      windowStartDate: pair.firstObservedDate,
      windowEndDate: pair.lastObservedDate,
      modelConfig: plan.modelConfig,
      sourceRevisionIds: [series.sourceRevisionId, stock.sourceRevisionId],
      availableAt,
      // The correlation is a statement about a window, so it becomes true at the
      // last date that contributed to it — not at the moment the job happened to
      // run.
      validFrom: `${pair.lastObservedDate}T00:00:00.000Z`,
    };
  });

  return { observations, manifests, replayedRawObjects };
}

type MacroTopicMappingRow = {
  topic: string;
  seriesKey: string;
  topicEntityId: number;
  seriesEntityId: number;
  /** When the curated mapping row was created — the edge's valid_from. */
  mappingCreatedAt: string;
};

async function loadMacroTopicMappings(
  client: Client,
): Promise<{ rows: MacroTopicMappingRow[]; mappingRowsTotal: number }> {
  const total = await client.query<QueryResultRow & { total: number }>(
    MACRO_TOPIC_MAPPING_TOTAL_SQL,
    [],
  );
  const result = await client.query<
    QueryResultRow & {
      topic: string;
      series_key: string;
      topic_entity_id: string | number;
      series_entity_id: string | number;
      mapping_created_at: Date | string;
    }
  >(MACRO_TOPIC_MAPPING_SQL, []);
  return {
    mappingRowsTotal: Number(total.rows[0]?.total ?? 0),
    rows: result.rows.map((row) => ({
      topic: row.topic,
      seriesKey: row.series_key,
      topicEntityId: numeric(row.topic_entity_id, 'topicEntityId'),
      seriesEntityId: numeric(row.series_entity_id, 'seriesEntityId'),
      mappingCreatedAt: toIso(row.mapping_created_at),
    })),
  };
}

/**
 * Registers the mapping AS ONE snapshot, not one revision per pair.
 *
 * The mapping is a single curated document — a pair does not have provenance
 * separate from the table it lives in, and minting a revision per row would
 * claim each was observed on its own. Every candidate therefore cites the same
 * revision, which is exactly what backs it.
 */
async function materializeMacroTopicSource(
  client: Client,
  mappings: readonly MacroTopicMappingRow[],
  naturalRunKey: string,
  token: number,
  capturedAt: string,
): Promise<{
  observations: MacroTopicObservation[];
  manifests: ManifestEntry[];
  replayedRawObjects: number;
}> {
  if (mappings.length === 0) {
    return { observations: [], manifests: [], replayedRawObjects: 0 };
  }
  const capturedDate = new Date(capturedAt);
  const manifests: ManifestEntry[] = [];
  const run = await openFetchRun(client, MACRO_TOPIC_PROVIDER, naturalRunKey, token, capturedAt);
  const payload = JSON.stringify({
    schemaVersion: 1,
    provider: MACRO_TOPIC_PROVIDER,
    sourceTable: 'analytics.macro_series_topic',
    asOf: capturedAt,
    mappings: mappings.map((row) => ({
      topic: row.topic,
      seriesKey: row.seriesKey,
      topicEntityId: row.topicEntityId,
      seriesEntityId: row.seriesEntityId,
    })),
  });
  const raw = await writeRawObject({
    providerKey: MACRO_TOPIC_PROVIDER,
    content: payload,
    extension: 'json',
    fetchedAt: capturedDate,
  });
  const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
    fetchRunId: run.fetchRunId,
    sourceId: run.sourceId,
    providerRecordKey: 'macro-topic-mapping',
    contentHash: raw.contentHash,
    objectUri: raw.objectUri,
    httpMeta: {
      bytes: raw.bytes,
      kind: 'macro_topic_mapping',
      source_table: 'analytics.macro_series_topic',
    },
    fetchedAt: capturedAt,
  });
  let replayedRawObjects = 0;
  if (registered.rawInserted) {
    manifests.push({ providerKey: MACRO_TOPIC_PROVIDER, ref: raw, fetchedAt: capturedDate });
  } else {
    replayedRawObjects += 1;
  }
  await closeFetchRun(client, run.fetchRunId, capturedAt, mappings.length, 1, 0, {
    mappingsRegistered: mappings.length,
  });

  const observations: MacroTopicObservation[] = mappings.map((row) => ({
    topicEntityId: row.topicEntityId,
    seriesEntityId: row.seriesEntityId,
    topic: row.topic,
    seriesKey: row.seriesKey,
    sourceRevisionId: registered.sourceRevisionId,
    // available_at moves every run and should: it is when WE could see the
    // mapping, and we re-read it each publish.
    availableAt: registered.sourceAvailableAt,
    // valid_from must NOT move. It is when the fact holds, and a curated mapping
    // holds from when it was curated. Reading the snapshot again does not make
    // `topic:energy MEASURED_BY fred:DCOILWTICO` newly true.
    //
    // This carried registered.sourceAvailableAt until 2026-08-06, which advanced
    // with the run clock. appendRelationRevision requires valid_from to match to
    // call a write a replay, so every publish appended 14 fresh revisions with an
    // IDENTICAL payload hash — 84 revisions for 14 unchanging edges across six
    // runs. The retraction hash was deliberately made stable for exactly this
    // reason on the same day and the reasoning was not carried over to here.
    validFrom: row.mappingCreatedAt,
  }));
  return { observations, manifests, replayedRawObjects };
}

async function ensureSource(
  client: Client,
  definition: SourceDefinition,
  knownAt: string,
): Promise<number> {
  await client.query(
    `INSERT INTO ingestion.source (
       provider_key,source_type,tier,license_status,redistribution,enforcement,metadata
     ) VALUES ($1,'internal',1,'allowed','internal_only','hard',$2::jsonb)
     ON CONFLICT (provider_key) DO NOTHING`,
    [
      definition.providerKey,
      JSON.stringify({
        display_name: definition.displayName,
        source_class: 'internal_derived',
        source_table: definition.sourceTable,
        transitional_source: true,
      }),
    ],
  );
  const sourceResult = await client.query<
    QueryResultRow & {
      source_id: string | number;
      source_type: string;
      tier: number;
      license_status: string;
      redistribution: string;
      enforcement: string;
      metadata: Record<string, unknown>;
    }
  >(
    `SELECT source_id,source_type,tier,license_status,redistribution,enforcement,metadata
     FROM ingestion.source WHERE provider_key=$1`,
    [definition.providerKey],
  );
  const source = sourceResult.rows[0];
  if (
    source === undefined ||
    source.source_type !== 'internal' ||
    Number(source.tier) !== 1 ||
    source.license_status !== 'allowed' ||
    source.redistribution !== 'internal_only' ||
    source.enforcement !== 'hard' ||
    source.metadata['source_table'] !== definition.sourceTable ||
    source.metadata['transitional_source'] !== true
  ) {
    throw new Error(`source policy mismatch for ${definition.providerKey}`);
  }
  const sourceId = numeric(source.source_id, 'sourceId');
  const policy = contractPolicy(definition);
  const contentHash = sha256(JSON.stringify(policy));
  const current = await client.query<
    QueryResultRow & {
      source_contract_revision_id: string | number;
      policy_status: string;
      content_hash: string;
    }
  >(
    `SELECT source_contract_revision_id,policy_status,content_hash
     FROM ingestion.source_contract_revision
     WHERE source_id=$1 AND known_to IS NULL
     ORDER BY revision_no DESC LIMIT 1`,
    [sourceId],
  );
  if (current.rows.length === 0) {
    await client.query(
      `INSERT INTO ingestion.source_contract (
         source_id,version,schedule_policy,required_fields,quality_policy,revision_policy,active
       ) VALUES ($1,1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,true)
       ON CONFLICT (source_id,version) DO NOTHING`,
      [
        sourceId,
        JSON.stringify(policy['cadencePolicy']),
        JSON.stringify(definition.requiredFields),
        JSON.stringify(policy['qualityGatePolicy']),
        JSON.stringify(policy['correctionPolicy']),
      ],
    );
    await client.query(
      `INSERT INTO ingestion.source_contract_revision (
         source_id,revision_no,policy_status,cadence_policy,cutoff_policy,delay_policy,
         correction_policy,required_fields,license_policy,redistribution_policy,
         raw_retention_policy,quality_gate_policy,effective_from,known_from,content_hash
       ) VALUES ($1,1,'approved',$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,
                 $7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,'2000-01-01T00:00:00.000Z',$11,$12)`,
      [
        sourceId,
        JSON.stringify(policy['cadencePolicy']),
        JSON.stringify(policy['cutoffPolicy']),
        JSON.stringify(policy['delayPolicy']),
        JSON.stringify(policy['correctionPolicy']),
        JSON.stringify(definition.requiredFields),
        JSON.stringify(policy['licensePolicy']),
        JSON.stringify(policy['redistributionPolicy']),
        JSON.stringify(policy['rawRetentionPolicy']),
        JSON.stringify(policy['qualityGatePolicy']),
        knownAt,
        contentHash,
      ],
    );
  } else if (
    current.rows[0]!.policy_status !== 'approved' ||
    current.rows[0]!.content_hash !== contentHash
  ) {
    throw new Error(`approved immutable contract mismatch for ${definition.providerKey}`);
  }
  return sourceId;
}

async function ensureEntity(
  client: Client,
  input: { entityKey: string; entityType: 'ETF' | 'Industry'; name: string; metadata: object },
): Promise<number> {
  const existing = await client.query<
    QueryResultRow & { entity_id: string | number; entity_type: string }
  >(
    `SELECT entity.entity_id,entity.entity_type
     FROM core.entity_identifier identifier
     JOIN core.entity entity USING(entity_id)
     WHERE identifier.identifier_type='INTERNAL_KEY' AND identifier.identifier_value=$1`,
    [input.entityKey],
  );
  if (existing.rows[0]) {
    const allowedTypes =
      input.entityType === 'ETF' ? new Set(['ETF', 'Stock']) : new Set(['Industry']);
    if (!allowedTypes.has(existing.rows[0].entity_type)) {
      throw new Error(
        `canonical key ${input.entityKey} has incompatible type ${existing.rows[0].entity_type}`,
      );
    }
    return numeric(existing.rows[0].entity_id, 'entityId');
  }
  const inserted = await client.query<QueryResultRow & { entity_id: string | number }>(
    `INSERT INTO core.entity (entity_type,canonical_name,status,metadata)
     VALUES ($1,$2,'active',$3::jsonb) RETURNING entity_id`,
    [input.entityType, input.name, JSON.stringify(input.metadata)],
  );
  const entityId = numeric(inserted.rows[0]!.entity_id, 'entityId');
  await client.query(
    `INSERT INTO core.entity_identifier (entity_id,identifier_type,identifier_value,namespace,valid_from)
     VALUES ($1,'INTERNAL_KEY',$2,'',now())`,
    [entityId, input.entityKey],
  );
  return entityId;
}

async function openFetchRun(
  client: Client,
  providerKey: string,
  naturalRunKey: string,
  token: number,
  startedAt: string,
): Promise<{ fetchRunId: number; sourceId: number }> {
  // The idempotency key MUST carry the provider. This job opens five fetch runs
  // per slot (ETF, sector, profile, macro series, stock price) and they used to
  // share one key, so `ON CONFLICT (idempotency_key) DO UPDATE ... RETURNING`
  // handed every later caller the FIRST run's source_id.
  //
  // Measured on production 2026-08-05: `internal-etf-holdings-snapshot` held
  // 798 transitional_company_profile, 119 transitional_industry_classification,
  // 63 stock_price_window and 18 macro_series_window revisions alongside its own
  // 171, while the four sibling sources — all approved, all created for exactly
  // this — had zero. Every relation's source_revision evidence therefore cited
  // an ETF holdings snapshot: 22,449 SAME_ETF_BASKET, 13,180 PRODUCT_SIMILARITY,
  // 119 CLASSIFIED_AS, 210 MACRO_COMOVEMENT. The payload metadata carried the
  // truth in its `kind`, so nothing was lost — but the ledger, which is what the
  // product treats as authoritative provenance, pointed at the wrong source.
  const runId = `${naturalRunKey}:${providerKey}:fencing-${token}`;
  const result = await client.query<
    QueryResultRow & { fetch_run_id: string | number; source_id: string | number }
  >(OPEN_FETCH_RUN_SQL, [providerKey, runId, runId, startedAt]);
  const row = result.rows[0];
  // The SQL now refuses to reuse a run belonging to a different source, which
  // returns no row. Say why rather than dying on a property of undefined.
  if (row === undefined) {
    throw new Error(
      `fetch run ${runId} exists under a different source than ${providerKey}; refusing to file this run's revisions under it`,
    );
  }
  return {
    fetchRunId: numeric(row.fetch_run_id, 'fetchRunId'),
    sourceId: numeric(row.source_id, 'sourceId'),
  };
}

async function closeFetchRun(
  client: Client,
  fetchRunId: number,
  finishedAt: string,
  rowsRead: number,
  rowsWritten: number,
  rowsSkipped: number,
  summary: object,
): Promise<void> {
  const result = await client.query(CLOSE_FETCH_RUN_SQL, [
    fetchRunId,
    finishedAt,
    'success',
    rowsRead,
    rowsWritten,
    rowsSkipped,
    JSON.stringify({}),
    finishedAt,
    JSON.stringify(summary),
  ]);
  if (result.rowCount !== 1) throw new Error(`fetch run ${fetchRunId} close failed`);
}

async function materializeSources(
  client: Client,
  inputs: {
    holdings: EtfHoldingRow[];
    sectors: SectorRow[];
    profiles: CompanyProfileRow[];
    institutionalHoldings: InstitutionalHoldingRow[];
  },
  naturalRunKey: string,
  token: number,
  capturedAt: string,
): Promise<{
  etfObservations: EtfBasketObservation[];
  sectorObservations: OfficialSectorObservation[];
  productProfiles: ProductSimilarityProfile[];
  ownershipObservations: OwnershipObservation[];
  manifests: ManifestEntry[];
  replayedRawObjects: number;
}> {
  const capturedDate = new Date(capturedAt);
  await ensureSource(client, ETF_SOURCE, capturedAt);
  await ensureSource(client, SECTOR_SOURCE, capturedAt);
  await ensureSource(client, PROFILE_SOURCE, capturedAt);
  await ensureSource(client, HOLDINGS_SOURCE, capturedAt);
  const manifests: ManifestEntry[] = [];
  let replayedRawObjects = 0;

  const etfRows = new Map<string, EtfHoldingRow[]>();
  for (const row of inputs.holdings) {
    const rows = etfRows.get(row.etf_ticker) ?? [];
    rows.push(row);
    etfRows.set(row.etf_ticker, rows);
  }
  const etfRun = await openFetchRun(client, ETF_PROVIDER, naturalRunKey, token, capturedAt);
  const etfObservations: EtfBasketObservation[] = [];
  let etfWritten = 0;
  for (const [ticker, rows] of [...etfRows].sort(([left], [right]) => left.localeCompare(right))) {
    const entityKey = etfEntityKey(ticker);
    const etfEntityId = await ensureEntity(client, {
      entityKey,
      entityType: 'ETF',
      name: rows[0]!.etf_name,
      metadata: { source: ETF_PROVIDER, ticker, transitional_source: true },
    });
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: ETF_PROVIDER,
      etfTicker: ticker,
      etfEntityKey: entityKey,
      asOf: rows[0]!.as_of,
      holdings: rows.map((row) => ({
        entityKey: row.member_entity_key,
        weightPct: row.weight_pct,
        sector: row.sector,
        source: row.source,
      })),
    });
    const raw = await writeRawObject({
      providerKey: ETF_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: etfRun.fetchRunId,
      sourceId: etfRun.sourceId,
      providerRecordKey: `etf:${ticker}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'transitional_etf_snapshot',
        source_table: ETF_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: ETF_PROVIDER, ref: raw, fetchedAt: capturedDate });
      etfWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    const validFrom = `${rows[0]!.as_of}T00:00:00.000Z`;
    for (const row of rows) {
      etfObservations.push({
        etfEntityId,
        memberEntityId: numeric(row.member_entity_id!, 'memberEntityId'),
        sourceRevisionId: registered.sourceRevisionId,
        availableAt: registered.sourceAvailableAt,
        validFrom,
      });
    }
  }
  await closeFetchRun(
    client,
    etfRun.fetchRunId,
    capturedAt,
    inputs.holdings.length,
    etfWritten,
    etfRows.size - etfWritten,
    { etfs: etfRows.size, observations: etfObservations.length },
  );

  const sectorRun = await openFetchRun(client, SECTOR_PROVIDER, naturalRunKey, token, capturedAt);
  const sectorObservations: OfficialSectorObservation[] = [];
  let sectorWritten = 0;
  for (const row of inputs.sectors) {
    const taxonomyKey = `INDUSTRY:${row.taxonomy_system}:${row.taxonomy_code}`;
    const taxonomyEntityId = await ensureEntity(client, {
      entityKey: taxonomyKey,
      entityType: 'Industry',
      name: row.taxonomy_description?.trim() || `${row.taxonomy_system} ${row.taxonomy_code}`,
      metadata: {
        taxonomy_system: row.taxonomy_system,
        taxonomy_code: row.taxonomy_code,
        source: SECTOR_PROVIDER,
        transitional_source: true,
      },
    });
    const sourceValidFrom = row.valid_from === null ? null : toIso(row.valid_from);
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: SECTOR_PROVIDER,
      entityKey: row.entity_key,
      taxonomySystem: row.taxonomy_system,
      taxonomyCode: row.taxonomy_code,
      taxonomyDescription: row.taxonomy_description,
      sourceSystem: row.source_system,
      sourceRef: row.source_ref,
      validFrom: sourceValidFrom,
    });
    const raw = await writeRawObject({
      providerKey: SECTOR_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: sectorRun.fetchRunId,
      sourceId: sectorRun.sourceId,
      providerRecordKey: `classification:${row.entity_key}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'transitional_industry_classification',
        source_table: SECTOR_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: SECTOR_PROVIDER, ref: raw, fetchedAt: capturedDate });
      sectorWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    sectorObservations.push({
      subjectEntityId: numeric(row.subject_entity_id!, 'subjectEntityId'),
      taxonomyEntityId,
      taxonomySystem: row.taxonomy_system,
      taxonomyCode: row.taxonomy_code,
      classificationStatus: 'source_reported',
      sourceRevisionId: registered.sourceRevisionId,
      availableAt: registered.sourceAvailableAt,
      validFrom: sourceValidFrom ?? registered.sourceAvailableAt,
    });
  }
  await closeFetchRun(
    client,
    sectorRun.fetchRunId,
    capturedAt,
    inputs.sectors.length,
    sectorWritten,
    inputs.sectors.length - sectorWritten,
    { observations: sectorObservations.length },
  );

  const profileRun = await openFetchRun(client, PROFILE_PROVIDER, naturalRunKey, token, capturedAt);
  const productProfiles: ProductSimilarityProfile[] = [];
  let profileWritten = 0;
  for (const row of inputs.profiles) {
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: PROFILE_PROVIDER,
      entityKey: row.entity_key,
      entityName: row.entity_name,
      summaryText: row.summary_text,
      profile: row.profile_json,
      sourceRefs: row.source_refs_json,
      availability: row.availability,
      sourceCapturedAt: toIso(row.captured_at),
    });
    const raw = await writeRawObject({
      providerKey: PROFILE_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: profileRun.fetchRunId,
      sourceId: profileRun.sourceId,
      providerRecordKey: `profile:${row.entity_key}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'transitional_company_profile',
        source_table: PROFILE_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: PROFILE_PROVIDER, ref: raw, fetchedAt: capturedDate });
      profileWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    productProfiles.push({
      entityId: numeric(row.entity_id!, 'profileEntityId'),
      text: row.summary_text,
      sourceRevisionId: registered.sourceRevisionId,
      availableAt: registered.sourceAvailableAt,
      validFrom: registered.sourceAvailableAt,
    });
  }
  await closeFetchRun(
    client,
    profileRun.fetchRunId,
    capturedAt,
    inputs.profiles.length,
    profileWritten,
    inputs.profiles.length - profileWritten,
    { profiles: productProfiles.length },
  );
  // ── institutional holdings → ownership observations ──────────────────────
  // One raw object and one source revision per POSITION. See HOLDINGS_SOURCE for
  // why the grain is a position rather than a filing: COMMON_OWNER needs two
  // distinct revisions per pair and filing grain gives it one.
  const holdingsRun = await openFetchRun(
    client,
    HOLDINGS_PROVIDER,
    naturalRunKey,
    token,
    capturedAt,
  );
  const ownershipObservations: OwnershipObservation[] = [];
  let holdingsWritten = 0;
  for (const row of inputs.institutionalHoldings) {
    const ownerEntityId = numeric(row.owner_entity_id, 'ownerEntityId');
    const ownedEntityId = numeric(row.owned_entity_id, 'ownedEntityId');
    // The builder throws on a self-link. A holder that is also an issuer we cover
    // can legitimately appear on both ends (Berkshire Hathaway files 13F and is a
    // security), and that is a real position, not corrupt input — it just cannot
    // be an ownership EDGE between two distinct nodes.
    if (ownerEntityId === ownedEntityId) continue;
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: HOLDINGS_PROVIDER,
      institution: row.institution,
      ownerEntityId,
      ownedEntityKey: row.owned_entity_key,
      asOf: row.as_of,
      filingDate: row.filing_date,
      valueUsd: row.value_usd,
      ratePct: row.rate_pct,
      source: row.source,
    });
    const raw = await writeRawObject({
      providerKey: HOLDINGS_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: holdingsRun.fetchRunId,
      sourceId: holdingsRun.sourceId,
      providerRecordKey: `holding:${row.institution}:${row.owned_entity_key}:${row.as_of}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'transitional_institutional_holdings_snapshot',
        source_table: HOLDINGS_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: HOLDINGS_PROVIDER, ref: raw, fetchedAt: capturedDate });
      holdingsWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    ownershipObservations.push({
      ownerEntityId,
      ownedEntityId,
      ownershipKind: 'institutional_holding',
      sourceRevisionId: registered.sourceRevisionId,
      // filing_date, not as_of — a 13F position is knowable only once filed.
      availableAt: `${row.filing_date}T00:00:00.000Z`,
      validFrom: `${row.as_of}T00:00:00.000Z`,
    });
  }
  await closeFetchRun(
    client,
    holdingsRun.fetchRunId,
    capturedAt,
    inputs.institutionalHoldings.length,
    holdingsWritten,
    inputs.institutionalHoldings.length - holdingsWritten,
    { observations: ownershipObservations.length },
  );

  return {
    etfObservations,
    sectorObservations,
    productProfiles,
    ownershipObservations,
    manifests,
    replayedRawObjects,
  };
}

async function approvedOntologyIds(client: Client): Promise<Record<string, number>> {
  const rows = await client.query<
    QueryResultRow & { predicate: string; predicate_ontology_revision_id: string | number }
  >(
    `SELECT DISTINCT ON (ontology.predicate)
            ontology.predicate,ontology.predicate_ontology_revision_id
     FROM knowledge.predicate_ontology_revision ontology
     WHERE ontology.policy_status='approved'
       AND ontology.effective_from<=now()
       AND ontology.known_from<=now()
     ORDER BY ontology.predicate,ontology.revision_no DESC,ontology.known_from DESC`,
  );
  return Object.fromEntries(
    rows.rows.map((row) => [
      row.predicate,
      numeric(row.predicate_ontology_revision_id, 'predicateOntologyRevisionId'),
    ]),
  );
}

async function insertGraphSnapshot(client: Client, plan: GraphSnapshotPlan): Promise<number> {
  const header = await client.query<QueryResultRow & { graph_snapshot_id: string | number }>(
    `INSERT INTO analytics.graph_snapshot (
       as_of,known_at,builder_version,status,snapshot_digest,edge_count,entity_count,metadata
     ) VALUES ($1,$2,$3,'building',$4,$5,$6,$7::jsonb)
     RETURNING graph_snapshot_id`,
    [
      plan.header.asOf,
      plan.header.knownAt,
      plan.header.builderVersion,
      plan.header.snapshotDigest,
      plan.header.edgeCount,
      plan.header.entityCount,
      JSON.stringify({ writer: 'run-v2-graph-publish', release_commit: RELEASE_COMMIT }),
    ],
  );
  const graphSnapshotId = numeric(header.rows[0]!.graph_snapshot_id, 'graphSnapshotId');
  for (let offset = 0; offset < plan.edges.length; offset += 400) {
    const rows = plan.edges.slice(offset, offset + 400);
    const values: unknown[] = [];
    const tuples = rows.map((edge, index) => {
      const start = index * 8;
      values.push(
        graphSnapshotId,
        edge.relationRevisionId,
        edge.relationIdentityId,
        edge.subjectEntityId,
        edge.objectEntityId,
        edge.predicate,
        edge.relationKind,
        edge.confidence,
      );
      return `(${Array.from({ length: 8 }, (_, column) => `$${start + column + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO analytics.graph_snapshot_edge (
         graph_snapshot_id,relation_revision_id,relation_identity_id,
         subject_entity_id,object_entity_id,predicate,relation_kind,confidence
       ) VALUES ${tuples.join(',')}`,
      values,
    );
  }
  for (let offset = 0; offset < plan.degrees.length; offset += 500) {
    const rows = plan.degrees.slice(offset, offset + 500);
    const values: unknown[] = [];
    const tuples = rows.map((degree, index) => {
      const start = index * 5;
      values.push(
        graphSnapshotId,
        degree.entityId,
        degree.totalDegree,
        JSON.stringify(degree.degreeByPredicate),
        degree.superhubFlag,
      );
      return `(${Array.from({ length: 5 }, (_, column) => `$${start + column + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO analytics.graph_snapshot_degree (
         graph_snapshot_id,entity_id,total_degree,degree_by_predicate,superhub_flag
       ) VALUES ${tuples.join(',')}`,
      values,
    );
  }
  const sealed = await client.query(
    `UPDATE analytics.graph_snapshot
     SET status='sealed',sealed_at=clock_timestamp()
     WHERE graph_snapshot_id=$1 AND status='building'`,
    [graphSnapshotId],
  );
  if (sealed.rowCount !== 1) throw new Error('graph snapshot seal failed');
  return graphSnapshotId;
}

async function loadProjectionInputs(
  client: Client,
  graphSnapshotId: number,
): Promise<{
  edges: RelationGraphProjectionEdge[];
  entities: RelationGraphProjectionEntity[];
}> {
  const edges = await client.query<
    QueryResultRow & {
      relation_revision_id: string | number;
      relation_identity_id: string | number;
      predicate: string;
      subject_entity_id: string | number;
      object_entity_id: string | number;
      confidence: number;
      evidence_ids: Array<string | number> | null;
    }
  >(
    `SELECT snapshot.relation_revision_id,snapshot.relation_identity_id,snapshot.predicate,
            snapshot.subject_entity_id,snapshot.object_entity_id,snapshot.confidence,
            coalesce(array_agg(evidence.relation_evidence_ledger_id ORDER BY evidence.relation_evidence_ledger_id)
              FILTER (WHERE evidence.relation_evidence_ledger_id IS NOT NULL),'{}') AS evidence_ids
     FROM analytics.graph_snapshot_edge snapshot
     JOIN knowledge.relation_revision revision
       ON revision.relation_revision_id=snapshot.relation_revision_id
     LEFT JOIN knowledge.relation_evidence_ledger evidence
       ON evidence.relation_identity_id=snapshot.relation_identity_id
      AND evidence.relation_payload_hash=revision.payload_hash
     WHERE snapshot.graph_snapshot_id=$1
     GROUP BY snapshot.graph_snapshot_edge_id,snapshot.relation_revision_id,
              snapshot.relation_identity_id,snapshot.predicate,snapshot.subject_entity_id,
              snapshot.object_entity_id,snapshot.confidence
     ORDER BY snapshot.relation_revision_id`,
    [graphSnapshotId],
  );
  const entityRows = await client.query<
    QueryResultRow & {
      entity_id: string | number;
      entity_key: string;
      label: string;
    }
  >(
    `SELECT DISTINCT entity.entity_id,identifier.identifier_value AS entity_key,
            entity.canonical_name AS label
     FROM analytics.graph_snapshot_edge snapshot
     JOIN core.entity entity
       ON entity.entity_id IN (snapshot.subject_entity_id,snapshot.object_entity_id)
     JOIN core.entity_identifier identifier
       ON identifier.entity_id=entity.entity_id AND identifier.identifier_type='INTERNAL_KEY'
     WHERE snapshot.graph_snapshot_id=$1
     ORDER BY identifier.identifier_value`,
    [graphSnapshotId],
  );
  return {
    edges: edges.rows.map((row) => ({
      relationRevisionId: numeric(row.relation_revision_id, 'relationRevisionId'),
      relationIdentityId: numeric(row.relation_identity_id, 'relationIdentityId'),
      predicate: row.predicate,
      subjectEntityId: numeric(row.subject_entity_id, 'subjectEntityId'),
      objectEntityId: numeric(row.object_entity_id, 'objectEntityId'),
      confidence: Number(row.confidence),
      evidenceIds: (row.evidence_ids ?? []).map((value) => numeric(value, 'evidenceId')),
    })),
    entities: entityRows.rows.map((row) => ({
      entityId: numeric(row.entity_id, 'entityId'),
      entityKey: row.entity_key,
      label: row.label,
      market: row.entity_key.startsWith('KR:')
        ? ('KR' as const)
        : row.entity_key.startsWith('US:')
          ? ('US' as const)
          : null,
    })),
  };
}

function packSourceItems(projection: RelationGraphProjection): ContentPackSourceItem[] {
  if (
    projection.relationRevisionIds.length === 0 ||
    projection.relationEvidenceLedgerIds.length === 0
  ) {
    throw new Error(`projection ${projection.entityKey} lacks typed lineage anchors`);
  }
  const relationItems = projection.relationRevisionIds.map(
    (relationRevisionId, index): ContentPackSourceItem => ({
      itemKind: 'relation',
      relationRevisionId,
      displayPayload:
        index === 0
          ? { graph: projection.depth1 }
          : {
              lineage: {
                graphSnapshotEntityKey: projection.entityKey,
                relationRevisionId,
              },
            },
      rank: index === 0 ? 1000 : 100 - index,
    }),
  );
  const evidenceItems = projection.relationEvidenceLedgerIds.map(
    (relationEvidenceLedgerId, index): ContentPackSourceItem => ({
      itemKind: 'evidence',
      relationEvidenceLedgerId,
      displayPayload:
        index === 0
          ? { graph: projection.depth2 }
          : {
              lineage: {
                graphSnapshotEntityKey: projection.entityKey,
                relationEvidenceLedgerId,
              },
            },
      rank: index === 0 ? 999 : 50 - index,
    }),
  );
  return [...relationItems, ...evidenceItems];
}

async function publishPacks(
  client: Client,
  projections: RelationGraphProjection[],
  graphSnapshotId: number,
  builderVersion: string,
  builtAt: Date,
): Promise<{ packIds: number[]; itemCount: number }> {
  return publishContentPacks(
    client,
    projections.map((projection) => ({
      entityId: projection.entityId,
      label: projection.entityKey,
      sourceItems: packSourceItems(projection),
    })),
    {
      packKind: PACK_KIND,
      graphSnapshotId,
      builderVersion,
      builtAt,
      freshnessHours: FRESHNESS_HOURS,
      createdBy: 'stock-insight-v2-graph-publisher',
      metadataSource: 'canonical_v2_projection',
      releaseCommit: RELEASE_COMMIT,
      // This publisher owns snapshot creation, so it also retires the snapshots
      // that no longer back a published pack.
      supersedeOrphanSnapshots: true,
    },
  );
}

async function dryRun(client: Client): Promise<void> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const inputs = await loadInputs(client);
    const nowResult = await client.query<QueryResultRow & { now: Date | string }>(
      `SELECT clock_timestamp() AS now`,
    );
    const cutoff = toIso(nowResult.rows[0]!.now);
    const freshUntil = new Date(
      new Date(cutoff).getTime() + FRESHNESS_HOURS * 60 * 60 * 1000,
    ).toISOString();
    // ETF ids are resolved for REAL here, read-only, unlike every other synthetic
    // id in this block. The retraction scope is matched against etfEntityIds
    // recorded in the ledger, so synthetic ids would put every accepted edge out of
    // scope and the dry run would report "0 would retract, 18 held back" whatever
    // the holdings actually say — a number that looks conservative and measures
    // nothing. Measured 2026-08-06: that is exactly what it reported before this,
    // while the apply path had all 18 in scope.
    //
    // A ticker with no entity yet keeps a synthetic id. That is safe for scope: a
    // brand-new ETF cannot be named by an already-accepted edge.
    const dryRunEtfIds = new Map<string, number>();
    const fakeEtfRevisions = new Map<string, number>();
    const etfObservations: EtfBasketObservation[] = [];
    const dryRunEtfTickers = [...new Set(inputs.holdings.map((row) => row.etf_ticker))].sort();
    const existingEtfEntities = await client.query<
      QueryResultRow & { internal_key: string; entity_id: string | number }
    >(
      `SELECT identifier_value AS internal_key, entity_id
         FROM core.entity_identifier
        WHERE identifier_type = 'INTERNAL_KEY' AND identifier_value = ANY($1::text[])`,
      [dryRunEtfTickers.map(etfEntityKey)],
    );
    const etfIdByInternalKey = new Map(
      existingEtfEntities.rows.map((row) => [row.internal_key, Number(row.entity_id)]),
    );
    for (const [index, ticker] of dryRunEtfTickers.entries()) {
      dryRunEtfIds.set(ticker, etfIdByInternalKey.get(etfEntityKey(ticker)) ?? 10_000_000 + index);
      fakeEtfRevisions.set(ticker, 20_000_000 + index);
    }
    for (const row of inputs.holdings) {
      etfObservations.push({
        etfEntityId: dryRunEtfIds.get(row.etf_ticker)!,
        memberEntityId: numeric(row.member_entity_id!, 'memberEntityId'),
        sourceRevisionId: fakeEtfRevisions.get(row.etf_ticker)!,
        availableAt: cutoff,
        validFrom: `${row.as_of}T00:00:00.000Z`,
      });
    }
    const taxonomyIds = new Map<string, number>();
    const sectorObservations: OfficialSectorObservation[] = [];
    for (const [index, row] of inputs.sectors.entries()) {
      const key = `${row.taxonomy_system}:${row.taxonomy_code}`;
      if (!taxonomyIds.has(key)) taxonomyIds.set(key, 30_000_000 + taxonomyIds.size);
      sectorObservations.push({
        subjectEntityId: numeric(row.subject_entity_id!, 'subjectEntityId'),
        taxonomyEntityId: taxonomyIds.get(key)!,
        taxonomySystem: row.taxonomy_system,
        taxonomyCode: row.taxonomy_code,
        classificationStatus: 'source_reported',
        sourceRevisionId: 40_000_000 + index,
        availableAt: cutoff,
        validFrom: row.valid_from === null ? cutoff : toIso(row.valid_from),
      });
    }
    const productProfiles: ProductSimilarityProfile[] = inputs.profiles.map((row, index) => ({
      entityId: numeric(row.entity_id!, 'profileEntityId'),
      text: row.summary_text,
      sourceRevisionId: 80_000_000 + index,
      availableAt: cutoff,
      validFrom: cutoff,
    }));
    const etf = buildEtfBasketCandidates(etfObservations, { asOf: cutoff });
    const sectors = buildOfficialSectorCandidates(sectorObservations, { asOf: cutoff });
    const productDryPlan = planProductSimilarity(productProfiles);
    const products = buildProductSimilarityCandidates(productDryPlan.observations, {
      asOf: cutoff,
    });
    // Real entity ids and real windows; only the source revision ids are stand-ins,
    // because minting them is a write. That keeps the dry run's candidate count
    // the number apply will produce rather than an estimate of it.
    const dryRunOntologyIds = await approvedOntologyIds(client);
    const macroWindows = await loadMacroComovementInputs(client, cutoff);
    const macroPlan = planMacroComovementPairs(
      macroWindows.seriesWindows,
      macroWindows.stockWindows,
      macroWindows.marketFactors,
    );
    const fakeSeriesRevisions = new Map(
      [...new Set(macroPlan.pairs.map((pair) => pair.seriesKey))]
        .sort()
        .map((seriesKey, index) => [seriesKey, 90_000_000 + index] as const),
    );
    const fakeStockRevisions = new Map(
      [...new Set(macroPlan.pairs.map((pair) => pair.stockEntityId))]
        .sort((left, right) => left - right)
        .map((stockEntityId, index) => [stockEntityId, 91_000_000 + index] as const),
    );
    // Read-only: the same decision apply makes, without appending anything.
    const macroRetractionPlan = await planRetractionsFromDatabase(
      client,
      'MACRO_COMOVEMENT',
      macroAbsences(macroPlan.measuredBelowThreshold),
    );
    // The topic mapping needs no materialization to be counted: the candidates
    // depend only on the mapping rows, and the source revision id is the same
    // for all of them. A placeholder id keeps the builder's shape without
    // registering anything.
    const dryRunTopicReady = dryRunOntologyIds['MEASURED_BY'] !== undefined;
    // Loaded and joined either way, so every number below is literally what the
    // database says. Short-circuiting on the pending ontology would report
    // "0 mapping rows", which reads as "there are no mappings" — a different and
    // wrong fact, and the same confusion the macro `skipped` field exists to
    // prevent.
    const topicMappings = await loadMacroTopicMappings(client);
    const productRetractionPlan = await planRetractionsFromDatabase(
      client,
      'PRODUCT_SIMILARITY',
      productAbsences(productDryPlan.measuredBelowThreshold),
    );
    const topicRetractionPlan = await planRetractionsNotInFromDatabase(client, 'MEASURED_BY', {
      holdingPairs: topicMappings.rows.map((row) => ({
        subjectEntityId: row.topicEntityId,
        objectEntityId: row.seriesEntityId,
      })),
      sourceWasRead: dryRunTopicReady,
    });
    // SAME_ETF_BASKET, scoped. holdingPairs is every pair this run produced (any
    // decision, not just accepted) because production means the co-membership was
    // observed; scope is the baskets that survived both the 2-member and
    // degree-cap gates. sourceWasRead requires at least one evaluated basket, so a
    // run that read no holdings retracts nothing instead of retracting all.
    const dryRunEvaluatedEtfIds = etf.evaluatedHubEntityIds ?? [];
    // Loaded and built in the dry run too. Twice today a dry run failed to predict
    // its apply — synthetic ETF ids put every edge out of retraction scope, and a
    // dry-run-only valid_from could not tell a replay from an insert. A predicate
    // that reports nothing until it is applied is the same defect in advance.
    const dryRunSupplyReady =
      (dryRunOntologyIds['SUPPLIES'] ?? 0) > 0 && (dryRunOntologyIds['CUSTOMER_OF'] ?? 0) > 0;
    const dryRunSupplyRows = await client.query<
      QueryResultRow & {
        from_firm_entity_id: string | number;
        to_firm_entity_id: string | number;
        source_revision_id: string | number;
        available_at: Date | string;
        valid_from: Date | string | null;
      }
    >(SUPPLY_RELATION_SQL, []);
    const dryRunSupply = buildSupplyChainCandidates(
      (dryRunSupplyReady ? dryRunSupplyRows.rows : []).map((row) => ({
        supplierEntityId: Number(row.from_firm_entity_id),
        customerEntityId: Number(row.to_firm_entity_id),
        disclosureKind: 'customer_disclosed' as const,
        sourceRevisionId: Number(row.source_revision_id),
        availableAt: toIso(row.available_at),
        validFrom: row.valid_from === null ? toIso(row.available_at) : toIso(row.valid_from),
      })),
      { asOf: cutoff },
    );
    // Ownership. Real entity ids from the same join apply uses; only the revision
    // ids are stand-ins, and they are per-POSITION exactly as apply mints them —
    // COMMON_OWNER needs two distinct revisions per pair, so a single shared
    // placeholder would report zero accepted and apply would report the real
    // number. A dry run that disagrees with its apply is the defect this file
    // keeps finding.
    const dryRunOwnershipReady =
      (dryRunOntologyIds['HELD_BY'] ?? 0) > 0 && (dryRunOntologyIds['COMMON_OWNER'] ?? 0) > 0;
    const dryRunOwnership = buildOwnershipCandidates(
      (dryRunOwnershipReady ? inputs.institutionalHoldings : [])
        .map((row, index) => ({
          ownerEntityId: numeric(row.owner_entity_id, 'ownerEntityId'),
          ownedEntityId: numeric(row.owned_entity_id, 'ownedEntityId'),
          ownershipKind: 'institutional_holding' as const,
          sourceRevisionId: 92_000_000 + index,
          availableAt: `${row.filing_date}T00:00:00.000Z`,
          validFrom: `${row.as_of}T00:00:00.000Z`,
        }))
        .filter((row) => row.ownerEntityId !== row.ownedEntityId),
      { asOf: cutoff },
    );
    // Same filter as apply. A dry run that counts predicates apply will not ship
    // is the disagreement this file keeps finding.
    const dryRunOwnershipShipped = dryRunOwnership.candidates.filter((row) =>
      SHIPPED_OWNERSHIP_PREDICATES.has(row.predicate),
    );
    const etfRetractionPlan = await planRetractionsNotInFromDatabase(client, 'SAME_ETF_BASKET', {
      holdingPairs: etf.candidates.map((candidate) => ({
        subjectEntityId: candidate.subjectEntityId,
        objectEntityId: candidate.objectEntityId,
      })),
      sourceWasRead: dryRunEvaluatedEtfIds.length > 0,
      scope: { metadataKey: 'etfEntityIds', evaluatedValues: dryRunEvaluatedEtfIds },
    });
    const topicCandidates = buildMacroTopicCandidates(
      (dryRunTopicReady ? topicMappings.rows : []).map((row) => ({
        topicEntityId: row.topicEntityId,
        seriesEntityId: row.seriesEntityId,
        topic: row.topic,
        seriesKey: row.seriesKey,
        sourceRevisionId: 1,
        availableAt: cutoff,
        // Real, like the ETF ids above and unlike sourceRevisionId. The dry run
        // exists to predict the apply, and a valid_from that only the dry run uses
        // predicts nothing about whether the write replays or appends.
        validFrom: row.mappingCreatedAt,
      })),
      { asOf: cutoff },
    ).candidates;
    const macro = buildMacroComovementCandidates(
      macroPlan.pairs.map((pair) => ({
        seriesEntityId: pair.seriesEntityId,
        stockEntityId: pair.stockEntityId,
        seriesKey: pair.seriesKey,
        correlation: pair.correlation,
        rawCorrelation: pair.rawCorrelation,
        stockMarketCorrelation: pair.stockMarketCorrelation,
        overlappingObservations: pair.overlappingObservations,
        windowStartDate: pair.firstObservedDate,
        windowEndDate: pair.lastObservedDate,
        modelConfig: macroPlan.modelConfig,
        sourceRevisionIds: [
          fakeSeriesRevisions.get(pair.seriesKey)!,
          fakeStockRevisions.get(pair.stockEntityId)!,
        ],
        availableAt: cutoff,
        validFrom: `${pair.lastObservedDate}T00:00:00.000Z`,
      })),
      { asOf: cutoff },
    );
    const candidates = [...etf.candidates, ...sectors, ...products.candidates, ...macro.candidates];
    const projectionEdges: RelationGraphProjectionEdge[] = candidates.map((candidate, index) => ({
      relationRevisionId: 50_000_000 + index,
      relationIdentityId: 60_000_000 + index,
      predicate: candidate.predicate,
      subjectEntityId: candidate.subjectEntityId,
      objectEntityId: candidate.objectEntityId,
      confidence:
        candidate.predicate === 'CLASSIFIED_AS'
          ? 1
          : candidate.predicate === 'PRODUCT_SIMILARITY'
            ? Number(candidate.metadata['similarityScore'])
            : candidate.predicate === 'MACRO_COMOVEMENT'
              ? Math.abs(Number(candidate.metadata['correlation']))
              : 0.8,
      evidenceIds: candidate.evidence.map(
        (_, evidenceIndex) => 70_000_000 + index * 100 + evidenceIndex,
      ),
    }));
    const entityById = new Map<number, RelationGraphProjectionEntity>();
    for (const row of [
      ...inputs.holdings.map((holding) => ({
        entityId: numeric(holding.member_entity_id!, 'memberEntityId'),
        entityKey: holding.member_entity_key,
        label: holding.member_name,
      })),
      ...inputs.sectors.map((sector) => ({
        entityId: numeric(sector.subject_entity_id!, 'subjectEntityId'),
        entityKey: sector.entity_key,
        label: sector.entity_name,
      })),
      ...inputs.profiles.map((profile) => ({
        entityId: numeric(profile.entity_id!, 'profileEntityId'),
        entityKey: profile.entity_key,
        label: profile.entity_name,
      })),
    ]) {
      entityById.set(row.entityId, {
        ...row,
        market: row.entityKey.startsWith('KR:') ? 'KR' : 'US',
      });
    }
    for (const [key, entityId] of taxonomyIds) {
      entityById.set(entityId, {
        entityId,
        entityKey: `INDUSTRY:${key}`,
        label: key,
        market: null,
      });
    }
    const projections = buildRelationGraphProjections(projectionEdges, [...entityById.values()], {
      graphSnapshotId: 1,
      asOf: cutoff,
      knownAt: cutoff,
      builderVersion: 'v2-dry-run',
      freshUntil,
      marketDataAsOf: null,
    });
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        holdings: inputs.holdings.length,
        etfs: dryRunEtfIds.size,
        classifications: inputs.sectors.length,
        profiles: inputs.profiles.length,
        etfCandidates: etf.candidates.length,
        deferredEtfMembers: inputs.deferredMemberKeys,
        sectorCandidates: sectors.length,
        productCandidates: products.candidates.length,
        productWouldRetractEdges: productRetractionPlan.planned.length,
        productAcceptedEdgesInspected: productRetractionPlan.inspected,
        macroComovement: {
          // Read-only check of the same condition apply guards on, so a dry run
          // answers "would apply actually persist these?" and not just "does the
          // model produce them?".
          ontologyApproved: dryRunOntologyIds['MACRO_COMOVEMENT'] !== undefined,
          seriesLoaded: macroWindows.seriesWindows.length,
          stocksLoaded: macroWindows.stockWindows.length,
          ...macroPlan.diagnostics,
          candidates: macro.candidates.length,
          accepted: macro.candidates.filter((row) => row.targetRevisionStatus === 'accepted')
            .length,
          quarantined: macro.candidates.filter(
            (row) => row.targetRevisionStatus === 'quarantined_unverified',
          ).length,
          // A dry run has to answer "what would this REMOVE", not only what it
          // would add. Retraction is the one operation here that shrinks the
          // graph, so seeing the number before applying matters most.
          wouldRetractEdges: macroRetractionPlan.planned.length,
          acceptedEdgesInspected: macroRetractionPlan.inspected,
        },
        macroTopic: {
          ontologyApproved: dryRunTopicReady,
          mappingRowsTotal: topicMappings.mappingRowsTotal,
          mappingRowsWithoutEntities: topicMappings.mappingRowsTotal - topicMappings.rows.length,
          candidates: topicCandidates.length,
          accepted: topicCandidates.filter((row) => row.targetRevisionStatus === 'accepted').length,
          // MEASURED_BY is closed_world: a pair that left the mapping leaves the
          // graph. Shown before applying, like every other shrinking operation.
          wouldRetractEdges: topicRetractionPlan.wouldRetract,
          acceptedEdgesInspected: topicRetractionPlan.inspected,
        },
        etfBasket: {
          evaluatedBaskets: dryRunEvaluatedEtfIds.length,
          // Read but NOT evaluated: their pairs were suppressed, not found absent.
          capSuppressedBaskets: etf.exclusions.length,
          candidatePairs: etf.candidates.length,
          wouldRetractEdges: etfRetractionPlan.wouldRetract,
          // Missing from today's pairs but not provably measured — at least one
          // contributing basket was uncollected or cap-suppressed. Reported next to
          // wouldRetractEdges because the gap between them is the whole guard:
          // subtraction alone would have retracted all of these too.
          heldBackOutOfScope: etfRetractionPlan.outOfScope,
          acceptedEdgesInspected: etfRetractionPlan.inspected,
        },
        supplyChain: {
          suppliesOntologyApproved: (dryRunOntologyIds['SUPPLIES'] ?? 0) > 0,
          customerOfOntologyApproved: (dryRunOntologyIds['CUSTOMER_OF'] ?? 0) > 0,
          disclosedRelationRows: dryRunSupplyRows.rows.length,
          candidates: dryRunSupply.candidates.length,
          accepted: dryRunSupply.candidates.filter((row) => row.targetRevisionStatus === 'accepted')
            .length,
        },
        ownership: {
          ontologyApproved: dryRunOwnershipReady,
          sourceRows: inputs.institutionalHoldingsTotal,
          resolvedRows: inputs.institutionalHoldings.length,
          candidates: dryRunOwnershipShipped.length,
          accepted: dryRunOwnershipShipped.filter((row) => row.targetRevisionStatus === 'accepted')
            .length,
          quarantined: dryRunOwnershipShipped.filter((row) => row.targetRevisionStatus !== 'accepted')
            .length,
          builtByPredicate: Object.fromEntries(
            ['OWNS', 'HELD_BY', 'COMMON_OWNER'].map((predicate) => [
              predicate,
              dryRunOwnership.candidates.filter((row) => row.predicate === predicate).length,
            ]),
          ),
          heldBackByPackBudget: dryRunOwnership.candidates.length - dryRunOwnershipShipped.length,
          superhubExclusions: dryRunOwnership.exclusions.length,
        },
        exclusions: etf.exclusions.length,
        projectedRoots: projections.length,
        projectedDepth2Edges: projections.reduce((sum, row) => sum + row.depth2.edges.length, 0),
        // The dry run used to stop at edge counts, and that is how a change that
        // looked healthy took the pipeline down on 2026-08-07: the ownership
        // builder reported 1,641 candidates and 0 quarantined, then apply died on
        // `pack US:AAPL exceeds lineage item cap: 672`.
        //
        // CONTENT_PACK_MAX_ITEMS is migration 026's ceiling, enforced in the
        // database, and a pack counts relations AND their evidence. Position-grain
        // source revisions multiply the second term: a COMMON_OWNER pair held by
        // five institutions carries ten evidence rows, so edge count alone cannot
        // predict pack size. Measure the thing the cap actually measures.
        packItems: (() => {
          // The projections above are built from the graph AS IT IS, so they do
          // not contain this run's new candidates. Reporting their sizes alone
          // would be the same lie in a new place — it read `max: 275` on the very
          // run whose apply died at 672.
          //
          // So the candidates are added back in. Every candidate contributes one
          // relation item and one evidence item per source revision, to the pack
          // of BOTH endpoints.
          //
          // THIS OVER-COUNTS, deliberately and in the safe direction. Only the
          // three predicates in relation-graph-projector-v2's DIRECT_PREDICATES
          // (SAME_ETF_BASKET, PRODUCT_SIMILARITY, COMMON_OWNER) ever become pack
          // items, but every shipped candidate is charged here — HELD_BY and the
          // supply-chain pair reach impact paths, not packs, so their cost is
          // counted and never materialises. The estimate is therefore an upper
          // bound, not a prediction: `overCap: 0` is trustworthy, a non-zero
          // `overCap` warrants checking which predicate it came from before
          // treating it as a blocker.
          const added = new Map<number, number>();
          for (const candidate of [...dryRunOwnershipShipped, ...dryRunSupply.candidates]) {
            const cost = 1 + candidate.evidence.length;
            for (const entityId of [candidate.subjectEntityId, candidate.objectEntityId]) {
              added.set(entityId, (added.get(entityId) ?? 0) + cost);
            }
          }
          const sizes = projections.map((projection) => {
            const entity = [...entityById.values()].find(
              (row) => row.entityKey === projection.entityKey,
            );
            const current =
              projection.relationRevisionIds.length + projection.relationEvidenceLedgerIds.length;
            return {
              entityKey: projection.entityKey,
              items: current + (entity === undefined ? 0 : (added.get(entity.entityId) ?? 0)),
            };
          });
          const overCap = sizes.filter((row) => row.items > CONTENT_PACK_MAX_ITEMS);
          return {
            cap: CONTENT_PACK_MAX_ITEMS,
            max: sizes.reduce((most, row) => Math.max(most, row.items), 0),
            overCap: overCap.length,
            // Named, because "3 packs are over" is not something anyone can act on.
            worst: sizes
              .sort((left, right) => right.items - left.items)
              .slice(0, 5)
              .map((row) => `${row.entityKey}:${row.items}`),
          };
        })(),
      }),
    );
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function apply(client: Client): Promise<void> {
  const slotResult = await client.query<QueryResultRow & { slot: string }>(
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS slot`,
  );
  const slot = slotResult.rows[0]!.slot;
  const naturalRunKey = `v2-graph-publish:${slot}${SLOT_SUFFIX}`;
  const claimedBy = `${hostname()}:${process.pid}:${RELEASE_COMMIT}`;
  const claimResult = await client.query<
    QueryResultRow & { claimed: boolean; fencing_token: string | number; owner: string }
  >(`SELECT * FROM ops.claim_pipeline_run($1,$2,$3,$4)`, [
    naturalRunKey,
    'serving.entity_relation_graph_v2',
    claimedBy,
    3600,
  ]);
  const claim = claimResult.rows[0]!;
  const token = numeric(claim.fencing_token, 'fencingToken');
  if (!claim.claimed) {
    const existing = await client.query<
      QueryResultRow & { claim_status: string; completed_at: Date | string | null }
    >(
      `SELECT claim_status,completed_at
       FROM ops.pipeline_run_claim
       WHERE natural_run_key=$1`,
      [naturalRunKey],
    );
    const current = existing.rows[0];
    if (current?.claim_status !== 'completed' || current.completed_at === null) {
      throw new Error(`v2 graph publish claim is owned by another active run: ${claim.owner}`);
    }
    console.log(
      JSON.stringify({
        mode: 'apply',
        outcome: 'already_completed',
        naturalRunKey,
        fencingToken: token,
        claimOwner: claim.owner,
        completedAt: toIso(current.completed_at),
      }),
    );
    return;
  }
  const manifests: ManifestEntry[] = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(`SET LOCAL lock_timeout='5s'`);
    await client.query(`SET LOCAL statement_timeout='20min'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout='20min'`);
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('stock-insight-v2-publisher',0))`,
    );
    const captured = await client.query<QueryResultRow & { captured_at: Date | string }>(
      `SELECT clock_timestamp() AS captured_at`,
    );
    const capturedAt = toIso(captured.rows[0]!.captured_at);
    const inputs = await loadInputs(client);
    const materialized = await materializeSources(client, inputs, naturalRunKey, token, capturedAt);
    manifests.push(...materialized.manifests);
    const etfBuilt = buildEtfBasketCandidates(materialized.etfObservations, { asOf: capturedAt });
    const sectorBuilt = buildOfficialSectorCandidates(materialized.sectorObservations, {
      asOf: capturedAt,
    });
    // planProductSimilarity, not buildProductSimilarityObservations: the apply
    // path needs what the run REJECTED as well as what it accepted.
    const productPlan = planProductSimilarity(materialized.productProfiles);
    const productBuilt = buildProductSimilarityCandidates(productPlan.observations, {
      asOf: capturedAt,
    });
    if (etfBuilt.exclusions.length > 0) {
      throw new Error(`ETF superhub exclusions require review: ${etfBuilt.exclusions.length}`);
    }
    const ontologyIds = await approvedOntologyIds(client);

    // The macro stage is skipped whole until migration 066 approves the
    // predicate. This is not defensive style — it is load-bearing. This whole
    // function runs inside ONE transaction that also builds the graph snapshot
    // and publishes the content packs, and persistRelationCandidates THROWS
    // ("no approved predicate ontology revision id configured") rather than
    // quarantining when a predicate has no approved ontology row. Without this
    // guard, deploying the builder before applying 066 takes down the entire
    // daily publish, not just the macro edges.
    //
    // The order matters too: the check comes before materializeMacroComovementSources,
    // so a skipped run writes no raw objects and opens no fetch run for candidates
    // that could not have been persisted anyway.
    const macroOntologyRevisionId = ontologyIds['MACRO_COMOVEMENT'] ?? 0;
    const macroReady = Number.isSafeInteger(macroOntologyRevisionId) && macroOntologyRevisionId > 0;
    const macroWindows = macroReady
      ? await loadMacroComovementInputs(client, capturedAt)
      : { seriesWindows: [], stockWindows: [], marketFactors: [] };
    const macroPlan = planMacroComovementPairs(
      macroWindows.seriesWindows,
      macroWindows.stockWindows,
      macroWindows.marketFactors,
    );
    const macroMaterialized = await materializeMacroComovementSources(
      client,
      macroPlan,
      macroWindows,
      naturalRunKey,
      token,
      capturedAt,
    );
    manifests.push(...macroMaterialized.manifests);
    const macroBuilt = buildMacroComovementCandidates(macroMaterialized.observations, {
      asOf: capturedAt,
    });
    // Same skip contract as MACRO_COMOVEMENT: persistRelationCandidates THROWS
    // when a predicate has no approved ontology, and this whole function is one
    // transaction, so publishing before migration 068 is applied would roll back
    // the entire day rather than just this predicate.
    const topicOntologyRevisionId = ontologyIds['MEASURED_BY'] ?? 0;
    const topicReady = Number.isSafeInteger(topicOntologyRevisionId) && topicOntologyRevisionId > 0;
    // Loaded and joined either way so the summary is literal; only the WRITE is
    // withheld when the ontology is pending.
    const topicMappings = await loadMacroTopicMappings(client);
    const topicMaterialized = await materializeMacroTopicSource(
      client,
      topicReady ? topicMappings.rows : [],
      naturalRunKey,
      token,
      capturedAt,
    );
    manifests.push(...topicMaterialized.manifests);
    const topicBuilt = buildMacroTopicCandidates(topicMaterialized.observations, {
      asOf: capturedAt,
    });
    const sectorPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      sectorBuilt,
      { predicateOntologyRevisionIds: ontologyIds, confidence: 1 },
    );
    // Was a flat 0.8 for every pair. The builder now derives it from the tightest
    // basket the pair shares, because 80% of these edges come from 50+ name index
    // funds where co-membership only says "both are large caps" — and at 0.8 that
    // outranked every measured relationship in the graph.
    const etfPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      etfBuilt.candidates,
      {
        predicateOntologyRevisionIds: ontologyIds,
        confidence: (candidate) => Number(candidate.metadata['basketConfidence']),
      },
    );
    const productPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      productBuilt.candidates,
      {
        predicateOntologyRevisionIds: ontologyIds,
        confidence: (candidate) => Number(candidate.metadata['similarityScore']),
      },
    );
    // Confidence takes the magnitude; the sign lives in metadata.correlation.
    // A -0.9 relation is as strong an observation as a +0.9 one, and folding the
    // sign into confidence would rank "moved opposite" as near-worthless.
    const macroPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      macroBuilt.candidates,
      {
        predicateOntologyRevisionIds: ontologyIds,
        confidence: (candidate) => Math.abs(Number(candidate.metadata['correlation'])),
      },
    );
    // Confidence 1: the mapping is a curated definition, so there is no measured
    // strength to scale by. Same treatment as CLASSIFIED_AS, for the same reason.
    const topicPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      topicBuilt.candidates,
      { predicateOntologyRevisionIds: ontologyIds, confidence: 1 },
    );
    // B2 — supply disclosures. The builder emits BOTH directions per observation,
    // so BOTH ontologies have to be approved before any candidate is produced:
    // persistRelationCandidates throws rather than quarantining on a missing
    // ontology, and this whole function is one transaction, so one unapproved
    // predicate would roll back the entire day's publish. Same skip contract as
    // MACRO_COMOVEMENT and MEASURED_BY, for the same reason.
    const suppliesOntologyRevisionId = ontologyIds['SUPPLIES'] ?? 0;
    const customerOfOntologyRevisionId = ontologyIds['CUSTOMER_OF'] ?? 0;
    const supplyReady =
      Number.isSafeInteger(suppliesOntologyRevisionId) &&
      suppliesOntologyRevisionId > 0 &&
      Number.isSafeInteger(customerOfOntologyRevisionId) &&
      customerOfOntologyRevisionId > 0;
    // Loaded either way so the summary reports what the table holds rather than
    // what the guard allowed through — the same reason the macro topic mapping is
    // read before its readiness check.
    const supplyRows = await client.query<
      QueryResultRow & {
        from_firm_entity_id: string | number;
        to_firm_entity_id: string | number;
        source_revision_id: string | number;
        available_at: Date | string;
        valid_from: Date | string | null;
      }
    >(SUPPLY_RELATION_SQL, []);
    const supplyObservations: SupplyChainObservation[] = (supplyReady ? supplyRows.rows : []).map(
      (row) => ({
        supplierEntityId: Number(row.from_firm_entity_id),
        customerEntityId: Number(row.to_firm_entity_id),
        // The reporting issuer is the SUPPLIER and the named party is the
        // CUSTOMER: Korean 매출처 disclosure names who the filer sells to. Raising
        // this to both_disclosed requires the same pair out of the counterparty's
        // own report, which is a judgement to make after full collection.
        disclosureKind: 'customer_disclosed',
        sourceRevisionId: Number(row.source_revision_id),
        availableAt: toIso(row.available_at),
        validFrom: row.valid_from === null ? toIso(row.available_at) : toIso(row.valid_from),
      }),
    );
    // Ownership. OWNS/HELD_BY/COMMON_OWNER have been approved since migration 024
    // and the builder fully tested since B6; what it never had was an owner node.
    // Gated on the ontology the same way the others are, so a pending approval
    // produces nothing rather than quarantine noise.
    const ownershipReady =
      ontologyIds['HELD_BY'] !== undefined && ontologyIds['COMMON_OWNER'] !== undefined;
    const ownershipBuilt = buildOwnershipCandidates(
      ownershipReady ? materialized.ownershipObservations : [],
      { asOf: capturedAt },
    );
    const ownershipShipped = {
      ...ownershipBuilt,
      candidates: ownershipBuilt.candidates.filter((row) => SHIPPED_OWNERSHIP_PREDICATES.has(row.predicate)),
    };
    // Confidence 1, same reasoning as the supply disclosure below: a filed
    // position is an assertion by the filer, not a measurement with a strength.
    // COMMON_OWNER carries no correlation and makes no claim that the two
    // securities move together — only that one institution reported both.
    const ownershipPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      ownershipShipped.candidates,
      { predicateOntologyRevisionIds: ontologyIds, confidence: 1 },
    );
    const supplyBuilt = buildSupplyChainCandidates(supplyObservations, { asOf: capturedAt });
    // Confidence 1: a disclosure is an assertion by the filer, not a measurement
    // with a strength. What is uncertain here is our name resolution, and that
    // uncertainty belongs in the resolver's rejections rather than smuggled into a
    // confidence number that would read as measured.
    const supplyPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      supplyBuilt.candidates,
      { predicateOntologyRevisionIds: ontologyIds, confidence: 1 },
    );
    // Retract before the snapshot is planned, so the snapshot reflects this
    // run's verdicts rather than the union of every run that ever accepted a
    // pair. Only pairs this run measured and found below threshold are touched.
    // When the ontology is not approved the windows are empty, the plan measures
    // nothing, and this retracts nothing — a skipped macro step must not read as
    // "every macro pair stopped holding".
    const macroRetraction = await retractEdges(
      client as unknown as PoolClient,
      'MACRO_COMOVEMENT',
      'macro-comovement-below-threshold',
      macroAbsences(macroPlan.measuredBelowThreshold),
    );
    // PRODUCT_SIMILARITY is scored exhaustively too, so the same rule applies:
    // a pair the run scored below threshold no longer holds. Measured
    // 2026-08-05, 633 of its 2,487 accepted edges came from runs that no longer
    // produce them — 25% of the predicate, against 18 for SAME_ETF_BASKET.
    const productRetraction = await retractEdges(
      client as unknown as PoolClient,
      'PRODUCT_SIMILARITY',
      'product-similarity-below-threshold',
      productAbsences(productPlan.measuredBelowThreshold),
    );
    // MEASURED_BY declares closed_world because analytics.macro_series_topic IS
    // its world — a topic with no row has no series. So a pair that leaves the
    // mapping has to leave the graph, and this is the enumeration form: the
    // current mapping is handed over and the complement is retracted.
    //
    // sourceWasRead is topicReady: when the ontology is pending the mapping is
    // never consulted, and a skipped step must retract nothing rather than
    // everything.
    const topicRetraction = await retractEdgesNotIn(
      client as unknown as PoolClient,
      'MEASURED_BY',
      'macro-topic-mapping-absent',
      {
        holdingPairs: topicMappings.rows.map((row) => ({
          subjectEntityId: row.topicEntityId,
          objectEntityId: row.seriesEntityId,
        })),
        sourceWasRead: topicReady,
      },
    );
    // Same shape, scoped per basket. See the dry-run twin for why holdingPairs is
    // every produced candidate and why the scope excludes cap-suppressed baskets.
    const evaluatedEtfIds = etfBuilt.evaluatedHubEntityIds ?? [];
    const etfRetraction = await retractEdgesNotIn(
      client as unknown as PoolClient,
      'SAME_ETF_BASKET',
      'etf-basket-co-membership-absent',
      {
        holdingPairs: etfBuilt.candidates.map((candidate) => ({
          subjectEntityId: candidate.subjectEntityId,
          objectEntityId: candidate.objectEntityId,
        })),
        sourceWasRead: evaluatedEtfIds.length > 0,
        scope: { metadataKey: 'etfEntityIds', evaluatedValues: evaluatedEtfIds },
      },
    );
    const known = await client.query<QueryResultRow & { known_at: Date | string }>(
      // Rounded UP to the next millisecond, not read raw.
      //
      // knownAt travels through toIso(), and Date.toISOString() truncates to
      // milliseconds. A revision written microseconds earlier in the same
      // millisecond therefore ends up with known_from GREATER than the snapshot's
      // knownAt, and the selector's `newer.known_from <= knownAt` excludes it —
      // so the newer verdict is invisible and the older one survives.
      //
      // Measured on production 2026-08-05: retraction written at
      // 09:39:57.950212, snapshot knownAt truncated to 09:39:57.950000, and one
      // of eight retracted PRODUCT_SIMILARITY edges stayed in snapshot 25.
      // Retraction is the last write before the snapshot, so it is the most
      // exposed to this, but any same-millisecond revision was at risk.
      `SELECT date_trunc('milliseconds', clock_timestamp()) + interval '1 millisecond' AS known_at`,
    );
    const knownAt = toIso(known.rows[0]!.known_at);
    const builderVersion = `v2-publish:${RELEASE_COMMIT}:${slot}:f${token}`;
    const plan = await planGraphSnapshotFromDatabase(client, {
      asOf: capturedAt,
      knownAt,
      builderVersion,
      superhubDegreeThreshold: SUPERHUB_DEGREE_THRESHOLD,
    });
    const graphSnapshotId = await insertGraphSnapshot(client, plan);
    const projectionInputs = await loadProjectionInputs(client, graphSnapshotId);
    const builtAt = new Date(knownAt);
    const projections = buildRelationGraphProjections(
      projectionInputs.edges,
      projectionInputs.entities,
      {
        graphSnapshotId,
        asOf: plan.header.asOf,
        knownAt: plan.header.knownAt,
        builderVersion,
        freshUntil: new Date(builtAt.getTime() + FRESHNESS_HOURS * 60 * 60 * 1000).toISOString(),
        marketDataAsOf: null,
      },
    );
    if (projections.length === 0) throw new Error('no displayable v2 graph projections were built');
    const published = await publishPacks(
      client,
      projections,
      graphSnapshotId,
      builderVersion,
      builtAt,
    );
    const finished = await client.query<QueryResultRow & { finished: boolean }>(
      `SELECT ops.finish_pipeline_run($1,$2,$3,'completed') AS finished`,
      [naturalRunKey, claimedBy, token],
    );
    if (!finished.rows[0]!.finished) throw new Error('pipeline claim finish was fenced out');
    await client.query('COMMIT');
    for (const manifest of manifests) {
      await appendRawObjectManifest(manifest).catch((error: unknown) =>
        process.stderr.write(`raw object manifest append skipped: ${String(error)}\n`),
      );
    }
    console.log(
      JSON.stringify({
        mode: 'apply',
        outcome: 'completed',
        naturalRunKey,
        fencingToken: token,
        graphSnapshotId,
        snapshotDigest: plan.header.snapshotDigest,
        snapshotEdges: plan.header.edgeCount,
        snapshotEntities: plan.header.entityCount,
        projectedRoots: projections.length,
        contentPacks: published.packIds.length,
        contentPackItems: published.itemCount,
        deferredEtfMembers: inputs.deferredMemberKeys,
        sectorCandidates: sectorBuilt.length,
        etfCandidates: etfBuilt.candidates.length,
        productCandidates: productBuilt.candidates.length,
        // Split, not totalled. One number cannot distinguish "the builder found
        // nothing" from "it found plenty and the gate quarantined all of it",
        // and those call for opposite next steps.
        macroComovement: {
          // Loud, not silent: a skipped stage must be readable in the run log, or
          // "0 edges" gets misread as "the builder found nothing".
          skipped: macroReady ? null : 'ontology_not_approved_migration_066_pending',
          seriesLoaded: macroWindows.seriesWindows.length,
          stocksLoaded: macroWindows.stockWindows.length,
          ...macroPlan.diagnostics,
          candidates: macroBuilt.candidates.length,
          accepted: macroBuilt.candidates.filter((row) => row.targetRevisionStatus === 'accepted')
            .length,
          quarantined: macroBuilt.candidates.filter(
            (row) => row.targetRevisionStatus === 'quarantined_unverified',
          ).length,
          inserted: macroPersisted.persisted.filter((row) => row.outcome === 'inserted').length,
          replayed: macroPersisted.persisted.filter((row) => row.outcome === 'replayed').length,
          // Edges this run removed because it measured the pair and it no longer
          // qualified. Reported rather than silent: a shrinking graph must be
          // visible in the run summary, not discovered later from a count.
          retractedEdges: macroRetraction.retracted,
          retractionsAlreadyStanding: macroRetraction.replayed,
          acceptedEdgesInspected: macroRetraction.inspected,
        },
        macroTopic: {
          ontologyApproved: topicReady,
          mappingRowsTotal: topicMappings.mappingRowsTotal,
          // Mapping rows whose topic or series has no core.entity. Counted, not
          // dropped in silence — a mapping that cannot reach the graph is a gap
          // in 065/067/068, not a non-event.
          mappingRowsWithoutEntities: topicMappings.mappingRowsTotal - topicMappings.rows.length,
          candidates: topicBuilt.candidates.length,
          accepted: topicBuilt.candidates.filter((row) => row.targetRevisionStatus === 'accepted')
            .length,
          quarantined: topicBuilt.candidates.filter(
            (row) => row.targetRevisionStatus === 'quarantined_unverified',
          ).length,
          inserted: topicPersisted.persisted.filter((row) => row.outcome === 'inserted').length,
          replayed: topicPersisted.persisted.filter((row) => row.outcome === 'replayed').length,
          // MEASURED_BY is closed_world: a pair that left the mapping leaves the
          // graph. Reported next to the additions so a shrinking predicate is
          // visible in the same place as a growing one.
          retractedEdges: topicRetraction.retracted,
          retractionsAlreadyStanding: topicRetraction.replayed,
          acceptedEdgesInspected: topicRetraction.inspected,
        },
        productSimilarity: {
          candidates: productBuilt.candidates.length,
          // The one operation here that shrinks the graph. Reported next to the
          // additions so a run that removes more than it adds is visible.
          retractedEdges: productRetraction.retracted,
          retractionsAlreadyStanding: productRetraction.replayed,
          acceptedEdgesInspected: productRetraction.inspected,
          scoredBelowThreshold: productPlan.measuredBelowThreshold.length,
        },
        etfBasket: {
          evaluatedBaskets: evaluatedEtfIds.length,
          capSuppressedBaskets: etfBuilt.exclusions.length,
          candidatePairs: etfBuilt.candidates.length,
          retractedEdges: etfRetraction.retracted,
          retractionsAlreadyStanding: etfRetraction.replayed,
          // The guard, as a number. Compare with the dry run's heldBackOutOfScope:
          // these are the pairs a subtraction would have retracted without proof.
          heldBackOutOfScope: etfRetraction.outOfScope,
          acceptedEdgesInspected: etfRetraction.inspected,
        },
        supplyChain: {
          // The two ontologies the builder needs. Reported rather than assumed:
          // an unapproved predicate here rolls back the whole publish, so which
          // gate was open has to be answerable from the run's own output.
          suppliesOntologyApproved: suppliesOntologyRevisionId > 0,
          customerOfOntologyApproved: customerOfOntologyRevisionId > 0,
          // What the table holds, regardless of the guard. A skipped step must not
          // report "there are no supply relations".
          disclosedRelationRows: supplyRows.rows.length,
          observations: supplyObservations.length,
          candidates: supplyBuilt.candidates.length,
          accepted: supplyBuilt.candidates.filter((row) => row.targetRevisionStatus === 'accepted')
            .length,
          inserted: supplyPersisted.persisted.filter((row) => row.outcome === 'inserted').length,
          replayed: supplyPersisted.persisted.filter((row) => row.outcome === 'replayed').length,
        },
        ownership: {
          ontologyApproved: ownershipReady,
          // What the sibling table holds against what survived the join to core
          // entities. A holder or security with no core node drops here, and the
          // gap has to be a number rather than a silence.
          sourceRows: inputs.institutionalHoldingsTotal,
          resolvedRows: inputs.institutionalHoldings.length,
          observations: materialized.ownershipObservations.length,
          candidates: ownershipShipped.candidates.length,
          accepted: ownershipShipped.candidates.filter(
            (row) => row.targetRevisionStatus === 'accepted',
          ).length,
          quarantined: ownershipShipped.candidates.filter(
            (row) => row.targetRevisionStatus !== 'accepted',
          ).length,
          // Built vs shipped, both reported. A predicate held back by the pack
          // budget must be a number here, not an absence.
          builtByPredicate: Object.fromEntries(
            ['OWNS', 'HELD_BY', 'COMMON_OWNER'].map((predicate) => [
              predicate,
              ownershipBuilt.candidates.filter((row) => row.predicate === predicate).length,
            ]),
          ),
          heldBackByPackBudget: ownershipBuilt.candidates.length - ownershipShipped.candidates.length,
          superhubExclusions: ownershipBuilt.exclusions.length,
          inserted: ownershipPersisted.persisted.filter((row) => row.outcome === 'inserted').length,
          replayed: ownershipPersisted.persisted.filter((row) => row.outcome === 'replayed').length,
        },
        insertedRelationRevisions: [
          ...sectorPersisted.persisted,
          ...etfPersisted.persisted,
          ...productPersisted.persisted,
          ...macroPersisted.persisted,
          ...topicPersisted.persisted,
          ...supplyPersisted.persisted,
        ].filter((row) => row.outcome === 'inserted').length,
        // topicPersisted was missing here while being counted in the inserted
        // total, so MEASURED_BY replays were invisible — and a replay becoming
        // visible is exactly how the valid_from fix gets confirmed.
        replayedRelationRevisions: [
          ...sectorPersisted.persisted,
          ...etfPersisted.persisted,
          ...productPersisted.persisted,
          ...macroPersisted.persisted,
          ...topicPersisted.persisted,
          ...supplyPersisted.persisted,
        ].filter((row) => row.outcome === 'replayed').length,
        replayedRawObjects: materialized.replayedRawObjects + macroMaterialized.replayedRawObjects,
      }),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client
      .query(`SELECT ops.finish_pipeline_run($1,$2,$3,'failed')`, [naturalRunKey, claimedBy, token])
      .catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    if (APPLY) await apply(client);
    else await dryRun(client);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
