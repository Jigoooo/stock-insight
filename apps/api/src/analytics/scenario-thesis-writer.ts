import { K4_SEMANTIC_SNAPSHOT_SQL, k4InformationSetId } from './k4-market-intelligence-store.ts';
import {
  ensureInformationSet,
  insertSealedDerivation,
  type K4PersistenceClient,
} from './k4-market-intelligence-writer.ts';
import {
  planScenarioThesis,
  type PlannedScenarioSet,
  type ScenarioThesisSkip,
  type ScenarioThesisSubject,
  type ValuationBandInput,
} from './scenario-thesis-plan.ts';

export type ScenarioThesisArgs = {
  mode: 'dry-run' | 'apply';
  cutoff: string;
};

export type ScenarioThesisSummary = {
  cutoff: string;
  mode: ScenarioThesisArgs['mode'];
  informationSetId: string;
  subjectCount: number;
  plannedCount: number;
  skips: Record<string, number>;
  persistence: {
    scenarioSetCount: number;
    branchCount: number;
    invalidationCount: number;
    sealedCount: number;
  } | null;
};

type QueryClient = {
  query: <Row>(text: string, values?: readonly unknown[]) => Promise<{ rows: Row[] }>;
};

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseScenarioThesisArgs(argv: readonly string[]): ScenarioThesisArgs {
  let cutoff: string | undefined;
  const modes: Array<ScenarioThesisArgs['mode']> = [];
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
    throw new Error(`unknown scenario thesis argument: ${String(argument)}`);
  }
  if (modes.length > 1) throw new Error('select exactly one scenario thesis write mode');
  // REQ-PIT-003. `now()` 는 업무 기준이 될 수 없다 — 기준 시각은 부르는 쪽이 준다.
  if (!cutoff) throw new Error('scenario thesis requires --cutoff');
  const parsed = new Date(cutoff);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== cutoff) {
    throw new Error('--cutoff must be a canonical ISO timestamp');
  }
  return { mode: modes[0] ?? 'dry-run', cutoff };
}

type BandRow = {
  security_entity_id: string;
  method_key: string;
  lower_estimate: string;
  upper_estimate: string;
  estimate_unit: string;
  horizon: string;
  valuation_estimate_key: string;
  current_multiple: string | null;
  observation_count: string | null;
  derivation_id: string | null;
};

/**
 * 밴드는 **패킷이 아니라 원장**에서 읽는다. CAV 저장소는 payload 크기 때문에
 * `metadata` 를 싣지 않기로 했고(그 결정은 저장소 주석에 있다), 이 생산자가
 * 필요로 하는 `current_multiple`·`observation_count` 가 바로 그 metadata 다.
 *
 * 컷오프 이후 리비전은 보지 않는다. 그것이 PIT 다 — 오늘 아는 것으로 어제의
 * 해석을 다시 쓰면 재현이 불가능해진다.
 */
const BAND_SQL = `
  SELECT DISTINCT ON (security_entity_id, method_key)
         security_entity_id::text,
         method_key,
         lower_estimate::text,
         upper_estimate::text,
         estimate_unit,
         horizon,
         valuation_estimate_key,
         (metadata->>'current_multiple') AS current_multiple,
         (metadata->>'observation_count') AS observation_count,
         v.derivation_id::text AS derivation_id
    FROM analytics.valuation_estimate_revision v
   WHERE as_of_at <= $1::timestamptz
   ORDER BY security_entity_id, method_key, revision_no DESC
`;

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadScenarioThesisSubjects(
  client: QueryClient,
  options: { cutoff: string },
): Promise<ScenarioThesisSubject[]> {
  const rows = await client.query<BandRow>(BAND_SQL, [options.cutoff]);
  const bySubject = new Map<number, ValuationBandInput[]>();
  const bandDerivations = new Map<number, number[]>();
  for (const row of rows.rows) {
    const subjectId = Number(row.security_entity_id);
    const band: ValuationBandInput = {
      methodKey: row.method_key,
      lowerEstimate: Number(row.lower_estimate),
      upperEstimate: Number(row.upper_estimate),
      estimateUnit: row.estimate_unit,
      horizon: row.horizon,
      valuationEstimateKey: row.valuation_estimate_key,
      currentMultiple: toNumber(row.current_multiple),
      observationCount: toNumber(row.observation_count),
    };
    const derivationId = toNumber(row.derivation_id);
    if (derivationId !== null) {
      bandDerivations.set(subjectId, [...(bandDerivations.get(subjectId) ?? []), derivationId]);
    }
    const bucket = bySubject.get(subjectId);
    if (bucket) bucket.push(band);
    else bySubject.set(subjectId, [band]);
  }
  // 커널은 도출 입력을 **같은 도출 안의 앞선 단계**로 제한한다(031). 다른 도출의
  // 산출물을 입력으로 지목할 수 없다는 뜻이라, thesis 의 계보는 밴드를 건너뛰어
  // 밴드가 딛고 선 **관측**으로 잡는다. 중간 산물인 밴드는 도출 파라미터와 무효화
  // locator 에 남으므로 사슬이 끊기지 않는다.
  const allDerivationIds = [...new Set([...bandDerivations.values()].flat())];
  const factRows = allDerivationIds.length
    ? await client.query<{ derivation_id: string; numeric_fact_id: string }>(
        `SELECT DISTINCT step.derivation_id::text, input.numeric_fact_id::text
           FROM knowledge.derivation_step step
           JOIN knowledge.derivation_input input
             ON input.derivation_step_id = step.derivation_step_id
          WHERE step.derivation_id = ANY($1::bigint[])
            AND input.numeric_fact_id IS NOT NULL`,
        [allDerivationIds],
      )
    : { rows: [] };
  const factsByDerivation = new Map<number, number[]>();
  for (const row of factRows.rows) {
    const derivationId = Number(row.derivation_id);
    factsByDerivation.set(derivationId, [
      ...(factsByDerivation.get(derivationId) ?? []),
      Number(row.numeric_fact_id),
    ]);
  }

  return [...bySubject.entries()]
    .map(([securityEntityId, bands]) => ({
      securityEntityId,
      bands,
      numericFactIds: [
        ...new Set(
          (bandDerivations.get(securityEntityId) ?? []).flatMap(
            (derivationId) => factsByDerivation.get(derivationId) ?? [],
          ),
        ),
      ],
    }))
    .sort((left, right) => left.securityEntityId - right.securityEntityId);
}

