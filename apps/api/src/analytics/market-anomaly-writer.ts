import { K4_SEMANTIC_SNAPSHOT_SQL, k4InformationSetId } from './k4-market-intelligence-store.ts';
import { ensureInformationSet, type K4PersistenceClient } from './k4-market-intelligence-writer.ts';
import {
  ANOMALY_SIGMA_THRESHOLD,
  planAnomaly,
  type AnomalyCandidate,
  type PlannedAnomaly,
} from './market-anomaly-plan.ts';

export type MarketAnomalyArgs = {
  mode: 'dry-run' | 'apply';
  cutoff: string;
};

export type MarketAnomalySummary = {
  cutoff: string;
  mode: MarketAnomalyArgs['mode'];
  informationSetId: string;
  observedCount: number;
  anomalyCount: number;
  states: Record<string, number>;
  unsearchedChannelCounts: Record<string, number>;
  persistence: { written: number; withDerivation: number } | null;
};

type QueryClient = {
  query: <Row>(text: string, values?: readonly unknown[]) => Promise<{ rows: Row[] }>;
};

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseMarketAnomalyArgs(argv: readonly string[]): MarketAnomalyArgs {
  let cutoff: string | undefined;
  const modes: Array<MarketAnomalyArgs['mode']> = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      modes.push('apply');
      continue;
    }
    if (argument === '--dry-run') {
      modes.push('dry-run');
      continue;
    }
    if (argument === '--cutoff') {
      cutoff = valueAfter(argv, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`unknown market anomaly argument: ${String(argument)}`);
  }
  if (modes.length > 1) throw new Error('select exactly one market anomaly write mode');
  // REQ-PIT-003.
  if (!cutoff) throw new Error('market anomaly radar requires --cutoff');
  const parsed = new Date(cutoff);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== cutoff) {
    throw new Error('--cutoff must be a canonical ISO timestamp');
  }
  return { mode: modes[0] ?? 'dry-run', cutoff };
}

/**
 * 움직임과 채널을 **한 번에** 읽는다.
 *
 * `ret_1d` 와 `vol_20d` 를 여기서 다시 계산하지 않는 이유는 하나다:
 * `run-feature-snapshot.ts` 가 그 둘의 정의를 이미 소유하고 있고, 두 번째 정의를
 * 만들면 "그 종목이 오늘 얼마나 움직였나" 에 서로 다른 답을 주는 자리가 둘이 된다.
 * 그 둘은 반드시 갈라지고, 갈라진 뒤에는 어느 쪽이 맞는지 아무도 모른다.
 *
 * 동종 이웃은 accepted 만 본다 — 격리된 후보로 co-move 를 판정하면 승인 절차가
 * 설명력에 아무 영향을 주지 않게 된다. 방향은 부호로만 비교한다: 이웃이 얼마나
 * 움직였는지까지 끌어들이면 그건 co-move 판정이 아니라 회귀분석이고,
 * 이 표는 회귀 결과를 담지 않는다.
 */
const CANDIDATE_SQL = `
  WITH snapshot AS (
    SELECT asset_entity_id, market, ticker, as_of,
           (features->>'ret_1d')::numeric        AS ret_1d,
           (features->>'vol_20d')::numeric       AS vol_20d,
           (features->>'volume_z_20d')::numeric  AS volume_z,
           (features->>'event_count_7d')::int    AS event_count_7d
      FROM serving.latest_feature_snapshot_v1
     WHERE as_of <= $1::timestamptz
  ),
  accepted_peer AS (
    SELECT DISTINCT identity.subject_entity_id AS a, identity.object_entity_id AS b
      FROM knowledge.relation_identity identity
      JOIN knowledge.relation_revision revision USING (relation_identity_id)
     WHERE identity.predicate = 'SAME_INDUSTRY'
       AND revision.revision_status = 'accepted'
  ),
  peer AS (
    SELECT a, b FROM accepted_peer
    UNION
    SELECT b, a FROM accepted_peer
  ),
  peer_move AS (
    SELECT snapshot.asset_entity_id,
           count(neighbour.asset_entity_id)::int AS peer_priced_count,
           count(*) FILTER (
             WHERE sign(neighbour.ret_1d) = sign(snapshot.ret_1d)
           )::int AS peer_same_direction_count
      FROM snapshot
      LEFT JOIN peer ON peer.a = snapshot.asset_entity_id
      LEFT JOIN snapshot neighbour
        ON neighbour.asset_entity_id = peer.b
       AND neighbour.ret_1d IS NOT NULL
     GROUP BY snapshot.asset_entity_id
  )
  SELECT snapshot.asset_entity_id::text,
         snapshot.market,
         snapshot.ticker,
         to_char(snapshot.as_of, 'YYYY-MM-DD') AS observation_date,
         snapshot.ret_1d::text,
         snapshot.vol_20d::text,
         snapshot.volume_z::text,
         snapshot.event_count_7d,
         peer_move.peer_priced_count,
         peer_move.peer_same_direction_count,
         market.average_change_pct::text AS market_move_pct,
         market.sample_count AS market_sample_count
    FROM snapshot
    JOIN peer_move USING (asset_entity_id)
    LEFT JOIN serving.daily_change_v1 market
      ON market.day = snapshot.as_of::date
   WHERE snapshot.ret_1d IS NOT NULL
     AND snapshot.vol_20d > 0
   ORDER BY snapshot.market, snapshot.ticker
`;

