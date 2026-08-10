import { createHash } from 'node:crypto';

import {
  planK4OutcomeRows,
  type K4MarketIntelligenceInput,
  type K4MarketIntelligencePlan,
  type K4RuleInput,
} from './k4-market-intelligence-plan.ts';
import { type K4OutcomePlan } from './k4-market-intelligence-writer.ts';

export type K4QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
};

export type K4QueryClient = {
  query: (sql: string, params?: readonly unknown[]) => Promise<K4QueryResult>;
};

export type K4WriteMode = 'apply' | 'rehearse';

export async function withK4MarketIntelligenceTransaction<T>(
  client: K4QueryClient,
  options: { mode: K4WriteMode; cutoff: string },
  operation: () => Promise<T>,
): Promise<T> {
  const cutoff = new Date(options.cutoff);
  if (Number.isNaN(cutoff.valueOf()) || cutoff.toISOString() !== options.cutoff) {
    throw new Error('K4 cutoff must be a canonical ISO timestamp');
  }
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `k4-market-intelligence:${options.cutoff}`,
    ]);
    const result = await operation();
    await client.query(options.mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

const SEMANTIC_SNAPSHOT_SQL = `
/* k4_semantic_snapshot */
SELECT semantic_snapshot_id
  FROM governance.semantic_snapshot
 WHERE snapshot_state IN ('sealed','superseded')
   AND (
     (construction_mode='live_observed' AND created_at <= $1::timestamptz)
     OR
     (construction_mode='historical_reconstruction'
       AND knowledge_cutoff <= $1::timestamptz)
   )
 ORDER BY CASE WHEN construction_mode='historical_reconstruction'
               THEN knowledge_cutoff ELSE created_at END DESC,
          semantic_snapshot_id DESC
 LIMIT 1
`;

const SECURITY_UNIVERSE_SQL = `
/* k4_security_universe */
WITH requested AS (
  -- The served universe, not a hand-picked list. K4 used to take ten (market,
  -- ticker) pairs passed in as arrays, which made it structurally a semiconductor
  -- validation harness rather than a market-intelligence stage. Ordering by the
  -- entity id keeps the selection reproducible under a limit.
  SELECT row_number() OVER (ORDER BY security.security_entity_id) AS cohort_ordinal,
         security.security_entity_id
    FROM core.v_security_universe security
)
SELECT requested.security_entity_id,
       identity.issuer_entity_id,
       identity.security_issuer_identity_id,
       coalesce(issuer_assignment.sector_playbook_id,
                legacy_security_assignment.sector_playbook_id) AS sector_playbook_id
  FROM requested
  LEFT JOIN LATERAL (
    SELECT candidate.issuer_entity_id,
           candidate.security_issuer_identity_id
      FROM core.security_issuer_identity candidate
     WHERE candidate.security_entity_id=requested.security_entity_id
       AND candidate.valid_from <= $1::timestamptz
       AND candidate.known_from <= $1::timestamptz
     ORDER BY candidate.known_from DESC, candidate.valid_from DESC,
              candidate.security_issuer_identity_id DESC
     LIMIT 1
  ) identity ON true
  LEFT JOIN LATERAL (
    SELECT assignment.sector_playbook_id
      FROM governance.playbook_assignment assignment
      JOIN governance.sector_playbook playbook
        ON playbook.sector_playbook_id=assignment.sector_playbook_id
       AND playbook.playbook_state='active'
       AND playbook.effective_from <= $1::timestamptz
       AND (playbook.effective_to IS NULL OR playbook.effective_to > $1::timestamptz)
       AND playbook.known_at <= $1::timestamptz
     WHERE assignment.entity_id=identity.issuer_entity_id
       AND (assignment.security_issuer_identity_id IS NULL
            OR assignment.security_issuer_identity_id=identity.security_issuer_identity_id)
       AND assignment.valid_from <= $1::timestamptz
       AND (assignment.valid_to IS NULL OR assignment.valid_to > $1::timestamptz)
       AND assignment.known_at <= $1::timestamptz
     ORDER BY assignment.known_at DESC, assignment.valid_from DESC,
              assignment.playbook_assignment_id DESC
     LIMIT 1
  ) issuer_assignment ON true
  LEFT JOIN LATERAL (
    SELECT assignment.sector_playbook_id
      FROM governance.playbook_assignment assignment
      JOIN governance.sector_playbook playbook
        ON playbook.sector_playbook_id=assignment.sector_playbook_id
       AND playbook.playbook_state='active'
       AND playbook.effective_from <= $1::timestamptz
       AND (playbook.effective_to IS NULL OR playbook.effective_to > $1::timestamptz)
       AND playbook.known_at <= $1::timestamptz
     WHERE assignment.entity_id=requested.security_entity_id
       AND assignment.valid_from <= $1::timestamptz
       AND (assignment.valid_to IS NULL OR assignment.valid_to > $1::timestamptz)
       AND assignment.known_at <= $1::timestamptz
     ORDER BY assignment.known_at DESC, assignment.valid_from DESC,
              assignment.playbook_assignment_id DESC
     LIMIT 1
  ) legacy_security_assignment ON true
 WHERE $2::integer IS NULL OR requested.cohort_ordinal <= $2::integer
 ORDER BY requested.cohort_ordinal
`;

const MEASUREMENT_RULE_SQL = `
/* k4_measurement_rules */
SELECT identity.security_entity_id,
       identity.issuer_entity_id,
       playbook.sector_playbook_id,
       driver.business_driver_id,
       rule.business_driver_measurement_rule_id,
       driver.driver_key,
       rule.rule_key,
       rule.comparison_method,
       rule.output_unit,
       rule.output_currency,
       rule.input_concept_selectors,
       rule.direction_policy,
       rule.materiality_policy,
       rule.minimum_history_observations,
       rule.allowed_pit_classes,
       CASE driver.horizon
         WHEN 'intraquarter' THEN 'immediate'
         WHEN 'quarterly' THEN 'short'
         WHEN 'annual' THEN 'medium'
         ELSE 'long'
       END AS horizon
  FROM core.security_issuer_identity identity
  JOIN governance.playbook_assignment assignment
    ON assignment.entity_id=identity.issuer_entity_id
   AND (assignment.security_issuer_identity_id IS NULL
        OR assignment.security_issuer_identity_id=identity.security_issuer_identity_id)
  JOIN governance.sector_playbook playbook
    ON playbook.sector_playbook_id=assignment.sector_playbook_id
  JOIN governance.business_driver driver
    ON driver.sector_playbook_id=playbook.sector_playbook_id
  JOIN governance.business_driver_measurement_rule rule
    ON rule.business_driver_id=driver.business_driver_id
 WHERE identity.security_entity_id=ANY($2::bigint[])
   AND identity.valid_from <= $1::timestamptz
   AND identity.known_from <= $1::timestamptz
   AND assignment.valid_from <= $1::timestamptz
   AND (assignment.valid_to IS NULL OR assignment.valid_to > $1::timestamptz)
   AND assignment.known_at <= $1::timestamptz
   AND playbook.playbook_state='active'
   AND playbook.effective_from <= $1::timestamptz
   AND (playbook.effective_to IS NULL OR playbook.effective_to > $1::timestamptz)
   AND playbook.known_at <= $1::timestamptz
   AND rule.effective_from <= $1::timestamptz
   AND (rule.effective_to IS NULL OR rule.effective_to > $1::timestamptz)
   AND rule.known_at <= $1::timestamptz
 ORDER BY identity.security_entity_id, driver.driver_key, rule.revision_no DESC
`;

const NUMERIC_FACT_SQL = `
/* k4_numeric_facts */
SELECT fact.numeric_fact_id, fact.entity_id, fact.concept_namespace, fact.concept_key,
       fact.value::text, fact.unit, fact.currency,
       fact.instant_at, fact.period_start::text, fact.period_end::text,
       fact.source_revision_id, quality.source_pit_quality_id,
       CASE WHEN quality.pit_quality_class='PIT_C_OUR_ARCHIVE'
                  AND quality.archive_pit_from > fact.known_at
            THEN 'PIT_E_UNKNOWN' ELSE quality.pit_quality_class END AS pit_quality_class,
       fact.available_at, fact.known_at, fact.original_cell_or_xbrl_locator
  FROM world.numeric_fact fact
  JOIN ingestion.source_revision revision
    ON revision.source_revision_id=fact.source_revision_id
  JOIN ingestion.source_record_identity source_identity
    ON source_identity.source_record_identity_id=revision.source_record_identity_id
  JOIN LATERAL (
    SELECT candidate.*
      FROM governance.source_pit_quality candidate
     WHERE candidate.source_id=source_identity.source_id
       AND candidate.known_at <= $1::timestamptz
     ORDER BY candidate.revision_no DESC
     LIMIT 1
  ) quality ON true
 WHERE fact.entity_id=ANY($2::bigint[])
   AND fact.concept_key=ANY($3::text[])
   AND fact.available_at <= $1::timestamptz
   AND fact.known_at <= $1::timestamptz
 ORDER BY fact.entity_id, fact.concept_namespace, fact.concept_key,
          coalesce(fact.instant_at, fact.period_end::timestamptz) DESC,
          fact.revision_no DESC, fact.numeric_fact_id DESC
`;

const EXPECTATION_SQL = `
/* k4_expectations */
SELECT DISTINCT ON (expectation.expectation_key)
       expectation.expectation_revision_id, expectation.expectation_key,
       expectation.target_entity_id AS issuer_entity_id,
       definition.concept_namespace, definition.concept_key,
       CASE WHEN definition.period_basis='instant' AND expectation.target_period_end IS NOT NULL
            THEN expectation.target_period_end::text || 'T23:59:59.999Z'
            ELSE NULL END AS target_instant_at,
       expectation.target_period_start::text, expectation.target_period_end::text,
       expectation.expected_value::text, expectation.expected_unit,
       expectation.dispersion::text, expectation.source_revision_id,
       expectation.available_at, expectation.known_at, derivation.derivation_key
  FROM analytics.expectation_revision expectation
  JOIN governance.metric_definition definition
    ON definition.metric_definition_id=expectation.metric_definition_id
  JOIN knowledge.derivation derivation
    ON derivation.derivation_id=expectation.derivation_id AND derivation.status='sealed'
 WHERE expectation.target_entity_id=ANY($2::bigint[])
   AND expectation.expectation_kind IN ('prior_model','analyst_consensus','company_guidance')
   AND expectation.available_at <= $1::timestamptz
   AND expectation.known_at <= $1::timestamptz
 ORDER BY expectation.expectation_key, expectation.revision_no DESC
`;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function selectors(value: unknown): K4RuleInput['inputConceptSelectors'] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = object(entry);
    return {
      conceptNamespace: String(row.concept_namespace),
      conceptKeys: Array.isArray(row.concept_keys) ? row.concept_keys.map(String) : [],
    };
  });
}