/**
 * 봉인은 **세 문장**이다. 040 의 `guard_scenario_branch_write` 가 그렇게 정했다:
 * `sealed` 로는 INSERT 할 수 없고("insert as building first"), `sealed` 로 가는
 * UPDATE 는 무효화 행이 하나라도 있어야 통과한다.
 *
 * 롤백하는 트랜잭션으로 먼저 확인했다(2026-08-12): 무효화 없이 UPDATE 하면
 * 가드가 거부하고, 같은 트랜잭션에서 무효화를 넣은 뒤 UPDATE 하면 가드가 그것을
 * 보고 통과한다. 그러므로 순서를 바꾸면 안 된다 — 무엇이 자기를 반증하는지
 * 말하지 못하는 분기는 봉인되지 않는다는 것이 040 의 설계다.
 */
async function persistOne(
  client: QueryClient,
  plan: PlannedScenarioSet,
  options: { cutoff: string; informationSetId: string; numericFactIds: readonly number[] },
): Promise<{ branches: number; invalidations: number; sealed: number }> {
  /*
    **먼저 이미 있는지 본다.** 아래 시나리오 삽입은 ON CONFLICT DO NOTHING 이라
    재실행에 안전한데, 그 위의 도출 삽입은 아니었다. 그래서 같은 날 두 번째
    실행이 `derivation_derivation_key_key` 충돌로 죽었다 — 2026-08-13 에
    파이프라인이 정확히 그렇게 멈췄다.

    키가 `thesis:own-history:{entityId}:{asOfDate}` 라 같은 날은 같은 키다.
    그것이 의도다 — 하루에 한 해석이고, 이미 봉인된 해석이 있으면 이 실행이
    할 일은 없다. 그러므로 여기서 조용히 끝내는 것이 옳다.

    도출을 먼저 만들고 나중에 시나리오에서 걸러내면, 아무것도 가리키지 않는
    도출 행이 실행마다 하나씩 쌓인다. 커널은 그것을 막지 않는다.
  */
  const existing = await client.query<{ scenario_set_id: string }>(
    `SELECT scenario_set_id::text FROM analytics.scenario_set WHERE scenario_set_key = $1`,
    [plan.scenarioSetKey],
  );
  if (existing.rows.length > 0) return { branches: 0, invalidations: 0, sealed: 0 };

  // 커널이 빈 입력을 거부하는 것이 옳다 — 무엇으로부터 나왔는지 말하지 못하는
  // 도출은 감사 사슬을 끊는다. 이 thesis 의 입력은 자기가 읽은 밴드의 도출
  // 단계이고, 그것이 계보를 밴드 → 사실까지 잇는다.
  const derivation = await insertSealedDerivation(client as never, {
    key: `${plan.scenarioSetKey}:derivation`,
    kind: 'inference',
    method: 'own_history_valuation_band_thesis',
    outputType: 'scenario_set',
    outputLocator: { scenario_set_key: plan.scenarioSetKey },
    parameters: plan.metadata,
    inputs: options.numericFactIds.map((numericFactId) => ({
      kind: 'numeric_fact' as const,
      numericFactId,
      role: 'valuation_band_observation',
    })),
  });

  const inserted = await client.query<{ scenario_set_id: string }>(
    `INSERT INTO analytics.scenario_set
       (scenario_set_key, subject_entity_id, title, as_of, known_at, metadata,
        information_set_id, derivation_id)
     VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz, $5::jsonb, $6, $7)
     ON CONFLICT (scenario_set_key) DO NOTHING
     RETURNING scenario_set_id::text`,
    [
      plan.scenarioSetKey,
      plan.subjectEntityId,
      plan.title,
      options.cutoff,
      JSON.stringify(plan.metadata),
      options.informationSetId,
      derivation.derivationId,
    ],
  );
  const insertedRow = inserted.rows[0];
  if (!insertedRow) return { branches: 0, invalidations: 0, sealed: 0 };
  const scenarioSetId = Number(insertedRow.scenario_set_id);

  let branches = 0;
  let invalidations = 0;
  let sealed = 0;
  for (const branch of plan.branches) {
    const branchRow = await client.query<{ scenario_branch_id: string }>(
      `INSERT INTO analytics.scenario_branch
         (scenario_set_id, branch_key, branch_kind, narrative, branch_state, metadata)
       VALUES ($1, $2, $3, $4, 'building', $5::jsonb)
       RETURNING scenario_branch_id::text`,
      [
        scenarioSetId,
        branch.branchKey,
        branch.branchKind,
        branch.narrative,
        JSON.stringify(branch.metadata),
      ],
    );
    branches += 1;
    const branchRowValue = branchRow.rows[0];
    if (!branchRowValue) throw new Error('scenario branch insert returned no row');
    const branchId = Number(branchRowValue.scenario_branch_id);

    for (const invalidation of branch.invalidations) {
      await client.query(
        `INSERT INTO analytics.scenario_invalidation
           (scenario_branch_id, invalidation_condition, counter_evidence_locator, monitored_signal)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [
          branchId,
          invalidation.condition,
          JSON.stringify(invalidation.counterEvidenceLocator),
          invalidation.monitoredSignal,
        ],
      );
      invalidations += 1;
    }

    await client.query(
      `UPDATE analytics.scenario_branch SET branch_state = 'sealed' WHERE scenario_branch_id = $1`,
      [branchId],
    );
    sealed += 1;
  }
  return { branches, invalidations, sealed };
}

export async function executeScenarioThesisJob(input: {
  client: QueryClient;
  args: ScenarioThesisArgs;
}): Promise<ScenarioThesisSummary> {
  const subjects = await loadScenarioThesisSubjects(input.client, { cutoff: input.args.cutoff });
  const plans: PlannedScenarioSet[] = [];
  const skips: ScenarioThesisSkip[] = [];
  for (const subject of subjects) {
    const { plan, skip } = planScenarioThesis(subject, {
      asOfDate: input.args.cutoff.slice(0, 10),
    });
    if (plan) plans.push(plan);
    if (skip) skips.push(skip);
  }

  // 밴드 생산자와 **같은** 정보집합 위에 선다. thesis 는 밴드의 해석이므로
  // 다른 스냅샷 위에 세우면 해석과 근거가 서로 다른 세계를 보게 된다.
  const snapshot = await input.client.query<{ semantic_snapshot_id: string }>(
    K4_SEMANTIC_SNAPSHOT_SQL,
    [input.args.cutoff],
  );
  const semanticSnapshotId = snapshot.rows[0]?.semantic_snapshot_id;
  if (typeof semanticSnapshotId !== 'string') {
    throw new Error('no sealed semantic snapshot existed by the scenario thesis cutoff');
  }
  const informationSetId = k4InformationSetId(input.args.cutoff, semanticSnapshotId);
  const skipCounts = skips.reduce<Record<string, number>>((accumulator, skip) => {
    accumulator[skip.reason] = (accumulator[skip.reason] ?? 0) + 1;
    return accumulator;
  }, {});

  if (input.args.mode === 'dry-run') {
    return {
      cutoff: input.args.cutoff,
      mode: 'dry-run',
      informationSetId,
      subjectCount: subjects.length,
      plannedCount: plans.length,
      skips: skipCounts,
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
    let scenarioSetCount = 0;
    let branchCount = 0;
    let invalidationCount = 0;
    let sealedCount = 0;
    for (const plan of plans) {
      const result = await persistOne(input.client, plan, {
        cutoff: input.args.cutoff,
        informationSetId,
        numericFactIds:
          subjects.find((entry) => entry.securityEntityId === plan.subjectEntityId)
            ?.numericFactIds ?? [],
      });
      if (result.branches > 0) scenarioSetCount += 1;
      branchCount += result.branches;
      invalidationCount += result.invalidations;
      sealedCount += result.sealed;
    }
    // 040 이 봉인 전 무효화를 요구하므로 이 둘이 어긋나는 일은 원래 없어야 한다.
    // 그래도 세는 이유는, 어긋났다면 가드가 아니라 이 코드가 틀린 것이기 때문이다.
    if (sealedCount > invalidationCount) {
      throw new Error(
        `sealed(${sealedCount}) > invalidation(${invalidationCount}) — 봉인 조건이 깨졌습니다`,
      );
    }
    await input.client.query('COMMIT');
    return {
      cutoff: input.args.cutoff,
      mode: 'apply',
      informationSetId,
      subjectCount: subjects.length,
      plannedCount: plans.length,
      skips: skipCounts,
      persistence: { scenarioSetCount, branchCount, invalidationCount, sealedCount },
    };
  } catch (error) {
    await input.client.query('ROLLBACK');
    throw error;
  }
}
