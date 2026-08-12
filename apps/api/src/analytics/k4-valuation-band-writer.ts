import { buildK4DailyCutoffs } from './k4-market-intelligence-plan.ts';
import {
  withK4MarketIntelligenceTransaction,
  type K4QueryClient,
} from './k4-market-intelligence-store.ts';
import {
  ensureInformationSet,
  insertSealedDerivation,
  type K4PersistenceClient,
} from './k4-market-intelligence-writer.ts';
import {
  loadK4ValuationBandCurrentPrices,
  loadK4ValuationBandPrices,
  loadK4ValuationBandSubjects,
} from './k4-valuation-band-store.ts';
import {
  buildK4ValuationSeries,
  k4ValuationPriceRequests,
  planK4ValuationBands,
  K4_VALUATION_BAND_VERSION,
  type K4ValuationBandPlan,
  type K4ValuationBandSkip,
} from './k4-valuation-band.ts';

export type K4ValuationBandArgs = {
  mode: 'dry-run' | 'rehearse' | 'apply';
  runKind: 'replay' | 'canary';
  cutoffs: string[];
};

export type K4ValuationBandPersistence = {
  insertedCount: number;
  skippedCount: number;
  /** `insertedCount` 중 정정(`revision_no > 1`)인 건수. 첫 기록과 구별해서 센다. */
  supersededCount: number;
  valuationEstimateKeys: string[];
};

export type K4ValuationBandSummary = {
  cutoff: string;
  mode: K4ValuationBandArgs['mode'];
  informationSetId: string;
  plannedCount: number;
  /** `method_key` 별 계획 건수. 기준 0 이므로 이 숫자가 곧 산출이다. */
  plannedByMethod: Record<string, number>;
  /** 밴드를 하나라도 받은 종목 수. 종목 하나가 PBR·PER 둘 다 받을 수 있다. */
  plannedSecurityCount: number;
  /** 왜 안 나왔는지. 조용한 부재는 "그런 종목이 없다" 로 읽힌다. */
  skipReasons: Record<string, number>;
  persistence: K4ValuationBandPersistence | null;
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

export function parseK4ValuationBandArgs(argv: readonly string[]): K4ValuationBandArgs {
  let from: string | undefined;
  let to: string | undefined;
  let cutoff: string | undefined;
  let live = false;
  let kstCutoffTime = '23:59:59.999';
  const modes: Array<K4ValuationBandArgs['mode']> = [];
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
    throw new Error(`unknown K4 valuation-band argument: ${String(argument)}`);
  }
  if (modes.length > 1) throw new Error('select exactly one valuation-band write mode');
  const mode = modes[0] ?? 'dry-run';
  if (live) {
    if (from || to) throw new Error('live valuation bands cannot use a replay range');
    if (!cutoff) throw new Error('live valuation bands require --cutoff');
    return { mode, runKind: 'canary', cutoffs: [canonicalIso(cutoff, 'live cutoff')] };
  }
  if (cutoff) throw new Error('--cutoff requires --live');
  if (!from || !to) throw new Error('valuation-band replay requires --from and --to');
  return { mode, runKind: 'replay', cutoffs: buildK4DailyCutoffs({ from, to, kstCutoffTime }) };
}

