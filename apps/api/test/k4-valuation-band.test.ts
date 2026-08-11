import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseK4ValuationBandArgs,
  persistK4ValuationBands,
} from '../src/analytics/k4-valuation-band-writer.ts';
import {
  buildK4ValuationSeries,
  k4ValuationPriceRequests,
  percentile,
  planK4ValuationBands,
  K4_VALUATION_BAND_MINIMUM_OBSERVATIONS,
  k4SplitAdjustmentFactor,
  type K4ValuationBandFact,
  type K4ValuationBandSecurity,
  type K4ValuationSplit,
} from '../src/analytics/k4-valuation-band.ts';

const CUTOFF = '2026-08-11T16:00:00.000Z';

const informationSet = {
  informationSetId: 'k4:20260811:testtesttesttesttest',
  validCutoff: CUTOFF,
  sourceAvailableCutoff: CUTOFF,
  systemKnownCutoff: CUTOFF,
  marketObservationCutoff: CUTOFF,
  semanticSnapshotId: 'snapshot-1',
};

const security: K4ValuationBandSecurity = {
  securityEntityId: 1,
  issuerEntityId: 9,
  market: 'US',
  ticker: 'AAA',
  currency: 'USD',
  playbookKey: 'semiconductor',
  declaredValuationMethods: ['ev_sales_cycle_adjusted', 'replacement_capacity'],
};

let nextFactId = 1;

function fact(overrides: Partial<K4ValuationBandFact>): K4ValuationBandFact {
  return {
    numericFactId: nextFactId++,
    entityId: 9,
    conceptNamespace: 'us-gaap',
    conceptKey: 'StockholdersEquity',
    value: 1000,
    unit: 'currency',
    currency: 'USD',
    observationDate: '2021-12-31',
    periodDays: null,
    hasDimensionMember: false,
    pitClass: 'PIT_A_NATIVE_VINTAGE',
    availableAt: '2022-01-15T00:00:00.000Z',
    knownAt: '2022-01-15T00:00:00.000Z',
    ...overrides,
  };
}

/** `years` 각각에 대해 주식수 100 · 자본 `equity` 를 놓는다. 기본 BPS = equity/100. */
function annualBook(years: readonly number[], equity = 1000): K4ValuationBandFact[] {
  return years.flatMap((year) => [
    fact({
      conceptNamespace: 'dei',
      conceptKey: 'EntityCommonStockSharesOutstanding',
      unit: 'shares',
      currency: null,
      value: 100,
      observationDate: `${year}-12-31`,
      availableAt: `${year + 1}-01-15T00:00:00.000Z`,
      knownAt: `${year + 1}-01-15T00:00:00.000Z`,
    }),
    fact({
      value: equity,
      observationDate: `${year}-12-31`,
      availableAt: `${year + 1}-01-15T00:00:00.000Z`,
      knownAt: `${year + 1}-01-15T00:00:00.000Z`,
    }),
  ]);
}

/**
 * 연도 → 종가. 회계연도 `y` 의 관측일 종가는 `10*(y-2019)` 다.
 *
 * 픽스처의 연도는 전부 컷오프(2026-08-11)보다 **한 해 이상 앞**이다. `annualBook` 이
 * `available_at` 을 기말 다음 해 1월로 놓기 때문에, 2026 회계연도를 쓰면 그 팩트가
 * PIT 게이트에 걸려 통째로 사라진다 — 처음 이 파일을 쓸 때 그렇게 틀렸다.
 */
const CLOSES: Record<number, number> = {
  2019: 10,
  2020: 20,
  2021: 30,
  2022: 40,
  2023: 50,
  2024: 60,
  2025: 70,
};

