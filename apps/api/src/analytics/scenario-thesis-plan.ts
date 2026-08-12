/**
 * CAV 블록 9 · 정본 05 §7 — thesis / competing hypotheses.
 *
 * 정본이 요구하는 것은 bull/base/bear **가격 시나리오가 아니다.** §7 의 첫
 * 문장은 "한 종목의 '원인'을 하나로 고정하지 않는다" 이고, 마지막 문장은
 * "각 가설이 무엇을 설명하고 무엇을 반증할지 함께 저장한다" 이다. 즉 분기는
 * 같은 관측을 놓고 **어느 준거틀이 맞는가**를 다투는 경쟁 해석이다.
 * 040 스키마의 bull/base/bear 는 그 셋을 담는 그릇일 뿐이다.
 *
 * ## 무엇 위에 세우는가
 *
 * 정본 §7 은 여섯 요소를 든다. 2026-08-12 라이브 실측으로 종목별 확보 현황:
 *
 * | 요소 | 원천 | 297종목 중 |
 * | --- | --- | --- |
 * | valuation state | `analytics.valuation_estimate_revision` | **52** |
 * | supporting facts | 같은 행의 표본 창·관측 수 | 52 |
 * | coverage/uncertainty | 같은 행의 `observation_count`·`dropped_observations` | 52 |
 * | counter evidence | 방법 간 판정 불일치 | 52 중 10 |
 * | expected catalysts | `market.scheduled_event` | 반도체 1종목 — 쓰지 않는다 |
 * | invalidation | 자동 원천 없음 — 아래에서 규칙으로 만든다 | 52 |
 *
 * coverage 를 `governance.coverage_ledger` 에서 가져오지 않는다. 그 원장은
 * `market.financial_fact` 한 계열뿐이고 OpenDART 발행사(KR) 기준이라 밴드가
 * 있는 종목(US 중심)과 **교집합이 0**이다. 그 0은 종목의 성질이 아니라 어느
 * 수집기가 돌았는가의 결과다. 밴드 자신의 표본 수와 버린 관측이 이 thesis 의
 * 불확실성을 이미 정확히 말하므로 그것을 쓴다.
 *
 * catalyst 는 넣지 않는다. `market.scheduled_event` 미래 198건 중 우리 엔티티에
 * 붙는 실적 일정은 2건이고 반도체 종목으로는 1건이다. 297분의 1에 불을 켜는
 * 요소는 조인 값을 하지 못한다 — payload 에 **부재로 이름을 적고** 넘어간다.
 *
 * ## 왜 "구간 밖" 이 기본 사례인가
 *
 * 실측(2026-08-12, 최신 리비전 81개 밴드): 상단 밖 39 · 하단 밖 21 · 구간 안 21.
 * 구간을 벗어난 관측이 **다수**다. 그러므로 "bull = 구간 상단" 같은 매핑은
 * 애초에 성립하지 않는다 — AMD 는 현재 배수 9.65 에 구간이 1.97~3.89 로, 분기가
 * 서술할 범위 자체의 2.5배 밖에 있다. 분기는 값의 위치가 아니라 **준거틀의
 * 유효성**을 다퉈야 한다.
 *
 * ## 예측 언어를 쓰지 않는 이유
 *
 * 제품 경계(CLAUDE.md)가 매수/매도·목표가·"오를 것" 을 금지한다. 아래 서술은
 * 전부 **이미 관측된 것에 대한 해석**이고 앞으로의 방향을 말하지 않는다.
 * bull/bear 라는 키 이름은 스키마 어휘이고 화면에 그대로 나가지 않는다.
 */

/** 최신 리비전 한 건. `metadata` 에서 뽑아 둔 값까지 함께 온다. */
export type ValuationBandInput = {
  methodKey: string;
  lowerEstimate: number;
  upperEstimate: number;
  estimateUnit: string;
  horizon: string;
  currentMultiple: number | null;
  observationCount: number | null;
  valuationEstimateKey: string;
};

export type ScenarioThesisSubject = {
  securityEntityId: number;
  bands: readonly ValuationBandInput[];
  /**
   * 이 종목의 밴드가 딛고 선 관측. 커널이 도출 입력을 같은 도출 안으로 제한해
   * 밴드 도출을 그대로 지목할 수 없으므로, 계보는 한 칸 건너뛰어 사실로 간다.
   */
  numericFactIds: readonly number[];
};