export async function loadK4MarketIntelligenceInput(
  client: K4QueryClient,
  options: { cutoff: string; securityLimit: number | null },
): Promise<K4MarketIntelligenceInput> {
  const cutoff = new Date(options.cutoff);
  if (Number.isNaN(cutoff.valueOf()) || cutoff.toISOString() !== options.cutoff) {
    throw new Error('K4 cutoff must be a canonical ISO timestamp');
  }
  const snapshot = await client.query(SEMANTIC_SNAPSHOT_SQL, [options.cutoff]);
  const semanticSnapshotId = snapshot.rows[0]?.semantic_snapshot_id;
  if (typeof semanticSnapshotId !== 'string') {
    throw new Error('no sealed semantic snapshot existed by the K4 cutoff');
  }
  const universe = await client.query(SECURITY_UNIVERSE_SQL, [
    options.cutoff,
    options.securityLimit,
  ]);
  // A bound that came back short means the universe shrank under us, and a run that
  // silently evaluated fewer securities than asked for would report complete coverage
  // of an incomplete set. Unbounded runs take whatever the universe holds, but never
  // nothing.
  if (options.securityLimit !== null && universe.rows.length !== options.securityLimit) {
    throw new Error(
      `K4 asked for ${options.securityLimit} securities and the universe returned ${universe.rows.length}`,
    );
  }
  if (universe.rows.length === 0) {
    throw new Error('K4 found no securities in the served universe');
  }
  const securities = universe.rows.map((row) => ({
    securityEntityId: Number(row.security_entity_id),
    issuerEntityId: row.issuer_entity_id == null ? null : Number(row.issuer_entity_id),
    securityIssuerIdentityId:
      row.security_issuer_identity_id == null ? null : Number(row.security_issuer_identity_id),
    sectorPlaybookId: row.sector_playbook_id == null ? null : Number(row.sector_playbook_id),
  }));
  const securityIds = securities.map((row) => row.securityEntityId);
  const issuerIds = securities.flatMap((row) =>
    row.issuerEntityId == null ? [] : [row.issuerEntityId],
  );
  const ruleRows = await client.query(MEASUREMENT_RULE_SQL, [options.cutoff, securityIds]);
  const rules: K4RuleInput[] = ruleRows.rows.map((row) => ({
    securityEntityId: Number(row.security_entity_id),
    issuerEntityId: Number(row.issuer_entity_id),
    sectorPlaybookId: Number(row.sector_playbook_id),
    businessDriverId: Number(row.business_driver_id),
    businessDriverMeasurementRuleId: Number(row.business_driver_measurement_rule_id),
    driverKey: String(row.driver_key),
    ruleKey: String(row.rule_key),
    comparisonMethod: String(row.comparison_method) as K4RuleInput['comparisonMethod'],
    outputUnit: String(row.output_unit),
    outputCurrency: nullableText(row.output_currency),
    inputConceptSelectors: selectors(row.input_concept_selectors),
    directionPolicy: object(row.direction_policy) as Record<string, string>,
    materialityPolicy: object(row.materiality_policy) as { method: string },
    minimumHistoryObservations: Number(row.minimum_history_observations),
    allowedPitClasses: Array.isArray(row.allowed_pit_classes)
      ? row.allowed_pit_classes.map(String)
      : [],
    horizon: String(row.horizon) as K4RuleInput['horizon'],
    channelClass: 'operational_capacity',
  }));
  const conceptKeys = [
    ...new Set([
      ...rules.flatMap((rule) =>
        rule.inputConceptSelectors.flatMap((selector) => selector.conceptKeys),
      ),
      'Revenue',
      'Revenues',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
    ]),
  ];
  const factRows = issuerIds.length
    ? await client.query(NUMERIC_FACT_SQL, [options.cutoff, issuerIds, conceptKeys])
    : { rows: [] };
  const expectationRows = issuerIds.length
    ? await client.query(EXPECTATION_SQL, [options.cutoff, issuerIds])
    : { rows: [] };
  const digest = createHash('sha256')
    .update(`${options.cutoff}\n${semanticSnapshotId}`)
    .digest('hex')
    .slice(0, 20);
  return {
    informationSet: {
      informationSetId: `k4:${options.cutoff.slice(0, 10).replaceAll('-', '')}:${digest}`,
      validCutoff: options.cutoff,
      sourceAvailableCutoff: options.cutoff,
      systemKnownCutoff: options.cutoff,
      marketObservationCutoff: options.cutoff,
      semanticSnapshotId,
    },
    securities,
    rules,
    facts: factRows.rows.map((row) => ({
      numericFactId: Number(row.numeric_fact_id),
      entityId: Number(row.entity_id),
      conceptNamespace: String(row.concept_namespace),
      conceptKey: String(row.concept_key),
      value: Number(row.value),
      unit: String(row.unit),
      currency: nullableText(row.currency),
      instantAt: row.instant_at == null ? null : iso(row.instant_at),
      periodStart: nullableText(row.period_start),
      periodEnd: nullableText(row.period_end),
      sourceRevisionId: Number(row.source_revision_id),
      sourcePitQualityId: Number(row.source_pit_quality_id),
      pitClass: String(row.pit_quality_class),
      availableAt: iso(row.available_at),
      knownAt: iso(row.known_at),
      locator: object(row.original_cell_or_xbrl_locator),
    })),
    expectations: expectationRows.rows.map((row) => ({
      expectationRevisionId: Number(row.expectation_revision_id),
      expectationKey: String(row.expectation_key),
      issuerEntityId: Number(row.issuer_entity_id),
      conceptNamespace: String(row.concept_namespace),
      conceptKey: String(row.concept_key),
      targetInstantAt: nullableText(row.target_instant_at),
      targetPeriodStart: nullableText(row.target_period_start),
      targetPeriodEnd: nullableText(row.target_period_end),
      expectedValue: Number(row.expected_value),
      expectedUnit: String(row.expected_unit),
      dispersion: row.dispersion == null ? null : Number(row.dispersion),
      sourceRevisionId: row.source_revision_id == null ? null : Number(row.source_revision_id),
      availableAt: iso(row.available_at),
      knownAt: iso(row.known_at),
      derivationKey: String(row.derivation_key),
    })),
  };
}