function bandFor(
  facts: readonly K4ValuationBandFact[],
  closes: Record<number, number> = CLOSES,
  splits: readonly K4ValuationSplit[] = [],
) {
  const { series } = buildK4ValuationSeries({
    informationSet,
    securities: [security],
    facts,
    splits,
  });
  const prices = k4ValuationPriceRequests(series).map((request) => ({
    securityEntityId: request.securityEntityId,
    observationDate: request.observationDate,
    sessionDate: request.observationDate,
    close: closes[Number(request.observationDate.slice(0, 4))] ?? 0,
  }));
  return {
    series,
    ...planK4ValuationBands({
      informationSet,
      securities: [security],
      series,
      prices: prices.filter((price) => price.close > 0),
      currentPrices: [{ securityEntityId: 1, sessionDate: '2026-08-10', close: 30 }],
    }),
  };
}

describe('종가가 소급조정돼 있으므로 주식수도 같은 기준으로 옮긴다', () => {
  const YEARS = [2020, 2021, 2022, 2023, 2024] as const;

  it('권리락일 **뒤**의 분할만 곱한다 — 당일 바는 이미 분할 후 가격이다', () => {
    const splits: K4ValuationSplit[] = [
      { securityEntityId: 1, effectiveDate: '2022-06-30', ratio: 10 },
    ];
    assert.equal(k4SplitAdjustmentFactor(splits, '2021-12-31'), 10);
    // 관측일이 권리락일 당일이면 그 분할은 이미 반영돼 있다.
    assert.equal(k4SplitAdjustmentFactor(splits, '2022-06-30'), 1);
    assert.equal(k4SplitAdjustmentFactor(splits, '2022-12-31'), 1);
  });

  it('여러 분할은 누적해서 곱한다', () => {
    const splits: K4ValuationSplit[] = [
      { securityEntityId: 1, effectiveDate: '2022-06-30', ratio: 4 },
      { securityEntityId: 1, effectiveDate: '2024-06-30', ratio: 10 },
    ];
    assert.equal(k4SplitAdjustmentFactor(splits, '2021-12-31'), 40);
    assert.equal(k4SplitAdjustmentFactor(splits, '2023-12-31'), 10);
  });

  it('관측창 전체를 덮는 분할은 밴드를 그 계수만큼 옮긴다', () => {
    // 정방향 분할은 밴드를 **과소** 계상시킨다. 조정된 종가는 낮은데 주식수는
    // 분할 전 그대로여서 주당값이 분할계수만큼 크기 때문이다. 과소는 그럴듯한
    // 범위에 착지하므로 결과값만으로는 보이지 않는다.
    const facts = annualBook([...YEARS]);
    const uncorrected = bandFor(facts).plans[0]!;
    const corrected = bandFor(facts, CLOSES, [
      { securityEntityId: 1, effectiveDate: '2025-06-30', ratio: 10 },
    ]).plans[0]!;
    assert.equal(corrected.lowerEstimate, uncorrected.lowerEstimate * 10);
    assert.equal(corrected.upperEstimate, uncorrected.upperEstimate * 10);
  });

  it('주식병합은 반대 방향으로 옮긴다', () => {
    const facts = annualBook([...YEARS]);
    const uncorrected = bandFor(facts).plans[0]!;
    const corrected = bandFor(facts, CLOSES, [
      { securityEntityId: 1, effectiveDate: '2025-06-30', ratio: 0.05 },
    ]).plans[0]!;
    assert.ok(Math.abs(corrected.upperEstimate - uncorrected.upperEstimate * 0.05) < 1e-9);
  });

  it('관측창 안에 분할이 없으면 값이 그대로다 — 정정의 검증 지점', () => {
    const facts = annualBook([...YEARS]);
    const uncorrected = bandFor(facts).plans[0]!;
    const withOldSplit = bandFor(facts, CLOSES, [
      // 관측창보다 앞선 분할은 아무 관측에도 걸리지 않는다.
      { securityEntityId: 1, effectiveDate: '2015-01-01', ratio: 7 },
    ]).plans[0]!;
    assert.equal(withOldSplit.lowerEstimate, uncorrected.lowerEstimate);
    assert.equal(withOldSplit.upperEstimate, uncorrected.upperEstimate);
    assert.equal(withOldSplit.metadata.split_adjusted_observation_count, 0);
  });

  it('다른 증권의 분할은 이 증권에 곱하지 않는다', () => {
    // 분할은 증권 단위로 기록되고 팩트는 발행사 단위로 기록된다. 두 축을 섞으면
    // 아무 관계 없는 종목의 밴드가 조용히 계수만큼 틀린다.
    const facts = annualBook([...YEARS]);
    const corrected = bandFor(facts, CLOSES, [
      { securityEntityId: 999, effectiveDate: '2025-06-30', ratio: 10 },
    ]).plans[0]!;
    assert.equal(corrected.lowerEstimate, bandFor(facts).plans[0]!.lowerEstimate);
  });

  it('조정 계수를 관측마다 계보에 남긴다', () => {
    const plan = bandFor(annualBook([...YEARS]), CLOSES, [
      { securityEntityId: 1, effectiveDate: '2022-06-30', ratio: 10 },
    ]).plans[0]!;
    assert.equal(plan.parameters.share_basis, 'split_adjusted_to_price_basis');
    const sessions = plan.parameters.price_sessions as { split_adjustment_factor: number }[];
    assert.deepEqual(
      sessions.map((session) => session.split_adjustment_factor),
      [10, 10, 1, 1, 1],
    );
    assert.equal(plan.metadata.split_adjusted_observation_count, 2);
  });
});

