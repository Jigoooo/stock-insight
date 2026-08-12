/**
 * 산업 판단표의 지표 키 → 읽는 사람 말.
 *
 * 원장(`governance.entity_playbook_current_v1`)이 들고 있는 것은 내부 키와
 * **영문 엔지니어 산문**이다. 반도체 행 실물:
 *
 *   key: 'product_generation_node'
 *   why: 'canonical/04 §5: product generation/node/interface. A part number
 *         without its node and interface cannot be compared across a transition.'
 *
 * 그대로 그리면 `canonical/04 §5:` 라는 내부 문서 참조가 화면에 나가 UX 헌법 7번
 * 위반이다. 그렇다고 원문을 기계 번역하면 문서를 인용한 문장이 인용 표시 없이
 * 우리 말이 된다.
 *
 * 그래서 **같은 뜻을 독자 말로 다시 썼다.** 각 줄은 "이 지표가 무엇인가" 가
 * 아니라 **"왜 이걸 먼저 보는가"** 를 말한다 — 정본 04 §5 가 `why` 를 지표마다
 * 요구하는 이유가 그것이고, 이름만 나열한 표는 판단표가 아니다.
 *
 * 표에 없는 키는 **세기만 한다**(`unnamedIndicatorCount`). 원문 키를 흘리는 것도,
 * 조용히 빠뜨리는 것도 하지 않는다 — 오늘 이 저장소에서 반복해 쓴 규칙이다.
 *
 * 실측(2026-08-13): 7개 플레이북 41개 키가 전수이고 아래가 그 전부다.
 */
export type IndicatorLabel = { name: string; why: string };