const MARKET_OUTCOME_BARS_SQL = `
/* k4_market_outcome_bars */
WITH requested_security AS (
  SELECT security_entity_id, market, ticker
    FROM core.v_security_universe
   WHERE security_entity_id=$1
), security_bars AS (
  SELECT DISTINCT ON ((bar.ts AT TIME ZONE 'UTC')::date)
         'security'::text AS series_role,
         ((bar.ts AT TIME ZONE 'UTC')::date)::text AS session_date,
         bar.close::text AS close,
         bar.collected_at AS known_at
    FROM market_ts.ohlcv bar
    JOIN requested_security security
      ON security.ticker=regexp_replace(upper(bar.symbol), '\\.(KS|KQ)$', '')
     AND security.market=CASE WHEN bar.exchange IN ('KOSPI','KOSDAQ') THEN 'KR' ELSE 'US' END
   WHERE bar.domain='stock' AND bar.timeframe='1D' AND bar.close > 0
     AND bar.collected_at <= $3::timestamptz
     AND (bar.ts AT TIME ZONE 'UTC')::date >= ($2::timestamptz - interval '14 days')::date
     AND (bar.ts AT TIME ZONE 'UTC')::date <= $3::timestamptz::date
   ORDER BY (bar.ts AT TIME ZONE 'UTC')::date, bar.collected_at DESC
), us_benchmark AS (
  SELECT DISTINCT ON ((bar.ts AT TIME ZONE 'UTC')::date)
         'benchmark'::text AS series_role,
         ((bar.ts AT TIME ZONE 'UTC')::date)::text AS session_date,
         bar.close::text AS close,
         bar.collected_at AS known_at
    FROM market_ts.ohlcv bar
    JOIN requested_security security ON security.market='US'
   WHERE bar.symbol='^GSPC' AND bar.timeframe='1D' AND bar.close > 0
     AND bar.collected_at <= $3::timestamptz
     AND (bar.ts AT TIME ZONE 'UTC')::date >= ($2::timestamptz - interval '14 days')::date
     AND (bar.ts AT TIME ZONE 'UTC')::date <= $3::timestamptz::date
   ORDER BY (bar.ts AT TIME ZONE 'UTC')::date, bar.collected_at DESC
), kr_benchmark AS (
  SELECT DISTINCT ON (vintage.observation_date)
         'benchmark'::text AS series_role,
         vintage.observation_date::text AS session_date,
         vintage.value::text AS close,
         vintage.available_at AS known_at
    FROM market.macro_vintage vintage
    JOIN requested_security security ON security.market='KR'
   WHERE vintage.series_key='ecos:802Y001:0001000'
     AND vintage.value > 0
     AND vintage.available_at <= $3::timestamptz
     AND vintage.observation_date >= ($2::timestamptz - interval '14 days')::date
     AND vintage.observation_date <= $3::timestamptz::date
   ORDER BY vintage.observation_date, vintage.vintage_date DESC, vintage.available_at DESC
)
SELECT * FROM security_bars
UNION ALL SELECT * FROM us_benchmark
UNION ALL SELECT * FROM kr_benchmark
ORDER BY series_role, session_date
`;