/** 현재 관측이 자기 이력 구간의 어디에 있는가. */
export type BandPosition = 'above' | 'inside' | 'below' | 'unknown';

export type PlannedInvalidation = {
  condition: string;
  counterEvidenceLocator: Record<string, unknown>;
  monitoredSignal: string;
};

export type PlannedBranch = {
  branchKind: 'bull' | 'base' | 'bear';
  branchKey: string;
  narrative: string;
  metadata: Record<string, unknown>;
  invalidations: readonly PlannedInvalidation[];
};

export type PlannedScenarioSet = {
  scenarioSetKey: string;
  subjectEntityId: number;
  title: string;
  metadata: Record<string, unknown>;
  branches: readonly PlannedBranch[];
};

export type ScenarioThesisSkip = {
  securityEntityId: number;
  reason: 'no_band' | 'no_current_multiple' | 'below_minimum_observations';
};

/**
 * 표본이 이보다 적으면 구간을 백분위로 부를 수 없다. 밴드 생산자가 이미 같은
 * 하한을 걸지만 여기서 다시 세는 이유는, 이 생산자가 밴드를 **해석**하기
 * 때문이다 — 관측 3개짜리 구간 위에 세 갈래 해석을 얹으면 해석이 표본보다
 * 많아진다.
 */
export const MINIMUM_BAND_OBSERVATIONS = 4;

export function bandPosition(band: ValuationBandInput): BandPosition {
  if (band.currentMultiple === null) return 'unknown';
  if (band.currentMultiple > band.upperEstimate) return 'above';
  if (band.currentMultiple < band.lowerEstimate) return 'below';
  return 'inside';
}

const positionLabels: Record<Exclude<BandPosition, 'unknown'>, string> = {
  above: '이력 구간보다 높다',
  inside: '이력 구간 안에 있다',
  below: '이력 구간보다 낮다',
};

function locatorFor(band: ValuationBandInput): Record<string, unknown> {
  // 반대 근거를 어디서 찾을지 기계가 따라갈 수 있게 남긴다. 산문으로 "밸류에이션
  // 자료를 보라" 고 적으면 다음 사람이 어느 행인지 다시 찾아야 한다.
  return {
    table: 'analytics.valuation_estimate_revision',
    valuation_estimate_key: band.valuationEstimateKey,
    method_key: band.methodKey,
    field: 'metadata.current_multiple',
  };
}

/**
 * 세 갈래는 **준거틀에 대한 경쟁 해석**이다.
 *
 * - `bull`  이력 구간이 더 이상 이 자산을 설명하지 못한다는 해석
 * - `base`  지금 확정되는 것은 관측의 위치뿐이라는 해석
 * - `bear`  이력 구간이 여전히 유효하고 현재가 그 이탈이라는 해석
 *
 * 어느 것도 가격 방향을 말하지 않는다. 셋 다 다음 관측 한 번으로 반증된다는
 * 점이 정본 §7 이 요구하는 "무엇을 반증할지" 다.
 */
