import { buildK4DailyCutoffs } from './k4-market-intelligence-plan.ts';
import {
  loadK4MarketIntelligenceInput,
  withK4MarketIntelligenceTransaction,
  type K4ConceptScope,
  type K4QueryClient,
} from './k4-market-intelligence-store.ts';
import {
  ensureInformationSet,
  insertSealedDerivation,
  type K4PersistenceClient,
} from './k4-market-intelligence-writer.ts';
import {
  planK4PriorModelExpectations,
  priorModelExpectationInputs,
  priorModelExpectationParameters,
  type K4PriorModelExpectationPlan,
} from './k4-prior-model-expectation.ts';

export type K4PriorModelExpectationArgs = {
  mode: 'dry-run' | 'rehearse' | 'apply';
  runKind: 'replay' | 'canary';
  cutoffs: string[];
  /**
   * `rules` — the historical read, bounded by `input_concept_selectors`.
   * `universe` — the regulator/canonical concepts the subject actually has annual
   * history for. See `UNIVERSE_CONCEPT_SQL`; the default stays `rules` so an
   * unflagged run issues the same statements it always did.
   *
   * ## 카디널리티 (REQ-COST-001)
   *
   * 비용을 정하는 것은 스코프 하나가 아니라 **스코프와 종목 한계의 조합**이다.
   * 같은 컷오프에서 실측한 계획 건수:
   *
   * | 개념 스코프 | 종목 한계 | plannedCount |
   * | ----------- | --------- | ------------ |
   * | rules       | 10        | 8            |
   * | universe    | 10        | 249          |
   * | rules       | 없음      | 573          |
   * | universe    | 없음      | 11,881       |
   *
   * 두 축은 곱해지지 않는다. `universe` 가 더하는 배수는 종목이 10으로 묶여 있을 때
   * **31배**(249/8)이고 한계를 풀면 **20.7배**(11,881/573)로 오히려 줄어든다.
   * 열 종목이 가진 개념 중 규칙이 이름 붙인 것은 8개뿐인데 규제·정본 개념은 249개라,
   * 좁은 실행일수록 스코프 플래그가 더 크게 벌린다. 종목을 늘리면 규칙 쪽이 따라
   * 붙으면서 격차가 좁아진다.
   *
   * **표를 축약하지 말 것.** 네 칸 중 셋만 알면 "종목을 묶어두면 스코프는 공짜"
   * 라는 정반대 결론이 나온다. 실제로는 `--security-limit 10 --concept-scope
   * universe` 가 배수가 가장 큰 조합이다 — 디버깅하려고 좁힌 실행에서 스코프를
   * 같이 켜는 것이 가장 비싼 선택이 된다.
   *
   * `universe` + 무한대는 실행당 11,881행이고 파이프라인이 일간이므로 **연 약
   * 430만 행**이다. `rules` + 무한대의 573행(연 21만)보다 20배다. 그리고 그
   * 20배의 대부분은 `AcquisitionOfTreasuryShares` 류의 임의 XBRL 개념이라 누가
   * 쓰겠다고 선언한 적이 없다. 반면 `rules` 의 573은 전부 누군가의
   * `business_driver_measurement_rule` 로 역추적된다 — `REQ-DOM-001` 이 지키려는
   * 성질이 그것이다.
   *
   * 표가 세는 것은 **계획**이지 삽입된 행이 아니다. `rules` + 무한대에서 실측한
   * 비율은 573 계획 → 277 키 → 266 삽입이었다 — 나머지는
   * `METRIC_DEFINITION_SQL` 이 활성 정의를 정확히 하나로 좁히지 못해 떨어졌다.
   * `expectation_key` 가 대상 기간을 담으므로 정상 상태에서는 멱등 skip 이
   * 이것을 더 줄인다. 그러니 430만은 상한이고, 상한이 REQ-COST-001 이 요구하는
   * 숫자다.
   *
   * 그래서 기본값은 `rules` 다. `--concept-scope universe` 를 켜는 사람은 위
   * 저장 비용을 알고 켜는 것이다.
   */
  conceptScope: K4ConceptScope;
  /**
   * 평가할 종목 수의 상한. **기본값 `null` = 무제한.**
   *
   * 같은 로더를 쓰는 K4 러너(`k4-market-intelligence-runner.ts`)가 이미 이 모양
   * 이고, 기대 생산자만 10으로 고정돼 있던 것이 비대칭이었다. 그 10 때문에
   * `analytics.expectation_revision` 이 6종목에 머물렀고 블록5가 297 중 291을
   * `not_produced` 로 세고 있었다.
   *
   * 값을 주면 스토어가 요청한 수보다 적게 돌아온 유니버스를 거부하므로, 잘린
   * 실행이 완전한 실행 행세를 할 수 없다.
   */
  securityLimit: number | null;
};