function positiveId(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

/**
 * 같은 키의 **마지막** 리비전. `LIMIT 1` 이 아니라 `revision_no DESC` 인 이유는
 * supersede 사슬의 꼭대기를 집어야 하기 때문이다.
 */
const EXISTING_VALUATION_SQL = `
/* k4_read_valuation_estimate */
SELECT valuation_estimate_revision_id, revision_no,
       lower_estimate::text AS lower_estimate, upper_estimate::text AS upper_estimate
  FROM analytics.valuation_estimate_revision
 WHERE valuation_estimate_key=$1
 ORDER BY revision_no DESC
 LIMIT 1
`;

/**
 * 첫 리비전은 `revision_no=1` · `supersedes IS NULL`, 정정은 `revision_no=n+1` ·
 * `supersedes=<직전 id>` 다. 스키마 CHECK 가 그 두 모양만 허용하고
 * `validate_k4_exact_revision_chain` 이 "직전 리비전을 인용했는가" 를 본다.
 *
 * 2026-08-12 정정 — 여기 있던 "revision_no 는 항상 1 이고 supersede 사슬이 만들어질
 * 일이 없다" 는 **정정 경로를 스스로 닫은 문장이었다.** 키에 information_set_id 가
 * 들어 있어 컷오프가 다르면 새 키인 것은 맞지만, 그 말은 **이미 쓴 컷오프의 밴드가
 * 틀렸을 때 고칠 길이 없다**는 뜻이기도 하다. `reject_k4_ledger_mutation` 이 UPDATE
 * 를 거부하므로 원장에서 정정은 supersede 뿐이다.
 *
 * 같은 컷오프의 재실행이 값을 그대로 낸다면 아무것도 쓰지 않는다 — 아래
 * `sameBand` 가 그 판정이다. 리비전은 **값이 달라졌을 때만** 늘어난다.
 */
const INSERT_VALUATION_SQL = `
/* k4_insert_valuation_estimate */
INSERT INTO analytics.valuation_estimate_revision (
  valuation_estimate_key, revision_no, security_entity_id, method_key,
  lower_estimate, upper_estimate, estimate_unit, as_of_at, horizon,
  information_set_id, derivation_id, metadata,
  supersedes_valuation_estimate_revision_id
) VALUES ($1, $12, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11::jsonb, $13)
ON CONFLICT (valuation_estimate_key, revision_no) DO NOTHING
RETURNING valuation_estimate_revision_id
`;

/**
 * 저장된 밴드와 계획한 밴드가 같은가. `numeric` 텍스트를 `Number` 로 되읽어 비교한다
 * — 삽입할 때 JS 부동소수를 그대로 보내므로 왕복이 같은 값이면 같은 텍스트다.
 */
function sameBand(
  stored: { lower_estimate: unknown; upper_estimate: unknown },
  plan: K4ValuationBandPlan,
): boolean {
  return (
    Number(stored.lower_estimate) === plan.lowerEstimate &&
    Number(stored.upper_estimate) === plan.upperEstimate
  );
}

export async function persistK4ValuationBands(
  client: K4PersistenceClient,
  plans: readonly K4ValuationBandPlan[],
  options: {
    informationSetId: string;
    cutoff: string;
    informationSet?: Parameters<typeof ensureInformationSet>[1];
    runKind?: 'replay' | 'canary';
  },
): Promise<K4ValuationBandPersistence> {
  const cutoffAt = Date.parse(options.cutoff);
  if (Number.isNaN(cutoffAt)) throw new Error('K4 valuation-band cutoff must be parseable');
  if (options.informationSet && plans.length > 0) {
    await ensureInformationSet(client, options.informationSet, options.runKind ?? 'canary');
  }
  const valuationEstimateKeys: string[] = [];
  let insertedCount = 0;
  let skippedCount = 0;
  let supersededCount = 0;
  for (const plan of plans) {
    if (Date.parse(plan.asOfAt) > cutoffAt) {
      throw new Error(
        `valuation band ${plan.valuationEstimateKey} would be as-of after the cutoff`,
      );
    }
    // 밴드는 상한이 하한보다 작을 수 없다. DB CHECK 가 같은 것을 보지만, 여기서 먼저
    // 끊는 이유는 CHECK 위반이 트랜잭션을 통째로 죽이기 때문이다 — 한 종목의 산술
    // 결함이 나머지 전부를 못 쓰게 만들면 안 된다.
    if (!(plan.upperEstimate >= plan.lowerEstimate)) {
      throw new Error(`valuation band ${plan.valuationEstimateKey} has an inverted range`);
    }
    const existing = await client.query(EXISTING_VALUATION_SQL, [plan.valuationEstimateKey]);
    const prior = existing.rows[0];
    if (prior && sameBand(prior as { lower_estimate: unknown; upper_estimate: unknown }, plan)) {
      skippedCount += 1;
      valuationEstimateKeys.push(plan.valuationEstimateKey);
      continue;
    }
    const revisionNo = prior ? Number(prior.revision_no) + 1 : 1;
    if (!Number.isSafeInteger(revisionNo) || revisionNo < 1) {
      throw new Error(`valuation band ${plan.valuationEstimateKey} has an unreadable revision_no`);
    }
    const supersedes = prior
      ? positiveId(
          prior.valuation_estimate_revision_id,
          'supersedes_valuation_estimate_revision_id',
        )
      : null;
    const derivation = await insertSealedDerivation(client, {
      // 정정은 **자기 계보**를 갖는다. 리비전 2 가 리비전 1 의 derivation 을 다시
      // 가리키면 고친 산수가 안 고친 파라미터를 인용하게 된다.
      key: revisionNo === 1 ? plan.derivationKey : `${plan.derivationKey}:r${revisionNo}`,
      kind: 'calculation',
      method: plan.methodKey,
      outputType: 'valuation_estimate_revision',
      outputLocator: { valuation_estimate_key: plan.valuationEstimateKey },
      parameters: plan.parameters,
      inputs: plan.numericFactInputs.map((input) => ({
        kind: 'numeric_fact' as const,
        numericFactId: input.numericFactId,
        role: input.role,
      })),
    });
    const inserted = await client.query(INSERT_VALUATION_SQL, [
      plan.valuationEstimateKey,
      plan.securityEntityId,
      plan.methodKey,
      plan.lowerEstimate,
      plan.upperEstimate,
      plan.estimateUnit,
      plan.asOfAt,
      plan.horizon,
      options.informationSetId,
      positiveId(derivation.derivationId, 'derivation_id'),
      JSON.stringify(
        revisionNo === 1
          ? plan.metadata
          : {
              ...plan.metadata,
              // 정정이라는 사실 자체가 원장에 남아야 한다. 값만 바뀌면 다음 사람은
              // 왜 리비전이 둘인지 계보를 뒤져야 한다.
              supersedes_revision_no: revisionNo - 1,
              // 이유를 이름으로 박지 않는다. 무엇이 달라졌는지는 같은 metadata 의
              // `producer_version` 이 말하고, 여기 남길 사실은 "다시 계산한 값이
              // 저장된 값과 달랐다" 뿐이다.
              revision_reason: 'recomputed_band_differs',
            },
      ),
      revisionNo,
      supersedes,
    ]);
    if (inserted.rows.length === 0) skippedCount += 1;
    else {
      insertedCount += 1;
      if (revisionNo > 1) supersededCount += 1;
    }
    valuationEstimateKeys.push(plan.valuationEstimateKey);
  }
  return { insertedCount, skippedCount, supersededCount, valuationEstimateKeys };
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const bucket = key(value);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function skipBucket(skip: K4ValuationBandSkip): string {
  return skip.multipleKey ? `${skip.multipleKey}:${skip.reason}` : skip.reason;
}

export async function executeK4ValuationBandJob(input: {
  client: K4QueryClient & K4PersistenceClient;
  args: K4ValuationBandArgs;
}): Promise<K4ValuationBandSummary[]> {
  const summaries: K4ValuationBandSummary[] = [];
  for (const cutoff of input.args.cutoffs) {
    // `securityLimit` 이 없다 — 밴드는 이미 가진 사실로 배수를 계산하는 싼
    // 연산이고, 커버리지를 좁힐 이유가 없다.
    //
    // 한때 기대 생산자만 10 종목으로 고정돼 있어 이 자리에 "그 비대칭을 물려받지
    // 않는다"고 적혀 있었다. 그 비대칭은 이제 없다: 기대 생산자도 `--security-limit`
    // 를 받고 기본값이 무제한이다. 여기는 플래그조차 없다는 것만 다르다.
    const subjects = await loadK4ValuationBandSubjects(input.client, { cutoff });
    const { series, skips } = buildK4ValuationSeries(subjects);
    const prices = await loadK4ValuationBandPrices(input.client, {
      cutoff,
      requests: k4ValuationPriceRequests(series),
    });
    const currentPrices = await loadK4ValuationBandCurrentPrices(input.client, {
      cutoff,
      securityEntityIds: [...new Set(series.map((entry) => entry.securityEntityId))],
    });
    const planned = planK4ValuationBands({
      informationSet: subjects.informationSet,
      securities: subjects.securities,
      series,
      prices,
      currentPrices,
    });
    const allSkips = [...skips, ...planned.skips];
    const summary: Omit<K4ValuationBandSummary, 'persistence'> = {
      cutoff,
      mode: input.args.mode,
      informationSetId: subjects.informationSet.informationSetId,
      plannedCount: planned.plans.length,
      plannedByMethod: countBy(planned.plans, (plan) => plan.methodKey),
      plannedSecurityCount: new Set(planned.plans.map((plan) => plan.securityEntityId)).size,
      skipReasons: countBy(allSkips, skipBucket),
    };
    if (input.args.mode === 'dry-run') {
      summaries.push({ ...summary, persistence: null });
      continue;
    }
    const persistence = await withK4MarketIntelligenceTransaction(
      input.client,
      { mode: input.args.mode, cutoff },
      async () =>
        persistK4ValuationBands(input.client, planned.plans, {
          informationSetId: subjects.informationSet.informationSetId,
          cutoff,
          informationSet: subjects.informationSet,
          runKind: input.args.runKind,
        }),
    );
    summaries.push({ ...summary, persistence });
  }
  return summaries;
}

export const K4_VALUATION_BAND_JOB_VERSION = K4_VALUATION_BAND_VERSION;