describe('percentile', () => {
  it('interpolates linearly rather than snapping to the nearest observation', () => {
    // 계단식 백분위는 표본 하나가 들고날 때 밴드를 튀게 만든다. 이 밴드는 매일
    // 다시 계산되므로 그 튐이 곧 "밸류에이션이 바뀌었다" 로 읽힌다.
    assert.equal(percentile([1, 2, 3, 4, 5], 0.25), 2);
    assert.equal(percentile([1, 2, 3, 4], 0.25), 1.75);
    assert.equal(percentile([1, 2, 3, 4], 0.75), 3.25);
  });

  it('refuses an empty sample instead of returning NaN', () => {
    assert.throws(() => percentile([], 0.5));
  });
});

describe('the minimum sample is a refusal, not a wider band', () => {
  it('emits nothing below five annual observations', () => {
    assert.equal(K4_VALUATION_BAND_MINIMUM_OBSERVATIONS, 5);
    const { plans, skips } = bandFor(annualBook([2020, 2021, 2022, 2023]));
    assert.equal(plans.length, 0);
    assert.ok(
      skips.some(
        (skip) =>
          skip.reason === 'insufficient_observations' && skip.multipleKey === 'price_to_book',
      ),
    );
  });

  it('emits a band at exactly five and says how many observations it stands on', () => {
    const { plans } = bandFor(annualBook([2020, 2021, 2022, 2023, 2024]));
    assert.equal(plans.length, 1);
    const plan = plans[0]!;
    // BPS = 1000/100 = 10 이므로 배수는 2,3,4,5,6. p25=3, p75=5.
    assert.equal(plan.lowerEstimate, 3);
    assert.equal(plan.upperEstimate, 5);
    assert.equal(plan.observationCount, 5);
    assert.equal(plan.metadata.observation_count, 5);
  });
});

describe('the band is a multiple, and never a price', () => {
  const { plans } = bandFor(annualBook([2020, 2021, 2022, 2023, 2024]));
  const plan = plans[0]!;

  it('carries a ratio unit', () => {
    assert.equal(plan.estimateUnit, 'ratio');
    assert.equal(plan.metadata.estimate_is_multiple_not_price, true);
  });

  it('puts no currency amount anywhere in the payload it writes', () => {
    // 함의 가격(밴드 × 현재 주당장부가)을 metadata 에 실으면 단위를 비율로 고른
    // 이유가 통째로 무너진다. 현재 위치를 가늠할 재료는 **현재 배수**뿐이다.
    const serialized = JSON.stringify(plan.metadata);
    assert.doesNotMatch(serialized, /implied_price|price_range|target/i);
    assert.equal(plan.metadata.current_multiple, 3);
  });

  it('records the playbook methods it did not implement', () => {
    assert.deepEqual(plan.metadata.playbook_declared_valuation_methods, [
      'ev_sales_cycle_adjusted',
      'replacement_capacity',
    ]);
    assert.equal(plan.metadata.implements_playbook_method, false);
  });

  it('names the horizon as a trailing window, not a forecast', () => {
    assert.equal(plan.horizon, 'trailing_annual_history');
  });
});