export type K4PriorModelExpectationPersistence = {
  insertedCount: number;
  skippedCount: number;
  /**
   * Expectations dropped because their metric definition is missing or ambiguous.
   * Reported rather than thrown: one unresolvable concept must not take the whole
   * pipeline stage down, and a silent drop is the defect this repository already
   * paid for once — so the count and the keys are always surfaced.
   */
  unresolvedDefinitionCount: number;
  unresolvedDefinitionKeys: string[];
  expectationKeys: string[];
};

export type K4PriorModelExpectationSummary = {
  cutoff: string;
  mode: K4PriorModelExpectationArgs['mode'];
  /**
   * Reported because the information-set id digests only the cutoff and the semantic
   * snapshot, so a `rules` run and a `universe` run at the same cutoff share one id
   * while reading different inputs. Until that is resolved, the summary is the only
   * place the two are told apart.
   *
   * `securityLimit` is here for exactly the same reason and was missed when
   * `conceptScope` was added: all four combinations of the two flags at one cutoff
   * produce a single id. Two of the four write to the same ledger, so the id alone
   * cannot answer "which run produced this row" — the summary has to.
   */
  conceptScope: K4ConceptScope;
  securityLimit: number | null;
  informationSetId: string;
  plannedCount: number;
  persistence: K4PriorModelExpectationPersistence | null;
};

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function canonicalIso(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

export function parseK4PriorModelExpectationArgs(
  argv: readonly string[],
): K4PriorModelExpectationArgs {
  let from: string | undefined;
  let to: string | undefined;
  let cutoff: string | undefined;
  let live = false;
  let kstCutoffTime = '23:59:59.999';
  let conceptScope: K4ConceptScope = 'rules';
  let securityLimit: number | null = null;
  const modes: Array<K4PriorModelExpectationArgs['mode']> = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--rehearse' || argument === '--apply') {
      modes.push(argument === '--rehearse' ? 'rehearse' : 'apply');
      continue;
    }
    if (argument === '--live') {
      live = true;
      continue;
    }
    if (argument === '--from' || argument === '--to' || argument === '--cutoff') {
      const value = valueAfter(argv, index, argument);
      if (argument === '--from') from = value;
      else if (argument === '--to') to = value;
      else cutoff = value;
      index += 1;
      continue;
    }
    if (argument === '--kst-cutoff-time') {
      kstCutoffTime = valueAfter(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--concept-scope') {
      const value = valueAfter(argv, index, argument);
      if (value !== 'rules' && value !== 'universe') {
        throw new Error('--concept-scope must be rules or universe');
      }
      conceptScope = value;
      index += 1;
      continue;
    }
    if (argument === '--security-limit') {
      securityLimit = Number(valueAfter(argv, index, argument));
      index += 1;
      continue;
    }
    throw new Error(`unknown K4 prior-model expectation argument: ${String(argument)}`);
  }
  if (modes.length > 1) throw new Error('select exactly one prior-model expectation write mode');
  const mode = modes[0] ?? 'dry-run';
  // 검증은 live/replay 두 분기보다 **앞에** 온다. 분기 안에 넣으면 한쪽 경로가
  // 검증 없이 빠져나간다.
  if (securityLimit !== null && (!Number.isSafeInteger(securityLimit) || securityLimit <= 0)) {
    throw new Error('--security-limit must be a positive integer when given');
  }
  if (live) {
    if (from || to) throw new Error('live prior-model expectations cannot use a replay range');
    if (!cutoff) throw new Error('live prior-model expectations require --cutoff');
    return {
      mode,
      runKind: 'canary',
      cutoffs: [canonicalIso(cutoff, 'live cutoff')],
      conceptScope,
      securityLimit,
    };
  }
  if (cutoff) throw new Error('--cutoff requires --live');
  if (!from || !to) throw new Error('prior-model expectation replay requires --from and --to');
  return {
    mode,
    runKind: 'replay',
    cutoffs: buildK4DailyCutoffs({ from, to, kstCutoffTime }),
    conceptScope,
    securityLimit,
  };
}