type CandidateRow = {
  asset_entity_id: string;
  market: string;
  ticker: string;
  observation_date: string;
  ret_1d: string;
  vol_20d: string;
  volume_z: string | null;
  event_count_7d: number;
  peer_priced_count: number;
  peer_same_direction_count: number;
  market_move_pct: string | null;
  market_sample_count: number | null;
};

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadAnomalyCandidates(
  client: QueryClient,
  options: { cutoff: string },
): Promise<AnomalyCandidate[]> {
  const rows = await client.query<CandidateRow>(CANDIDATE_SQL, [options.cutoff]);
  return rows.rows.map((row) => ({
    subjectEntityId: Number(row.asset_entity_id),
    market: row.market,
    ticker: row.ticker,
    observationDate: row.observation_date,
    return1d: Number(row.ret_1d),
    annualisedVol: Number(row.vol_20d),
    volumeZ: toNumber(row.volume_z),
    knownEventCount: Number(row.event_count_7d),
    peerPricedCount: Number(row.peer_priced_count),
    peerSameDirectionCount: Number(row.peer_same_direction_count),
    marketMovePct: toNumber(row.market_move_pct),
    marketSampleCount: row.market_sample_count === null ? null : Number(row.market_sample_count),
  }));
}

/**
 * 이 행이 실제로 조회한 accepted 동종 관계 리비전. 도출의 입력이 되는 것은 이것뿐
 * 이고, 없으면 도출을 만들지 않는다 — 마이그레이션 121 헤더에 이유가 있다.
 */
const CONSULTED_RELATION_SQL = `
  SELECT DISTINCT revision.relation_revision_id::text
    FROM knowledge.relation_identity identity
    JOIN knowledge.relation_revision revision USING (relation_identity_id)
   WHERE identity.predicate = 'SAME_INDUSTRY'
     AND revision.revision_status = 'accepted'
     AND (identity.subject_entity_id = $1::bigint OR identity.object_entity_id = $1::bigint)
   ORDER BY 1
`;

const INSERT_DERIVATION_SQL = `
  INSERT INTO knowledge.derivation (
    derivation_key, derivation_kind, method, method_version, created_by, metadata
  ) VALUES ($1, 'calculation', 'market_anomaly_channel_search', $2, 'market-anomaly-radar', $3::jsonb)
  ON CONFLICT (derivation_key) DO NOTHING
  RETURNING derivation_id::text
`;

const INSERT_STEP_SQL = `
  INSERT INTO knowledge.derivation_step (
    derivation_id, step_no, activity_type, activity_version,
    output_type, output_locator, parameters)
  VALUES ($1::bigint, 1, 'calculation', $2, 'market_anomaly', $3::jsonb, $4::jsonb)
  RETURNING derivation_step_id::text
`;

const INSERT_INPUT_SQL = `
  INSERT INTO knowledge.derivation_input
    (derivation_step_id, input_no, input_kind, relation_revision_id, input_role)
  VALUES ($1::bigint, $2::int, 'relation_revision', $3::bigint, 'peer_comove_candidate')
`;

export const MARKET_ANOMALY_METHOD_VERSION = 'market-anomaly-radar-v1';

async function insertChannelDerivation(
  client: QueryClient,
  plan: PlannedAnomaly,
  relationRevisionIds: readonly number[],
): Promise<number | null> {
  if (relationRevisionIds.length === 0) return null;
  const parameters = {
    sigma_threshold: ANOMALY_SIGMA_THRESHOLD,
    searched_channels: plan.searchedChannels,
    unsearched_channels: plan.unsearchedChannels,
    observation_date: plan.observationDate,
  };
  const derivation = await client.query<{ derivation_id: string }>(INSERT_DERIVATION_SQL, [
    `${plan.anomalyKey}:derivation`,
    MARKET_ANOMALY_METHOD_VERSION,
    JSON.stringify(parameters),
  ]);
  const derivationRow = derivation.rows[0];
  if (!derivationRow) return null;
  const derivationId = Number(derivationRow.derivation_id);
  const step = await client.query<{ derivation_step_id: string }>(INSERT_STEP_SQL, [
    String(derivationId),
    MARKET_ANOMALY_METHOD_VERSION,
    JSON.stringify({ anomaly_key: plan.anomalyKey }),
    JSON.stringify(parameters),
  ]);
  const stepRow = step.rows[0];
  if (!stepRow) throw new Error('market anomaly derivation step insert returned no row');
  const stepId = Number(stepRow.derivation_step_id);
  let inputNo = 1;
  for (const relationRevisionId of relationRevisionIds) {
    await client.query(INSERT_INPUT_SQL, [String(stepId), inputNo, String(relationRevisionId)]);
    inputNo += 1;
  }
  return derivationId;
}