export type K4OutcomeLoad = {
  outcomes: K4OutcomePlan[];
  /**
   * Exposures with no session before their event, so no baseline to measure against.
   *
   * Returned rather than thrown, and counted rather than dropped: the number moving is
   * how anyone notices that price history has fallen behind the filing dates it is
   * meant to bracket.
   */
  unanchoredExposureKeys: string[];
};

export async function loadK4OutcomePlans(
  client: K4QueryClient,
  plan: K4MarketIntelligencePlan,
): Promise<K4OutcomeLoad> {
  const outcomes: K4OutcomePlan[] = [];
  const unanchored: string[] = [];
  for (const exposure of plan.exposures) {
    const event = plan.filingEvents.find((candidate) => candidate.eventKey === exposure.eventKey);
    if (!event) throw new Error(`K4 exposure ${exposure.exposureKey} has no filing event`);
    const rows = (
      await client.query(MARKET_OUTCOME_BARS_SQL, [
        exposure.securityEntityId,
        event.availableAt,
        plan.informationSet.marketObservationCutoff,
      ])
    ).rows;
    const securityBars = rows
      .filter((row) => row.series_role === 'security')
      .map((row) => ({
        sessionDate: String(row.session_date),
        close: Number(row.close),
        knownAt: iso(row.known_at),
      }));
    const benchmarkBars = rows
      .filter((row) => row.series_role === 'benchmark')
      .map((row) => ({
        sessionDate: String(row.session_date),
        close: Number(row.close),
        knownAt: iso(row.known_at),
      }));
    const eventDate = event.availableAt.slice(0, 10);
    const anchorSessionDate = securityBars
      .map((bar) => bar.sessionDate)
      .filter((sessionDate) => sessionDate < eventDate)
      .sort()
      .at(-1);
    if (!anchorSessionDate) {
      // No session before the event, so there is no baseline to measure a reaction
      // against. This is a COVERAGE fact, not a contradiction: market_ts.ohlcv holds
      // roughly a month of history while a filing event can be months older, so any
      // exposure whose event predates the price series lands here by construction.
      // Measured 2026-08-11: 006280's cash fact is available_at 2026-05-15 and its bars
      // start 2026-07-14.
      //
      // It used to throw, which took the whole analytics stage down for every other
      // company — the same failure core-identity-sync fixed when one unresolvable
      // ticker killed the nightly run. The exposure is recorded as unanchored and
      // reported; an outcome invented without a baseline would be worse than none.
      unanchored.push(exposure.exposureKey);
      continue;
    }
    outcomes.push(
      ...planK4OutcomeRows({
        exposureKey: exposure.exposureKey,
        anchorSessionDate,
        marketDataCutoff: plan.informationSet.marketObservationCutoff,
        securityBars,
        benchmarkBars,
      }),
    );
  }
  return {
    outcomes: outcomes.sort((left, right) => left.outcomeKey.localeCompare(right.outcomeKey)),
    unanchoredExposureKeys: unanchored.sort(),
  };
}