function positiveId(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

/**
 * The store joins `governance.metric_definition` to rebuild the target period, so an
 * expectation without exactly one active definition is refused rather than guessed.
 */
const METRIC_DEFINITION_SQL = `
/* k4_read_expectation_metric_definition */
SELECT metric_definition_id
  FROM governance.metric_definition
 WHERE concept_namespace=$1 AND concept_key=$2 AND period_basis=$3
   AND definition_state='active' AND known_at <= $4::timestamptz
   AND (issuer_entity_id IS NULL OR issuer_entity_id=$5)
   AND (effective_to IS NULL OR effective_to > $4::timestamptz)
 ORDER BY issuer_entity_id NULLS LAST, revision_no DESC
 LIMIT 2
`;

const EXISTING_EXPECTATION_SQL = `
/* k4_read_prior_model_expectation */
SELECT expectation_revision_id
  FROM analytics.expectation_revision
 WHERE expectation_key=$1
 LIMIT 1
`;

const INSERT_EXPECTATION_SQL = `
/* k4_insert_prior_model_expectation */
INSERT INTO analytics.expectation_revision (
  expectation_key, revision_no, target_entity_id, metric_definition_id,
  expectation_kind, as_of_at, horizon, target_period_start, target_period_end,
  expected_value, expected_unit, distribution, dispersion, source_revision_id,
  information_set_id, derivation_id, available_at, known_at, metadata
) VALUES (
  $1, 1, $2, $3, $4, $5::timestamptz, $6, $7::date, $8::date,
  $9, $10, $11::jsonb, $12, NULL, $13, $14, $15::timestamptz, $16::timestamptz, $17::jsonb
)
ON CONFLICT (expectation_key, revision_no) DO NOTHING
RETURNING expectation_revision_id
`;

export async function persistK4PriorModelExpectations(
  client: K4PersistenceClient,
  plans: readonly K4PriorModelExpectationPlan[],
  options: {
    informationSetId: string;
    cutoff: string;
    /**
     * The producer runs before the K4 canary, so on a fresh cutoff the analysis
     * information set does not exist yet. Sealing it here is the same idempotent
     * insert-and-verify the canary performs, so both agree or both fail.
     */
    informationSet?: Parameters<typeof ensureInformationSet>[1];
    runKind?: 'replay' | 'canary';
  },
): Promise<K4PriorModelExpectationPersistence> {
  const cutoffAt = Date.parse(options.cutoff);
  if (Number.isNaN(cutoffAt)) throw new Error('K4 prior-model cutoff must be parseable');
  if (options.informationSet && plans.length > 0) {
    await ensureInformationSet(client, options.informationSet, options.runKind ?? 'canary');
  }
  const expectationKeys: string[] = [];
  const unresolvedDefinitionKeys: string[] = [];
  let insertedCount = 0;
  let skippedCount = 0;
  for (const plan of plans) {
    if (Date.parse(plan.knownAt) > cutoffAt || Date.parse(plan.availableAt) > cutoffAt) {
      throw new Error(
        `prior-model expectation ${plan.expectationKey} would be known after the cutoff`,
      );
    }
    const existing = await client.query(EXISTING_EXPECTATION_SQL, [plan.expectationKey]);
    if (existing.rows.length > 0) {
      skippedCount += 1;
      expectationKeys.push(plan.expectationKey);
      continue;
    }
    const definitions = await client.query(METRIC_DEFINITION_SQL, [
      plan.conceptNamespace,
      plan.conceptKey,
      plan.periodBasis,
      options.cutoff,
      plan.issuerEntityId,
    ]);
    if (definitions.rows.length !== 1) {
      unresolvedDefinitionKeys.push(plan.expectationKey);
      continue;
    }
    const definition = definitions.rows[0]!;
    const derivation = await insertSealedDerivation(client, {
      key: plan.derivationKey,
      kind: 'calculation',
      method: plan.modelKey,
      outputType: 'expectation_revision',
      outputLocator: { expectation_key: plan.expectationKey },
      parameters: priorModelExpectationParameters(plan),
      inputs: priorModelExpectationInputs(plan).map((item) => ({
        kind: 'numeric_fact' as const,
        numericFactId: item.numericFactId,
        role: item.role,
      })),
    });
    const inserted = await client.query(INSERT_EXPECTATION_SQL, [
      plan.expectationKey,
      plan.issuerEntityId,
      positiveId(definition.metric_definition_id, 'metric_definition_id'),
      plan.expectationKind,
      plan.asOfAt,
      plan.horizon,
      plan.targetPeriodStart,
      plan.targetPeriodEnd,
      plan.expectedValue,
      plan.expectedUnit,
      JSON.stringify({
        family: 'point_with_dispersion',
        drift: plan.drift,
        dispersion: plan.dispersion,
      }),
      plan.dispersion,
      options.informationSetId,
      derivation.derivationId,
      plan.availableAt,
      plan.knownAt,
      JSON.stringify({
        model_key: plan.modelKey,
        prior_observation_count: plan.priorObservationCount,
        target_numeric_fact_id: plan.targetNumericFactId,
      }),
    ]);
    if (inserted.rows.length === 0) skippedCount += 1;
    else insertedCount += 1;
    expectationKeys.push(plan.expectationKey);
  }
  return {
    insertedCount,
    skippedCount,
    unresolvedDefinitionCount: unresolvedDefinitionKeys.length,
    unresolvedDefinitionKeys,
    expectationKeys,
  };
}

export async function executeK4PriorModelExpectationJob(input: {
  client: K4QueryClient & K4PersistenceClient;
  args: K4PriorModelExpectationArgs;
}): Promise<K4PriorModelExpectationSummary[]> {
  const summaries: K4PriorModelExpectationSummary[] = [];
  for (const cutoff of input.args.cutoffs) {
    const loaded = await loadK4MarketIntelligenceInput(input.client, {
      cutoff,
      securityLimit: input.args.securityLimit,
      conceptScope: input.args.conceptScope,
    });
    const plans = planK4PriorModelExpectations(loaded);
    if (input.args.mode === 'dry-run') {
      summaries.push({
        cutoff,
        mode: 'dry-run',
        conceptScope: input.args.conceptScope,
        securityLimit: input.args.securityLimit,
        informationSetId: loaded.informationSet.informationSetId,
        plannedCount: plans.length,
        persistence: null,
      });
      continue;
    }
    const persistence = await withK4MarketIntelligenceTransaction(
      input.client,
      { mode: input.args.mode, cutoff },
      async () =>
        persistK4PriorModelExpectations(input.client, plans, {
          informationSetId: loaded.informationSet.informationSetId,
          cutoff,
          informationSet: loaded.informationSet,
          runKind: input.args.runKind,
        }),
    );
    summaries.push({
      cutoff,
      mode: input.args.mode,
      conceptScope: input.args.conceptScope,
      securityLimit: input.args.securityLimit,
      informationSetId: loaded.informationSet.informationSetId,
      plannedCount: plans.length,
      persistence,
    });
  }
  return summaries;
}