describe('observations the CHECK constraint would happily accept and this planner drops', () => {
  /** 여섯 해가 온전한 기준선. 각 사례는 여기에 2019 회계연도 하나를 더 얹는다. */
  const years = [2020, 2021, 2022, 2023, 2024, 2025];

  /** 2019 회계연도의 주식수. 분모 쪽 결함만 남기기 위해 분자는 항상 멀쩡하게 둔다. */
  function shares2019(): K4ValuationBandFact {
    return fact({
      conceptNamespace: 'dei',
      conceptKey: 'EntityCommonStockSharesOutstanding',
      unit: 'shares',
      currency: null,
      value: 100,
      observationDate: '2019-12-31',
      availableAt: '2020-01-15T00:00:00.000Z',
      knownAt: '2020-01-15T00:00:00.000Z',
    });
  }

  function equity2019(overrides: Partial<K4ValuationBandFact>): K4ValuationBandFact {
    return fact({
      value: 1000,
      observationDate: '2019-12-31',
      availableAt: '2020-01-15T00:00:00.000Z',
      knownAt: '2020-01-15T00:00:00.000Z',
      ...overrides,
    });
  }

  it('drops a dimensional member instead of treating it as the total', () => {
    // 라이브 실측: 삼성전자 2025-12-31 의 `ifrs-full:Equity` 는 자본총계 옆에
    // 자본금·이익잉여금 같은 구성요소 행을 함께 갖는다. 걸러내지 않으면 PBR 이
    // 수백 배로 나오고도 모든 CHECK 를 통과한다.
    const facts = [
      ...annualBook(years),
      shares2019(),
      equity2019({ value: 1, hasDimensionMember: true }),
    ];
    assert.equal(bandFor(facts).plans[0]?.observationCount, 6);
  });

  it('drops a non-positive book value rather than banding on nonsense', () => {
    const facts = [...annualBook(years), shares2019(), equity2019({ value: -500 })];
    const { plans, series } = bandFor(facts);
    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.observationCount, 6);
    assert.equal(series[0]?.drops.nonPositiveDenominator, 1);
  });

  it('drops an observation whose currency does not cancel against the listing', () => {
    const facts = [...annualBook(years), shares2019(), equity2019({ currency: 'EUR' })];
    const { plans, series } = bandFor(facts);
    assert.equal(plans[0]?.observationCount, 6);
    assert.equal(series[0]?.drops.currencyMismatch, 1);
  });

  it('drops an observation two sources disagree about instead of picking one', () => {
    const facts = [...annualBook(years), shares2019(), equity2019({}), equity2019({ value: 4321 })];
    const { plans, series } = bandFor(facts);
    assert.equal(plans[0]?.observationCount, 6);
    assert.equal(series[0]?.drops.ambiguousValue, 1);
  });

  it('drops a fact whose PIT class cannot be reconstructed', () => {
    const facts = [...annualBook(years), shares2019(), equity2019({ pitClass: 'PIT_E_UNKNOWN' })];
    assert.equal(bandFor(facts).plans[0]?.observationCount, 6);
  });

  it('drops a quarterly duration so the series stays annual', () => {
    const facts = [...annualBook(years), shares2019(), equity2019({ periodDays: 92 })];
    assert.equal(bandFor(facts).plans[0]?.observationCount, 6);
  });

  it('drops an observation whose session had no price within the lookback', () => {
    const facts = [...annualBook(years), shares2019(), equity2019({})];
    // 2019 에만 종가가 없다. 관측은 계획됐지만 가격이 없어 배수가 만들어지지 않는다.
    const { plans } = bandFor(facts, { ...CLOSES, 2019: 0 });
    const plan = plans[0]!;
    assert.equal(plan.observationCount, 6);
    assert.equal((plan.metadata.dropped_observations as { missingPrice: number }).missingPrice, 1);
  });
});

