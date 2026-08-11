// K6 — the I/O half of the common asset view builder.
//
// Loads the twelve blocks' sources for a batch of assets and writes the resulting
// packets. Everything here is batched by entity rather than looped per asset: the
// numeric-fact source alone is 882,585 rows, so a per-asset query would turn a
// daily job into an hourly one.
//
// REQ-REC-001 IS ENFORCED BY WHAT THIS FILE DOES NOT CONTAIN. No query below
// references the personalization schema, directly or through a view. The absence of
// the word is not the gate — common-asset-view.test.ts perturbs a live portfolio
// snapshot and asserts the packet digest does not move, because a builder could
// always reach personalization through something that does not spell it.

import type { AssetSourceFacts, CommonAssetViewPlan } from './common-asset-view-plan.ts';

import { containsActionAdvice } from '../shared/action-advice.ts';

export type QueryClient = {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
};

/**
 * Per-asset list caps. A packet is a summary, not an export, and an asset with 4,000
 * ETF co-membership edges would otherwise produce a packet larger than the screen
 * that reads it.
 *
 * Every capped list reports `truncated` and the true total in its payload. A silent
 * cap reads as "this is everything" to the next person, which is the failure this
 * repository has already paid for once in the coverage plane.
 */
const MAX_METRICS_PER_ASSET = 40;
const MAX_EVENTS_PER_ASSET = 20;
const MAX_RELATIONS_PER_ASSET = 60;
const MAX_ASSERTIONS_PER_ASSET = 20;

export type AssetFactsBatch = Map<number, AssetSourceFacts>;

/**
 * Runs the source queries one after another.
 *
 * They were a `Promise.all` first, which reads like parallelism and is not: the
 * builder holds a single pooled client, so pg queues them anyway and warns that a
 * query was issued while another was executing. Sequential says what happens.
 */
async function runInSequence<Steps extends readonly (() => Promise<unknown>)[]>(
  steps: [...Steps],
): Promise<{ -readonly [Index in keyof Steps]: Awaited<ReturnType<Steps[Index]>> }> {
  const results: unknown[] = [];
  for (const step of steps) results.push(await step());
  return results as { -readonly [Index in keyof Steps]: Awaited<ReturnType<Steps[Index]>> };
}

/** A row as pg hands it back: every column may be null, and numerics arrive as strings. */
type SourceRow = Record<string, string | null>;