export const INDICATOR_LABELS: Record<string, IndicatorLabel> = {
  // ── 반도체 ──────────────────────────────────────────────────────────────
  product_generation_node: {
    name: '제품 세대와 공정 노드',
    why: '같은 이름의 부품이라도 세대와 공정이 다르면 다른 물건입니다. 세대를 빼고 비교한 수치는 비교가 아닙니다.',
  },
  design_win_qualification: {
    name: '설계 채택과 인증 단계',
    why: '채택이 확정돼도 매출은 인증을 거쳐 한참 뒤에 옵니다. 지금 실적이 아니라 다음 실적을 결정하는 자리입니다.',
  },
  capacity_wafer_fab_hbm: {
    name: '생산능력과 라인 배분',
    why: '수요가 늘어도 라인이 없으면 팔 수 없습니다. 어디에 얼마를 배분했는지가 향후 공급을 정합니다.',
  },
  customer_product_concentration: {
    name: '고객·제품 쏠림',
    why: '한 고객이나 한 제품에 몰려 있으면 그 하나가 흔들릴 때 전체가 흔들립니다.',
  },
  backlog_commitment_quality: {
    name: '수주잔고의 구속력',
    why: '잔고는 숫자보다 성격이 중요합니다. 취소할 수 있는 약속과 선급금이 걸린 약속은 다릅니다.',
  },
  technology_transition_substitution: {
    name: '기술 전환과 대체 위험',
    why: '전환기에는 잘 팔리던 제품이 가장 빨리 대체됩니다. 지금의 강점이 다음 세대에도 강점인지 봅니다.',
  },

  // ── 은행 ────────────────────────────────────────────────────────────────
  nim_definition: {
    name: '순이자마진의 정의',
    why: '은행마다 마진을 계산하는 기준이 달라, 정의를 맞추지 않은 비교는 성립하지 않습니다.',
  },
  deposit_beta_mix: {
    name: '예금 조달 구조',
    why: '금리가 움직일 때 예금 금리가 얼마나 따라 오르는지가 마진의 방향을 정합니다.',
  },
  asset_liability_repricing: {
    name: '자산·부채 금리 재조정 시차',
    why: '자산과 부채의 금리가 다시 매겨지는 시점이 어긋나면 같은 금리 변화가 반대로 작용합니다.',
  },
  credit_quality_provisions: {
    name: '자산 건전성과 충당금',
    why: '부실은 늦게 드러나고 충당금은 그 전에 쌓입니다. 충당금의 변화가 먼저 오는 신호입니다.',
  },
  liquidity_regulatory_capital: {
    name: '유동성과 규제 자본',
    why: '규제 기준에 여유가 없으면 영업이 아니라 규제가 의사결정을 정합니다.',
  },
  duration_funding_contagion: {
    name: '만기 구조와 자금 이탈',
    why: '조달이 짧고 운용이 길면 신뢰가 흔들릴 때 자금이 먼저 빠집니다.',
  },

  // ── 생명과학 ────────────────────────────────────────────────────────────
  trial_phase_cohort: {
    name: '임상 단계와 대상군',
    why: '같은 약도 단계와 대상군이 다르면 성공 확률이 전혀 다릅니다.',
  },
  endpoint_statistical_plan: {
    name: '평가지표와 통계 계획',
    why: '무엇을 성공으로 볼지 미리 정해두지 않으면 결과 해석이 사후에 바뀝니다.',
  },
  probability_of_success_rnpv: {
    name: '성공 확률과 위험조정 가치',
    why: '신약 가치는 성공 확률을 빼고 말할 수 없습니다. 확률을 바꾸면 가치가 통째로 바뀝니다.',
  },
  regulatory_milestone: {
    name: '규제 절차 일정',
    why: '허가 절차의 각 관문이 일정과 자금 계획을 함께 움직입니다.',
  },
  result_adverse_event: {
    name: '결과와 이상반응',
    why: '효능만 보고 안전성을 빼면 같은 결과가 다르게 읽힙니다.',
  },
  cash_runway_dilution: {
    name: '현금 소진 기간과 희석',
    why: '결과가 나오기 전에 현금이 떨어지면 조건이 나쁜 자금 조달을 받아들이게 됩니다.',
  },

  // ── 정유 ────────────────────────────────────────────────────────────────
  crack_spread: {
    name: '정제 마진',
    why: '원유 가격 자체보다 원유와 제품의 가격 차이가 수익을 정합니다.',
  },
  crude_slate_complexity: {
    name: '원유 종류와 설비 복잡도',
    why: '어떤 원유를 처리할 수 있는지가 마진 폭을 정합니다. 같은 유가에도 결과가 다릅니다.',
  },
  throughput_utilisation: {
    name: '가동률',
    why: '고정비가 큰 설비라 가동률이 곧 단위당 원가입니다.',
  },
  turnaround_schedule: {
    name: '정기보수 일정',
    why: '보수 기간에는 팔 물건이 없습니다. 일정이 분기 실적을 미리 설명합니다.',
  },
  inventory_holding_effect: {
    name: '재고 평가 효과',
    why: '유가가 움직이면 판 것이 아니라 쌓아둔 것에서 손익이 납니다. 영업 실력과 섞어 읽지 않습니다.',
  },

  // ── 자원 ────────────────────────────────────────────────────────────────
  reserves_grade_recovery: {
    name: '매장량·품위·회수율',
    why: '매장량만으로는 알 수 없습니다. 품위와 회수율이 실제로 캐낼 수 있는 양을 정합니다.',
  },
  production_cost_curve_capex: {
    name: '생산 원가 위치와 투자',
    why: '가격이 내려갈 때 누가 먼저 멈추는지는 원가 곡선의 어디에 있느냐가 정합니다.',
  },
  project_level_asset: {
    name: '프로젝트 단위 자산',
    why: '회사 전체 숫자로는 개별 광산·유전의 수명과 위험이 보이지 않습니다.',
  },
  ownership_versus_economic_interest: {
    name: '지분율과 실제 경제적 몫',
    why: '지분율과 실제로 받는 몫이 다른 경우가 많습니다. 계약 구조를 봐야 합니다.',
  },
  commodity_hedge: {
    name: '가격 헤지',
    why: '헤지가 걸려 있으면 원자재 가격이 올라도 실적이 따라오지 않습니다.',
  },
  nav_sotp: {
    name: '자산 합산 가치',
    why: '자산마다 수명과 위험이 달라, 하나의 배수보다 자산별로 더해 보는 편이 맞습니다.',
  },

  // ── 유틸리티 ────────────────────────────────────────────────────────────
  rate_base: {
    name: '요금 기저 자산',
    why: '규제 산업은 투자한 자산에 정해진 수익률을 얹어 벌므로, 그 자산 규모가 이익의 크기를 정합니다.',
  },
  allowed_return: {
    name: '허용 수익률',
    why: '규제 기관이 정한 수익률이 상한이자 하한입니다. 이 숫자가 바뀌면 전제가 바뀝니다.',
  },
  capex_program_and_recovery: {
    name: '투자 계획과 회수',
    why: '투자를 요금으로 회수할 수 있는지가 정해지지 않으면 투자는 부담이 됩니다.',
  },
  fuel_cost_passthrough: {
    name: '연료비 전가',
    why: '연료비를 요금에 넘길 수 있는지, 얼마나 늦게 넘기는지가 손익 변동을 정합니다.',
  },
  load_and_tariff: {
    name: '수요량과 요금 체계',
    why: '판매량과 요금이 함께 움직이지 않으므로 둘을 나눠 봐야 합니다.',
  },

  // ── 가상자산 ────────────────────────────────────────────────────────────
  protocol_versus_token_value_capture: {
    name: '프로토콜과 토큰의 가치 연결',
    why: '프로토콜이 잘 되는 것과 토큰이 그 값을 받는 것은 별개입니다. 연결 고리를 확인합니다.',
  },
  token_supply_emission: {
    name: '토큰 공급과 발행 일정',
    why: '앞으로 풀릴 물량이 정해져 있으면 수요가 같아도 결과가 다릅니다.',
  },
  fee_revenue_distribution: {
    name: '수수료 수익의 분배',
    why: '수수료가 발생해도 누구에게 가는지에 따라 토큰 보유자의 몫이 달라집니다.',
  },
  chain_finality_reorg: {
    name: '체인 확정성',
    why: '거래가 되돌려질 수 있는 구조인지가 그 위에 쌓인 모든 것의 전제입니다.',
  },
  contract_upgrade_version: {
    name: '컨트랙트 업그레이드 권한',
    why: '코드를 바꿀 수 있는 권한이 어디에 있는지가 규칙이 유지된다는 보장의 크기를 정합니다.',
  },
  collateral_bridge_oracle_dependency: {
    name: '담보·브리지·가격 오라클 의존',
    why: '외부에 기대는 지점이 많을수록 그중 하나가 끊길 때 전체가 멈춥니다.',
  },
};

/** `kind` 는 원장이 쓰는 내부 어휘라 그대로 나가지 않는다. */
export const INDICATOR_KIND_LABELS: Record<string, string> = {
  leading: '앞서 움직이는 지표',
  lagging: '뒤따라 확인되는 지표',
};