describe('the series uses one concept, not whichever concept each year happens to have', () => {
  it('picks the concept with the most years and reports which one it used', () => {
    // 연도마다 다른 개념을 쓰면 분모가 해마다 다른 것을 재게 되고, 백분위는 그
    // 오염을 평균 내서 감춘다.
    const facts = [
      ...annualBook([2020, 2021, 2022, 2023, 2024]),
      fact({
        conceptNamespace: 'ifrs-full',
        conceptKey: 'Equity',
        value: 1,
        observationDate: '2022-12-31',
      }),
    ];
    const { plans } = bandFor(facts);
    assert.equal(plans[0]?.metadata.denominator_concept, 'us-gaap:StockholdersEquity');
    assert.equal(plans[0]?.lowerEstimate, 3);
  });
});

describe('arguments', () => {
  it('defaults to a dry run', () => {
    const args = parseK4ValuationBandArgs(['--live', '--cutoff', CUTOFF]);
    assert.equal(args.mode, 'dry-run');
    assert.equal(args.runKind, 'canary');
    assert.deepEqual(args.cutoffs, [CUTOFF]);
  });

  it('refuses a cutoff that is not canonical ISO', () => {
    assert.throws(() => parseK4ValuationBandArgs(['--live', '--cutoff', '2026-08-11']));
  });

  it('refuses a live run without a cutoff, because now() is not a business cutoff', () => {
    assert.throws(() => parseK4ValuationBandArgs(['--live', '--apply']));
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    assert.throws(() => parseK4ValuationBandArgs(['--live', '--cutoff', CUTOFF, '--nope']));
  });

  it('refuses two write modes at once', () => {
    assert.throws(() =>
      parseK4ValuationBandArgs(['--live', '--cutoff', CUTOFF, '--apply', '--rehearse']),
    );
  });
});

/**
 * 원장은 append-only 다 — `reject_k4_ledger_mutation` 이 UPDATE/DELETE 를 거부한다.
 * 그러므로 이미 쓴 밴드가 틀렸을 때 고치는 길은 supersede 뿐이고, 이 스위트는 그
 * 경로가 스키마 CHECK(`revision_no=1 AND supersedes IS NULL` 또는 `revision_no>1 AND
 * supersedes IS NOT NULL`)와 같은 모양을 내는지 본다.
 */