export function planScenarioThesis(
  subject: ScenarioThesisSubject,
  options: { asOfDate: string },
): { plan: PlannedScenarioSet | null; skip: ScenarioThesisSkip | null } {
  if (subject.bands.length === 0) {
    return { plan: null, skip: { securityEntityId: subject.securityEntityId, reason: 'no_band' } };
  }

  const usable = subject.bands.filter(
    (band) =>
      band.currentMultiple !== null && (band.observationCount ?? 0) >= MINIMUM_BAND_OBSERVATIONS,
  );
  if (usable.length === 0) {
    const anyCurrent = subject.bands.some((band) => band.currentMultiple !== null);
    return {
      plan: null,
      skip: {
        securityEntityId: subject.securityEntityId,
        reason: anyCurrent ? 'below_minimum_observations' : 'no_current_multiple',
      },
    };
  }

  const positions = usable.map((band) => ({ band, position: bandPosition(band) }));
  const distinct = [...new Set(positions.map((entry) => entry.position))];
  const agreed = distinct.length === 1;
  const primary = positions[0];
  // `usable.length === 0` 은 위에서 이미 걸러졌지만 타입은 그것을 모른다.
  // 비검사 인덱싱 대신 여기서 한 번 좁힌다.
  if (!primary) throw new Error('unreachable: usable bands were checked above');
  const setKey = `thesis:own-history:${subject.securityEntityId}:${options.asOfDate}`;

  const observed = positions
    .map(
      ({ band, position }) =>
        `${band.methodKey} 기준 현재 배수가 ${positionLabels[position as Exclude<BandPosition, 'unknown'>]}`,
    )
    .join('; ');

  const branchMeta = (kind: string) => ({
    reading: kind,
    positions: positions.map(({ band, position }) => ({
      method_key: band.methodKey,
      position,
      lower_estimate: band.lowerEstimate,
      upper_estimate: band.upperEstimate,
      current_multiple: band.currentMultiple,
      observation_count: band.observationCount,
      estimate_unit: band.estimateUnit,
    })),
    methods_agree: agreed,
    // 정본 §7 의 여섯 요소 중 이 thesis 가 **갖지 못한 것**을 이름으로 남긴다.
    // 빈 자리를 조용히 두면 다음 사람이 "촉매가 없는 종목" 으로 읽는다.
    absent_elements: {
      expected_catalysts: 'no_calendar_overlap',
    },
  });

  const branches: PlannedBranch[] = [
    {
      branchKind: 'bull',
      branchKey: `${setKey}:frame-broken`,
      narrative:
        '이 자산의 과거 배수 구간이 더 이상 현재를 설명하지 못한다는 해석입니다. 사업 구성이나 회계 기준이 표본 기간과 달라졌다면 구간 자체를 다시 잡아야 합니다.',
      metadata: branchMeta('history_frame_no_longer_applies'),
      invalidations: [
        {
          condition:
            '다음 관측에서 배수가 이력 구간 안으로 돌아오면 구간이 여전히 이 자산을 설명한다는 뜻이므로 이 해석은 성립하지 않습니다.',
          counterEvidenceLocator: locatorFor(primary.band),
          monitoredSignal: 'valuation_band_position',
        },
      ],
    },
    {
      branchKind: 'base',
      branchKey: `${setKey}:observation-only`,
      narrative: agreed
        ? `지금 확정할 수 있는 것은 관측의 위치뿐이라는 해석입니다. ${observed}는 사실이지만, 그것이 준거틀의 문제인지 자산의 변화인지는 이 자료만으로 가르지 못합니다.`
        : `산출 방법마다 판정이 갈립니다 — ${observed}. 방법 간 불일치 자체가 지금 확정할 수 있는 것의 한계입니다.`,
      metadata: branchMeta('position_is_all_that_is_settled'),
      invalidations: [
        {
          condition: agreed
            ? '두 산출 방법이 서로 다른 위치를 가리키기 시작하면 "위치가 확정됐다" 는 이 해석의 전제가 깨집니다.'
            : '산출 방법들이 같은 위치로 모이면 불일치를 근거로 삼은 이 해석은 자리를 내줍니다.',
          counterEvidenceLocator: locatorFor(primary.band),
          monitoredSignal: 'valuation_method_agreement',
        },
      ],
    },
    {
      branchKind: 'bear',
      branchKey: `${setKey}:frame-holds`,
      narrative:
        '과거 배수 구간이 여전히 유효하고 현재 관측이 그 이탈이라는 해석입니다. 이 해석에서는 표본 기간의 조건이 아직 이 자산을 설명합니다.',
      metadata: branchMeta('history_frame_still_applies'),
      invalidations: [
        {
          condition:
            '구간 밖 관측이 다음 표본 갱신까지 이어지면 이력 구간을 다시 계산해야 하므로 이 해석은 유지되지 않습니다.',
          counterEvidenceLocator: locatorFor(primary.band),
          monitoredSignal: 'valuation_band_position',
        },
      ],
    },
  ];

  return {
    plan: {
      scenarioSetKey: setKey,
      subjectEntityId: subject.securityEntityId,
      title: '자기 이력 구간을 놓고 갈리는 해석',
      metadata: {
        anchor: 'own_history_valuation_band',
        methods_agree: agreed,
        method_count: usable.length,
        // 이 thesis 가 서 있는 horizon. 정본 §7 은 horizon 별 thesis 를 요구하는데
        // 오늘 우리가 가진 구간은 이것 하나뿐이라, 다른 horizon 이 없다는 사실을
        // 비워 두지 않고 적는다.
        horizon: primary.band.horizon,
        horizons_absent: 'only trailing annual history is produced today',
      },
      branches,
    },
    skip: null,
  };
}