function groupRows<Row extends Record<string, unknown>>(rows: Row[]): Map<number, Row[]> {
  const grouped = new Map<number, Row[]>();
  for (const row of rows) {
    const key = Number(row.entity_id);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/**
 * The subject universe: securities we actually serve, resolved through the issuer
 * identity so the packet's subject is the same entity every other K-stage means by
 * it. `run-playbook-assignment` learned this the hard way in migration 088 — a
 * playbook assigned to the security rather than the issuer looks correct and joins
 * to nothing.
 */
export async function loadSubjectEntityIds(client: QueryClient, limit: number): Promise<number[]> {
  const { rows } = await client.query<{ entity_id: string }>(
    `SELECT master.security_entity_id AS entity_id
       FROM core.security_master master
       JOIN core.entity entity ON entity.entity_id = master.security_entity_id
      WHERE entity.status = 'active'
      ORDER BY master.security_entity_id
      LIMIT $1`,
    [limit],
  );
  return rows.map((row) => Number(row.entity_id));
}

export async function loadAssetSourceFacts(
  client: QueryClient,
  options: {
    entityIds: number[];
    asOfDate: string;
    releaseId: string;
    semanticSnapshotId: string;
  },
): Promise<AssetFactsBatch> {
  const { entityIds, asOfDate, releaseId, semanticSnapshotId } = options;
  if (entityIds.length === 0) return new Map();

  // THE SUBJECT IS A SECURITY; HALF THE SOURCES ARE KEYED BY ITS ISSUER.
  //
  // Measured on live data 2026-08-10, and it is not a rounding error:
  // core.security_master carries 297 Stock entities, while world.numeric_fact
  // (294 subjects), governance.coverage_ledger (182) and
  // analytics.expectation_revision all key off Company entities. Querying those
  // with a security id returns nothing and every block reads `not_produced` — an
  // empty screen that looks like an honest absence.
  //
  // This is migration 088's defect wearing different clothes: run-playbook-assignment
  // assigned playbooks to the security rather than the issuer, looked correct, and
  // joined to nothing. governance.playbook_assignment still holds both shapes (10
  // Stock rows from before the fix, 10 Company rows after), which is why the
  // playbook query below accepts either id.
  const issuerRows = await client.query<SourceRow>(
    `SELECT security_entity_id AS entity_id, issuer_entity_id
       FROM core.security_issuer_identity
      WHERE security_entity_id = ANY($1::bigint[])
        AND valid_from IS NOT NULL`,
    [entityIds],
  );
  const securitiesOfIssuer = new Map<number, number[]>();
  for (const row of issuerRows.rows) {
    const securityId = Number(row.entity_id);
    const issuerId = Number(row.issuer_entity_id);
    const bucket = securitiesOfIssuer.get(issuerId);
    if (bucket) bucket.push(securityId);
    else securitiesOfIssuer.set(issuerId, [securityId]);
  }
  const issuerIds = [...securitiesOfIssuer.keys()];

  /** Re-keys an issuer-grained result onto the securities that issuer stands behind. */
  const byIssuer = (rows: SourceRow[]): Map<number, SourceRow[]> => {
    const grouped = new Map<number, SourceRow[]>();
    for (const row of rows) {
      for (const securityId of securitiesOfIssuer.get(Number(row.entity_id)) ?? []) {
        const bucket = grouped.get(securityId);
        if (bucket) bucket.push(row);
        else grouped.set(securityId, [row]);
      }
    }
    return grouped;
  };

  const [
    identities,
    claims,
    taxonomies,
    playbooks,
    metrics,
    events,
    surprises,
    expectations,
    relations,
    impacts,
    valuations,
    confirmations,
    scenarios,
    assertions,
    coverage,
  ] = await runInSequence([
    () =>
      client.query<SourceRow>(
        `SELECT master.security_entity_id AS entity_id, master.security_key, master.primary_ticker,
              entity.canonical_name
         FROM core.security_master master
         JOIN core.entity entity ON entity.entity_id = master.security_entity_id
        WHERE master.security_entity_id = ANY($1::bigint[])`,
        [entityIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT master.security_entity_id AS entity_id, claim.economic_claim_id, claim.claim_type
         FROM core.economic_claim claim
         JOIN core.security_master master
           ON master.security_master_id = claim.security_master_id
        WHERE master.security_entity_id = ANY($1::bigint[])
          AND claim.valid_to IS NULL`,
        [entityIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT membership.entity_id, node.code, node.label, node.taxonomy_release_id
         FROM core.entity_taxonomy_membership membership
         JOIN core.taxonomy_node node ON node.taxonomy_node_id = membership.taxonomy_node_id
        WHERE membership.entity_id = ANY($1::bigint[])`,
        [entityIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT assignment.entity_id, playbook.playbook_key, assignment.valid_from
         FROM governance.playbook_assignment assignment
         JOIN governance.sector_playbook playbook
           ON playbook.sector_playbook_id = assignment.sector_playbook_id
        WHERE assignment.entity_id = ANY($1::bigint[])
          AND assignment.valid_to IS NULL`,
        [[...entityIds, ...issuerIds]],
      ),
    // Peer count is computed inside the same statement as the observation count so
    // the two can never describe different populations, which is how a rank ends up
    // citing a coverage number from a different query.
    () =>
      client.query<SourceRow>(
        `WITH observed AS (
         SELECT fact.entity_id,
                definition.comparability_group_key,
                definition.unit,
                fact.concept_namespace || ':' || fact.concept_key AS metric_key,
                count(*) AS observation_count
           FROM world.numeric_fact fact
           JOIN governance.metric_definition definition
             ON definition.concept_namespace = fact.concept_namespace
            AND definition.concept_key = fact.concept_key
          WHERE definition.definition_scope IN ('regulator', 'canonical')
            AND definition.comparability_group_key IS NOT NULL
            AND fact.supersedes_numeric_fact_id IS NULL
          GROUP BY 1, 2, 3, 4
       ),
       peers AS (
         SELECT comparability_group_key, count(DISTINCT entity_id) AS peer_count
           FROM observed GROUP BY 1
       )
       SELECT observed.entity_id, observed.metric_key, observed.unit,
              observed.comparability_group_key, observed.observation_count,
              peers.peer_count
         FROM observed
         JOIN peers USING (comparability_group_key)
        WHERE observed.entity_id = ANY($1::bigint[])`,
        [issuerIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT event.target_entity_id AS entity_id, event.event_key, event.summary_text,
              COALESCE(event.announced_at, event.occurred_at, event.created_at) AS known_at
         FROM knowledge.event event
        WHERE event.target_entity_id = ANY($1::bigint[])
          AND COALESCE(event.announced_at, event.occurred_at, event.created_at) <= $2::date + 1`,
        [entityIds, asOfDate],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT expectation.target_entity_id AS entity_id,
              surprise.surprise_revision_id, surprise.standardized_surprise
         FROM analytics.surprise_revision surprise
         JOIN analytics.expectation_revision expectation
           ON expectation.expectation_revision_id = surprise.expectation_revision_id
        WHERE expectation.target_entity_id = ANY($1::bigint[])`,
        [issuerIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT expectation.target_entity_id AS entity_id,
              expectation.expectation_revision_id, definition.definition_key
         FROM analytics.expectation_revision expectation
         LEFT JOIN governance.metric_definition definition
           ON definition.metric_definition_id = expectation.metric_definition_id
        WHERE expectation.target_entity_id = ANY($1::bigint[])`,
        [issuerIds],
      ),
    // OUTBOUND ONLY — the subject endpoint. This comment used to say "both endpoints,
    // because 'who is exposed to me' and 'who am I exposed to' are the same block from
    // the reader's side", and the sentiment is right while the description was not: the
    // WHERE clause below filters `identity.subject_entity_id` and nothing else.
    //
    // It has been harmless so far because the predicate that carries this block emits
    // both directions of every pair. Measured 2026-08-11: accepted SAME_INDUSTRY has 89
    // distinct subjects and the same 89 as objects, so no inbound-only edge exists to be
    // missed. That is a property of the builder, not of this query, and a future
    // directional predicate would break it silently.
    //
    // Corrected rather than fixed, deliberately. Adding the inbound half would change
    // which relations 297 packets carry, which is a separate decision from the promotion
    // rule this change is about — and it now matters more, because promotion reads the
    // OBJECT endpoint's entity type. A comment that claims coverage the SQL does not have
    // is how the next author assumes an inbound edge was considered.
    () =>
      client.query<SourceRow>(
        // object 쪽 core.entity 는 **LEFT** JOIN 이다. INNER 로 붙이면 객체 엔티티가
        // 없는 관계 행이 조용히 사라지는데, 관계를 목록에서 지우는 것은 099 가
        // "격리 행도 빼지 않고 표시해서 내보낸다" 로 정한 원칙과 반대다. 유형을
        // 못 읽은 행은 사라지는 대신 `object_entity_type = NULL` 로 실려 나가고,
        // 판정 쪽에서 fail-closed(자산 아님)로 취급된다.
        `SELECT identity.subject_entity_id AS entity_id, identity.predicate,
              identity.object_entity_id, object.entity_type AS object_entity_type,
              revision.relation_kind, revision.revision_status,
              revision.confidence,
              (SELECT count(*) FROM knowledge.relation_evidence_ledger ledger
                WHERE ledger.relation_identity_id = identity.relation_identity_id) AS evidence_count
         FROM knowledge.relation_identity identity
         JOIN LATERAL (
           SELECT relation_kind, revision_status, confidence
             FROM knowledge.relation_revision
            WHERE relation_identity_id = identity.relation_identity_id
            ORDER BY revision_no DESC
            LIMIT 1
         ) revision ON TRUE
         LEFT JOIN core.entity object ON object.entity_id = identity.object_entity_id
        WHERE identity.subject_entity_id = ANY($1::bigint[])`,
        [entityIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT asset_entity_id AS entity_id, market, ticker, path_count, max_path_score
         FROM serving.impact_summary_v2
        WHERE asset_entity_id = ANY($1::bigint[])`,
        [entityIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT security_entity_id AS entity_id, valuation_estimate_revision_id
         FROM analytics.valuation_estimate_revision
        WHERE security_entity_id = ANY($1::bigint[])`,
        [entityIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT asset_entity_id AS entity_id, as_of, market_confirmation, ret_20d
         FROM serving.market_confirmation_v1
        WHERE asset_entity_id = ANY($1::bigint[])`,
        [entityIds],
      ),
    // scenario_set carries no entity column — it hangs off the shock that caused it,
    // so the subject is reached through shock -> event revision -> event. The table
    // is empty today (block 9 is no_eligible_source), and the join is written out
    // properly anyway: a query that cannot light up when its source fills is a block
    // that stays dark for a reason nobody remembers.
    () =>
      client.query<SourceRow>(
        `SELECT event.target_entity_id AS entity_id, scenario.scenario_set_id
         FROM analytics.scenario_set scenario
         JOIN analytics.impact_shock shock
           ON shock.impact_shock_id = scenario.impact_shock_id
         JOIN world.event_revision revision
           ON revision.event_revision_id = shock.event_revision_id
         JOIN knowledge.event event ON event.event_id = revision.event_id
        WHERE event.target_entity_id = ANY($1::bigint[])`,
        [entityIds],
      ),
    // Forward-looking and contested claims only. A factual assertion is block 4's
    // material; a catalyst is something that has not happened yet, and
    // counter-evidence is something contested.
    () =>
      client.query<SourceRow>(
        `SELECT subject_entity_id AS entity_id, assertion_key, predicate_key, modality,
              verification_state
         FROM knowledge.assertion
        WHERE subject_entity_id = ANY($1::bigint[])
          AND modality IN ('forecast', 'alleged')`,
        [entityIds],
      ),
    () =>
      client.query<SourceRow>(
        `SELECT entity_id, coverage_key, completeness_state, last_checked_at
         FROM governance.coverage_ledger
        WHERE entity_id = ANY($1::bigint[])
          AND supersedes_coverage_ledger_id IS NULL`,
        [issuerIds],
      ),
  ]);

  const claimsByEntity = groupRows(claims.rows);
  const taxonomyByEntity = groupRows(taxonomies.rows);
  const playbookByEntity = new Map([...byIssuer(playbooks.rows)]);
  for (const [entityId, rows] of groupRows(playbooks.rows)) {
    if (!playbookByEntity.has(entityId)) playbookByEntity.set(entityId, rows);
  }
  const metricsByEntity = byIssuer(metrics.rows);
  const eventsByEntity = groupRows(events.rows);
  const surprisesByEntity = byIssuer(surprises.rows);
  const expectationsByEntity = byIssuer(expectations.rows);
  const relationsByEntity = groupRows(relations.rows);
  const impactsByEntity = groupRows(impacts.rows);
  const valuationsByEntity = groupRows(valuations.rows);
  const confirmationsByEntity = groupRows(confirmations.rows);
  const scenariosByEntity = groupRows(scenarios.rows);
  const assertionsByEntity = groupRows(assertions.rows);
  const coverageByEntity = byIssuer(coverage.rows);

  const batch: AssetFactsBatch = new Map();
  for (const row of identities.rows) {
    const entityId = Number(row.entity_id);
    const claim = claimsByEntity.get(entityId)?.[0];
    const playbook = playbookByEntity.get(entityId)?.[0];
    const confirmation = confirmationsByEntity.get(entityId)?.[0];
    const truncation: Record<string, { kept: number; total: number }> = {};

    // 제품 경계는 **여기서** 선다.
    //
    // `knowledge.event` 는 증권사 리포트 헤드라인을 그대로 싣고 있어서
    // `서울보증보험 iM증권 목표가 56000 Buy` 같은 제목이 사건 제목으로 존재한다.
    // 라이브 실측(2026-08-11): 사건이 실린 177종목 중 127종목의 상위 5건 안에
    // 목표가·Buy·매수 문구가 들어 있었다. CLAUDE.md 가 이름으로 금지한 것이
    // 그대로 화면에 나가고 있었다는 뜻이다.
    //
    // 읽기 모델이 아니라 빌더인 이유는 `AssetSourceFacts.actionAdviceExcludedEvents`
    // 주석에 적었다 — digest 정직성이 그 선택을 정한다.
    //
    // **자르기 전에 거른다.** 매핑된 결과를 거르면 `truncation.recentEvents.total`
    // 이 걸러진 것까지 세게 되고, 그러면 "확인된 사건 N건 중 최근 M건" 이 더는
    // 서빙되지 않는 총계를 말한다.
    const eventRows = [...(eventsByEntity.get(entityId) ?? [])].sort((a, b) =>
      String(b.known_at).localeCompare(String(a.known_at)),
    );
    const eligibleEventRows = eventRows.filter(
      (event) => !containsActionAdvice(event.summary_text),
    );

    batch.set(entityId, {
      subjectEntityId: entityId,
      asOfDate,
      identity: {
        entityKey: row.security_key ?? String(entityId),
        displayName: row.canonical_name ?? '',
        tickers: row.primary_ticker ? [row.primary_ticker] : [],
      },
      economicClaim: claim
        ? { claimKey: String(claim.economic_claim_id), statement: String(claim.claim_type) }
        : null,
      taxonomy: (taxonomyByEntity.get(entityId) ?? []).map((node) => ({
        nodeKey: String(node.code),
        label: String(node.label),
        taxonomyReleaseId: String(node.taxonomy_release_id),
      })),
      playbook: playbook
        ? { playbookKey: String(playbook.playbook_key), assignedAt: String(playbook.valid_from) }
        : null,
      numericFacts: capped(
        metricsByEntity.get(entityId) ?? [],
        MAX_METRICS_PER_ASSET,
        (metric) => ({
          metricKey: String(metric.metric_key),
          comparabilityGroupKey: metric.comparability_group_key ?? null,
          unit: metric.unit ?? null,
          peerCount: Number(metric.peer_count),
          observationCount: Number(metric.observation_count),
        }),
        truncation,
        'numericFacts',
      ),
      recentEvents: capped(
        eligibleEventRows,
        MAX_EVENTS_PER_ASSET,
        (event) => ({
          eventKey: String(event.event_key),
          knownAt: new Date(String(event.known_at)).toISOString(),
          title: event.summary_text ?? null,
        }),
        truncation,
        'recentEvents',
      ),
      actionAdviceExcludedEvents: eventRows.length - eligibleEventRows.length,
      surprises: (surprisesByEntity.get(entityId) ?? []).map((surprise) => ({
        surpriseRevisionId: Number(surprise.surprise_revision_id),
        magnitude:
          surprise.standardized_surprise === null ? null : Number(surprise.standardized_surprise),
      })),
      expectations: (expectationsByEntity.get(entityId) ?? []).map((expectation) => ({
        expectationRevisionId: Number(expectation.expectation_revision_id),
        metricKey: String(expectation.definition_key ?? ''),
      })),
      relations: capped(
        relationsByEntity.get(entityId) ?? [],
        MAX_RELATIONS_PER_ASSET,
        (relation) => ({
          predicate: String(relation.predicate),
          relationKind: String(relation.relation_kind),
          revisionStatus: String(relation.revision_status),
          objectEntityId: Number(relation.object_entity_id),
          objectEntityType:
            relation.object_entity_type === null || relation.object_entity_type === undefined
              ? null
              : String(relation.object_entity_type),
          confidence: relation.confidence === null ? null : Number(relation.confidence),
          evidenceCount: Number(relation.evidence_count),
        }),
        truncation,
        'relations',
      ),
      impactSummaries: (impactsByEntity.get(entityId) ?? []).map((impact) => ({
        impactKey: `${impact.market}:${impact.ticker}`,
        horizon: null,
        sign: null,
      })),
      valuations: (valuationsByEntity.get(entityId) ?? []).map((valuation) => ({
        valuationRevisionId: Number(valuation.valuation_estimate_revision_id),
      })),
      marketConfirmation: confirmation
        ? {
            asOf: new Date(String(confirmation.as_of)).toISOString(),
            direction: confirmation.market_confirmation ?? null,
            strength: confirmation.ret_20d === null ? null : Number(confirmation.ret_20d),
          }
        : null,
      scenarios: (scenariosByEntity.get(entityId) ?? []).map((scenario) => ({
        scenarioSetId: Number(scenario.scenario_set_id),
      })),
      forwardAssertions: capped(
        assertionsByEntity.get(entityId) ?? [],
        MAX_ASSERTIONS_PER_ASSET,
        (assertion) => ({
          assertionKey: String(assertion.assertion_key),
          predicateKey: String(assertion.predicate_key),
          modality: String(assertion.modality),
          verificationState: String(assertion.verification_state),
        }),
        truncation,
        'forwardAssertions',
      ),
      coverage: (coverageByEntity.get(entityId) ?? []).map((entry) => ({
        datasetKey: String(entry.coverage_key),
        state: String(entry.completeness_state),
        observedAt: new Date(String(entry.last_checked_at)).toISOString(),
      })),
      // Derivation ids are resolved from the blocks that cite them rather than
      // queried per asset: knowledge.derivation is 3.5M rows and an unfiltered join
      // would dominate the whole job.
      derivationIds: [],
      truncation,
      releaseId,
      semanticSnapshotId,
    });
  }
  return batch;
}

function capped<Row, Mapped>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Mapped,
  into: Record<string, { kept: number; total: number }>,
  field: string,
): Mapped[] {
  if (rows.length > limit) into[field] = { kept: limit, total: rows.length };
  return rows.slice(0, limit).map(map);
}

/** Every list the store capped, so the runner can report the caps rather than hide them. */
export function truncationReport(
  batch: AssetFactsBatch,
): { entityId: number; list: string; kept: number; total: number }[] {
  const report: { entityId: number; list: string; kept: number; total: number }[] = [];
  for (const [entityId, facts] of batch) {
    for (const [list, cap] of Object.entries(facts.truncation)) {
      report.push({ entityId, list, ...cap });
    }
  }
  return report;
}

/**
 * Opens the release this build will publish under, superseding the previous one for
 * the same as-of date.
 *
 * The first shape of this tried one release per as-of date, on the reasoning that a
 * rebuild should land in the same release rather than multiply them. That fights the
 * schema: governance.release_manifest is append-only with a supersedes chain and a
 * `superseded` state, so a rerun is meant to produce a new release that retires the
 * old one. Reusing the id instead collides on the primary key and takes the pipeline
 * stage down on the second run of any day.
 *
 * K6 is the manifest's first writer. Migration 081 created it and nothing has ever
 * inserted a row, so `release_current_v1` is empty and REQ-REL-001 has nothing to
 * compare. A packet with no release is one no surface can safely mix with an impact
 * or theme panel.
 */
export async function nextReleaseId(
  client: QueryClient,
  asOfDate: string,
): Promise<{
  releaseId: string;
  supersedesReleaseId: string | null;
}> {
  const { rows } = await client.query<{ release_id: string }>(
    `SELECT release_id FROM governance.release_manifest
      WHERE release_id LIKE $1
      ORDER BY built_at DESC, release_id DESC
      LIMIT 1`,
    [`common-asset-view:${asOfDate}:%`],
  );
  const previous = rows[0]?.release_id ?? null;
  const previousRevision = previous ? Number(previous.slice(previous.lastIndexOf(':') + 1)) : 0;
  const revision = Number.isFinite(previousRevision) ? previousRevision + 1 : 1;
  return { releaseId: `common-asset-view:${asOfDate}:${revision}`, supersedesReleaseId: previous };
}

export async function openRelease(
  client: QueryClient,
  options: {
    releaseId: string;
    supersedesReleaseId: string | null;
    semanticSnapshotId: string;
    safetyState: string;
    builtAt: string;
    createdBy: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO governance.release_manifest
       (release_id, semantic_snapshot_id, built_at, safety_state, release_state,
        supersedes_release_id, created_by)
     VALUES ($1, $2, $3::timestamptz, $4, 'building', $5, $6)`,
    [
      options.releaseId,
      options.semanticSnapshotId,
      options.builtAt,
      options.safetyState,
      options.supersedesReleaseId,
      options.createdBy,
    ],
  );
}

export async function publishRelease(
  client: QueryClient,
  options: {
    releaseId: string;
    supersedesReleaseId: string | null;
    digest: string;
    freshUntil: string;
    publishedAt: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO governance.release_component (release_id, kind, snapshot_id, digest, fresh_until)
     SELECT $1, 'common_asset_view', manifest.semantic_snapshot_id, $2, $3::timestamptz
       FROM governance.release_manifest manifest
      WHERE manifest.release_id = $1`,
    [options.releaseId, options.digest, options.freshUntil],
  );
  await client.query(
    `UPDATE governance.release_manifest
        SET component_count = 1, release_state = 'published', published_at = $2::timestamptz
      WHERE release_id = $1`,
    [options.releaseId, options.publishedAt],
  );
  // Retire the predecessor only after the successor is published, so a crash between
  // the two leaves the old release serving rather than leaving none.
  if (options.supersedesReleaseId) {
    await client.query(
      `UPDATE governance.release_manifest SET release_state = 'superseded'
        WHERE release_id = $1 AND release_state = 'published'`,
      [options.supersedesReleaseId],
    );
  }
}

export async function insertCommonAssetView(
  client: QueryClient,
  plan: CommonAssetViewPlan,
  context: { releaseId: string; semanticSnapshotId: string; builtBy: string },
): Promise<number> {
  // Two statements rather than one clever one. The previous revision may not exist,
  // and expressing "left-join a table to nothing" inline reads as a bug to everyone
  // who meets it later.
  const { rows: previousRows } = await client.query<{
    common_asset_view_id: string;
    revision_no: number;
  }>(
    `SELECT common_asset_view_id, revision_no
       FROM serving.common_asset_view
      WHERE view_key = $1
      ORDER BY revision_no DESC
      LIMIT 1`,
    [plan.viewKey],
  );
  const previous = previousRows[0];

  const { rows } = await client.query<{ common_asset_view_id: string }>(
    `INSERT INTO serving.common_asset_view
       (view_key, revision_no, subject_entity_id, as_of_date, release_id,
        semantic_snapshot_id, packet_digest, supersedes_common_asset_view_id, built_by)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
     RETURNING common_asset_view_id`,
    [
      plan.viewKey,
      Number(previous?.revision_no ?? 0) + 1,
      plan.subjectEntityId,
      plan.asOfDate,
      context.releaseId,
      context.semanticSnapshotId,
      plan.packetDigest,
      previous ? Number(previous.common_asset_view_id) : null,
      context.builtBy,
    ],
  );
  const viewId = Number(rows[0]?.common_asset_view_id);
  if (!Number.isFinite(viewId))
    throw new Error(`common asset view insert returned no id for ${plan.viewKey}`);

  for (const block of plan.blocks) {
    await client.query(
      `INSERT INTO serving.common_asset_view_block
         (common_asset_view_id, block_no, block_key, block_state, state_reason,
          payload, payload_digest, evidence_count)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        viewId,
        block.blockNo,
        block.blockKey,
        block.blockState,
        block.stateReason,
        JSON.stringify(block.payload),
        block.payloadDigest,
        block.evidenceCount,
      ],
    );
  }
  return viewId;
}