describe('정정은 덮어쓰기가 아니라 supersede 다', () => {
  function tag(sql: string): string {
    return /\/\* (k4_[a-z0-9_]+) \*\//.exec(sql)?.[1] ?? 'untagged';
  }

  class FakeBandClient {
    readonly calls: { tag: string; params: readonly unknown[] }[] = [];
    readonly stored: Record<string, unknown>[];

    constructor(stored: Record<string, unknown>[] = []) {
      this.stored = stored;
    }

    async query(sql: string, params: readonly unknown[] = []) {
      const queryTag = tag(sql);
      this.calls.push({ tag: queryTag, params });
      const rows: Record<string, unknown>[] = (() => {
        switch (queryTag) {
          case 'k4_read_valuation_estimate':
            return this.stored;
          case 'k4_insert_derivation':
            return [{ derivation_id: 21 }];
          case 'k4_insert_derivation_step':
            return [{ derivation_step_id: 22 }];
          case 'k4_compute_derivation_digest':
            return [{ derivation_digest: 'd'.repeat(64) }];
          case 'k4_seal_derivation':
            return [{ derivation_id: 21 }];
          case 'k4_insert_valuation_estimate':
            return [{ valuation_estimate_revision_id: 77 }];
          default:
            return [];
        }
      })();
      return { rows, rowCount: rows.length };
    }
  }

  const plan = () => bandFor(annualBook([2020, 2021, 2022, 2023, 2024])).plans[0]!;

  function insertCall(client: FakeBandClient) {
    return client.calls.find((call) => call.tag === 'k4_insert_valuation_estimate')!;
  }

  it('첫 기록은 리비전 1 이고 아무것도 인용하지 않는다', async () => {
    const client = new FakeBandClient([]);
    const result = await persistK4ValuationBands(client as never, [plan()], {
      informationSetId: informationSet.informationSetId,
      cutoff: CUTOFF,
    });
    assert.equal(result.insertedCount, 1);
    assert.equal(result.supersededCount, 0);
    const call = insertCall(client);
    assert.equal(call.params[11], 1);
    assert.equal(call.params[12], null);
  });

  it('값이 그대로면 아무것도 쓰지 않는다 — 리비전은 값이 달라졌을 때만 늘어난다', async () => {
    const existing = plan();
    const client = new FakeBandClient([
      {
        valuation_estimate_revision_id: 5,
        revision_no: 1,
        lower_estimate: String(existing.lowerEstimate),
        upper_estimate: String(existing.upperEstimate),
      },
    ]);
    const result = await persistK4ValuationBands(client as never, [existing], {
      informationSetId: informationSet.informationSetId,
      cutoff: CUTOFF,
    });
    assert.equal(result.insertedCount, 0);
    assert.equal(result.skippedCount, 1);
    assert.ok(!client.calls.some((call) => call.tag === 'k4_insert_valuation_estimate'));
  });

  it('값이 달라지면 직전 리비전을 인용한 다음 리비전을 쓴다', async () => {
    const client = new FakeBandClient([
      {
        valuation_estimate_revision_id: 5,
        revision_no: 1,
        lower_estimate: '0.5',
        upper_estimate: '0.9',
      },
    ]);
    const result = await persistK4ValuationBands(client as never, [plan()], {
      informationSetId: informationSet.informationSetId,
      cutoff: CUTOFF,
    });
    assert.equal(result.insertedCount, 1);
    assert.equal(result.supersededCount, 1);
    const call = insertCall(client);
    assert.equal(call.params[11], 2);
    assert.equal(call.params[12], 5);
    const metadata = JSON.parse(String(call.params[10])) as Record<string, unknown>;
    assert.equal(metadata.supersedes_revision_no, 1);
    assert.equal(metadata.revision_reason, 'recomputed_band_differs');
  });

  it('정정은 자기 계보를 갖는다 — 리비전 1 의 derivation 을 다시 가리키지 않는다', async () => {
    const client = new FakeBandClient([
      {
        valuation_estimate_revision_id: 5,
        revision_no: 1,
        lower_estimate: '0.5',
        upper_estimate: '0.9',
      },
    ]);
    await persistK4ValuationBands(client as never, [plan()], {
      informationSetId: informationSet.informationSetId,
      cutoff: CUTOFF,
    });
    const derivation = client.calls.find((call) => call.tag === 'k4_insert_derivation')!;
    assert.equal(derivation.params[0], `${plan().derivationKey}:r2`);
  });

  it('사슬은 1 에서 멈추지 않는다 — 리비전 2 위에는 3 이 온다', async () => {
    const client = new FakeBandClient([
      {
        valuation_estimate_revision_id: 6,
        revision_no: 2,
        lower_estimate: '0.5',
        upper_estimate: '0.9',
      },
    ]);
    await persistK4ValuationBands(client as never, [plan()], {
      informationSetId: informationSet.informationSetId,
      cutoff: CUTOFF,
    });
    const call = insertCall(client);
    assert.equal(call.params[11], 3);
    assert.equal(call.params[12], 6);
  });
});