const INSERT_ANOMALY_SQL = `
  INSERT INTO analytics.market_anomaly_revision (
    anomaly_key, revision_no, subject_entity_id, observation_date, as_of_at,
    move_return, move_sigma, volume_z, known_event_count, peer_comove_count,
    peer_priced_count, market_move_pct, market_sample_count, matched_channel_count,
    searched_channels, unsearched_channels, explanation_state,
    information_set_id, derivation_id)
  VALUES ($1, 1, $2::bigint, $3::date, $4::timestamptz, $5::numeric, $6::numeric,
          $7::numeric, $8::int, $9::int, $10::int, $11::numeric, $12::int, $13::int,
          $14::text[], $15::text[], $16, $17, $18::bigint)
  ON CONFLICT (anomaly_key, revision_no) DO NOTHING
  RETURNING market_anomaly_revision_id::text
`;

export async function executeMarketAnomalyJob(input: {
  client: QueryClient;
  args: MarketAnomalyArgs;
}): Promise<MarketAnomalySummary> {
  const candidates = await loadAnomalyCandidates(input.client, { cutoff: input.args.cutoff });
  const plans = candidates
    .map((candidate) => planAnomaly(candidate))
    .filter((plan): plan is PlannedAnomaly => plan !== null);

  const states = plans.reduce<Record<string, number>>((accumulator, plan) => {
    accumulator[plan.explanationState] = (accumulator[plan.explanationState] ?? 0) + 1;
    return accumulator;
  }, {});
  // 못 뒤진 채널을 요약에도 센다. 요약이 상태만 말하면 UNEXPLAINED 가 몇 개인지는
  // 보이는데 **왜** 그런지가 안 보이고, 운영자는 채널이 죽은 것을 시장이 조용한
  // 것으로 읽는다.
  const unsearchedChannelCounts = plans.reduce<Record<string, number>>((accumulator, plan) => {
    for (const channel of plan.unsearchedChannels) {
      accumulator[channel] = (accumulator[channel] ?? 0) + 1;
    }
    return accumulator;
  }, {});

  const snapshot = await input.client.query<{ semantic_snapshot_id: string }>(
    K4_SEMANTIC_SNAPSHOT_SQL,
    [input.args.cutoff],
  );
  const semanticSnapshotId = snapshot.rows[0]?.semantic_snapshot_id;
  if (typeof semanticSnapshotId !== 'string') {
    throw new Error('no sealed semantic snapshot existed by the market anomaly cutoff');
  }
  const informationSetId = k4InformationSetId(input.args.cutoff, semanticSnapshotId);

  if (input.args.mode === 'dry-run') {
    return {
      cutoff: input.args.cutoff,
      mode: 'dry-run',
      informationSetId,
      observedCount: candidates.length,
      anomalyCount: plans.length,
      states,
      unsearchedChannelCounts,
      persistence: null,
    };
  }

  await input.client.query('BEGIN');
  try {
    await ensureInformationSet(
      input.client as unknown as K4PersistenceClient,
      {
        informationSetId,
        validCutoff: input.args.cutoff,
        sourceAvailableCutoff: input.args.cutoff,
        systemKnownCutoff: input.args.cutoff,
        marketObservationCutoff: input.args.cutoff,
        semanticSnapshotId,
      },
      'canary',
    );
    let written = 0;
    let withDerivation = 0;
    for (const plan of plans) {
      const relations = await input.client.query<{ relation_revision_id: string }>(
        CONSULTED_RELATION_SQL,
        [String(plan.subjectEntityId)],
      );
      const derivationId = await insertChannelDerivation(
        input.client,
        plan,
        relations.rows.map((row) => Number(row.relation_revision_id)),
      );
      const inserted = await input.client.query<{ market_anomaly_revision_id: string }>(
        INSERT_ANOMALY_SQL,
        [
          plan.anomalyKey,
          String(plan.subjectEntityId),
          plan.observationDate,
          input.args.cutoff,
          plan.moveReturn,
          plan.moveSigma,
          plan.volumeZ,
          plan.knownEventCount,
          plan.peerComoveCount,
          plan.peerPricedCount,
          plan.marketMovePct,
          plan.marketSampleCount,
          plan.matchedChannelCount,
          plan.searchedChannels,
          plan.unsearchedChannels,
          plan.explanationState,
          informationSetId,
          derivationId === null ? null : String(derivationId),
        ],
      );
      if (inserted.rows.length > 0) {
        written += 1;
        if (derivationId !== null) withDerivation += 1;
      }
    }
    await input.client.query('COMMIT');
    return {
      cutoff: input.args.cutoff,
      mode: 'apply',
      informationSetId,
      observedCount: candidates.length,
      anomalyCount: plans.length,
      states,
      unsearchedChannelCounts,
      persistence: { written, withDerivation },
    };
  } catch (error) {
    await input.client.query('ROLLBACK');
    throw error;
  }
}
