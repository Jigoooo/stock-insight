export type DecisionAction =
  | 'ADD'
  | 'HOLD'
  | 'REDUCE'
  | 'EXIT'
  | 'WATCH'
  | 'NO_ACTION'
  | 'INSUFFICIENT_DATA';

export type DecisionEngineInput = {
  generatedAt: string;
  profile: {
    maxPositionWeight: number;
    noTradeBand: number;
  };
  position: {
    hasPosition: boolean;
    portfolioWeight: number;
  };
  commonView: {
    availability: 'available' | 'empty' | 'missing' | 'error';
    asOf: string;
    maxAgeMinutes: number;
    coverage: number;
    calibration: 'sufficient' | 'insufficient' | 'missing';
    direction: 'positive' | 'neutral' | 'negative' | 'mixed';
    strength: number;
    thesisInvalidated: boolean;
    expectedBenefitBps: number | null;
    modelConflict: boolean;
  };
  costs: {
    complete: boolean;
    roundTripBps: number | null;
    taxBps: number | null;
  };
  previousDecision: {
    action: DecisionAction;
    generatedAt: string;
    confirmationCount: number;
  } | null;
};

export type CompiledDecisionPacket = {
  action: DecisionAction;
  actionReason: string;
  counterEvidence: string[];
  failureConditions: string[];
  estimatedCosts: {
    roundTripBps: number | null;
    taxBps: number | null;
    totalBps: number | null;
  };
  taxAssumptions: {
    taxBps: number | null;
    costBasisUsedForExpectedReturn: false;
  };
  uncertainty: {
    coverage: number;
    calibration: DecisionEngineInput['commonView']['calibration'];
    modelConflict: boolean;
  };
  expiresAt: string;
  abstentionReason: string | null;
  adviceProhibited: true;
  orderExecutable: false;
  legalReviewStatus: 'required';
  engineVersion: 'rules-v1';
};

const MIN_COVERAGE = 0.7;
const STRONG_SIGNAL = 0.75;
const PACKET_TTL_MS = 24 * 60 * 60 * 1_000;
const DIRECTION_FLIP_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const MAX_PACKET_EXPIRES_AT_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
const FAIL_CLOSED_EXPIRES_AT = new Date(MAX_PACKET_EXPIRES_AT_MS).toISOString();
const UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRuntimeEnvelope(value: unknown): value is DecisionEngineInput {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.profile) &&
    isRecord(value.position) &&
    isRecord(value.commonView) &&
    isRecord(value.costs) &&
    (value.previousDecision === null || isRecord(value.previousDecision))
  );
}

function malformedInputPacket(reason: string): CompiledDecisionPacket {
  return {
    action: 'INSUFFICIENT_DATA',
    actionReason: '판단에 필요한 검증 정보가 부족합니다.',
    counterEvidence: ['입력 envelope가 계약과 일치하지 않아 판단을 생성하지 않았습니다.'],
    failureConditions: ['유효한 입력 계약이 확인되기 전에는 packet을 저장할 수 없습니다.'],
    estimatedCosts: { roundTripBps: null, taxBps: null, totalBps: null },
    taxAssumptions: { taxBps: null, costBasisUsedForExpectedReturn: false },
    uncertainty: { coverage: 0, calibration: 'missing', modelConflict: true },
    expiresAt: FAIL_CLOSED_EXPIRES_AT,
    abstentionReason: reason,
    adviceProhibited: true,
    orderExecutable: false,
    legalReviewStatus: 'required',
    engineVersion: 'rules-v1',
  };
}

function finiteInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function parseUtcTimestamp(value: string): number {
  const match = typeof value === 'string' ? UTC_TIMESTAMP_PATTERN.exec(value) : null;
  if (!match) return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  const date = new Date(parsed);
  const milliseconds = Number((match[7] ?? '').padEnd(3, '0'));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3]) ||
    date.getUTCHours() !== Number(match[4]) ||
    date.getUTCMinutes() !== Number(match[5]) ||
    date.getUTCSeconds() !== Number(match[6]) ||
    date.getUTCMilliseconds() !== milliseconds
  ) {
    return Number.NaN;
  }
  return parsed;
}

function actionDirection(action: DecisionAction): -1 | 0 | 1 {
  if (action === 'ADD') return 1;
  if (action === 'REDUCE' || action === 'EXIT') return -1;
  return 0;
}

function buildPacket(
  input: DecisionEngineInput,
  action: DecisionAction,
  actionReason: string,
  abstentionReason: string | null = null,
): CompiledDecisionPacket {
  const generatedAt = parseUtcTimestamp(input.generatedAt);
  const rawRoundTripBps = input.costs.roundTripBps;
  const rawTaxBps = input.costs.taxBps;
  const rawCostTotal =
    typeof rawRoundTripBps === 'number' && typeof rawTaxBps === 'number'
      ? rawRoundTripBps + rawTaxBps
      : Number.NaN;
  const costsUsable =
    input.costs.complete === true &&
    typeof rawRoundTripBps === 'number' &&
    typeof rawTaxBps === 'number' &&
    Number.isFinite(rawRoundTripBps) &&
    Number.isFinite(rawTaxBps) &&
    Number.isFinite(rawCostTotal) &&
    rawRoundTripBps >= 0 &&
    rawTaxBps >= 0;
  const roundTripBps = costsUsable ? rawRoundTripBps : null;
  const taxBps = costsUsable ? rawTaxBps : null;
  const totalBps =
    roundTripBps === null || taxBps === null
      ? null
      : Math.max(0, roundTripBps) + Math.max(0, taxBps);
  const commonViewAsOf = parseUtcTimestamp(input.commonView.asOf);
  const freshnessExpiresAt =
    Number.isFinite(commonViewAsOf) &&
    commonViewAsOf <= generatedAt &&
    Number.isFinite(input.commonView.maxAgeMinutes) &&
    Number.isFinite(input.commonView.maxAgeMinutes * 60_000) &&
    input.commonView.maxAgeMinutes > 0
      ? commonViewAsOf + input.commonView.maxAgeMinutes * 60_000
      : Number.NaN;
  const validityDeadline = Math.min(generatedAt + PACKET_TTL_MS, freshnessExpiresAt);
  const expiresAt =
    Number.isFinite(generatedAt) &&
    Number.isFinite(validityDeadline) &&
    validityDeadline > generatedAt
      ? validityDeadline
      : generatedAt + 1;
  return {
    action,
    actionReason,
    counterEvidence: [
      '공통 근거와 반대 근거가 달라지면 판단 상태가 바뀔 수 있습니다.',
      '시장 가격과 포트폴리오 비중은 packet 생성 시점 이후 변할 수 있습니다.',
    ],
    failureConditions: [
      '공통 근거가 freshness 한도를 넘으면 packet은 만료됩니다.',
      'coverage 또는 calibration gate가 무너지면 실행 대신 abstention으로 돌아갑니다.',
    ],
    estimatedCosts: { roundTripBps, taxBps, totalBps },
    taxAssumptions: { taxBps, costBasisUsedForExpectedReturn: false },
    uncertainty: {
      coverage: finiteInRange(input.commonView.coverage, 0, 1) ? input.commonView.coverage : 0,
      calibration: ['sufficient', 'insufficient', 'missing'].includes(input.commonView.calibration)
        ? input.commonView.calibration
        : 'missing',
      modelConflict:
        typeof input.commonView.modelConflict === 'boolean' ? input.commonView.modelConflict : true,
    },
    expiresAt:
      Number.isFinite(expiresAt) && expiresAt <= MAX_PACKET_EXPIRES_AT_MS
        ? new Date(expiresAt).toISOString()
        : FAIL_CLOSED_EXPIRES_AT,
    abstentionReason,
    adviceProhibited: true,
    orderExecutable: false,
    legalReviewStatus: 'required',
    engineVersion: 'rules-v1',
  };
}

function abstain(input: DecisionEngineInput, reason: string): CompiledDecisionPacket {
  return buildPacket(input, 'INSUFFICIENT_DATA', '판단에 필요한 검증 정보가 부족합니다.', reason);
}

export function compileDecisionPacket(input: unknown): CompiledDecisionPacket {
  if (!hasRuntimeEnvelope(input)) {
    return malformedInputPacket('INVALID_INPUT_SHAPE');
  }
  const generatedAt = parseUtcTimestamp(input.generatedAt);
  const commonViewAsOf = parseUtcTimestamp(input.commonView.asOf);
  if (
    !Number.isFinite(generatedAt) ||
    generatedAt + PACKET_TTL_MS > MAX_PACKET_EXPIRES_AT_MS ||
    !Number.isFinite(commonViewAsOf)
  ) {
    return abstain(input, 'INVALID_TIMESTAMP');
  }
  if (
    typeof input.position.hasPosition !== 'boolean' ||
    typeof input.commonView.thesisInvalidated !== 'boolean' ||
    typeof input.commonView.modelConflict !== 'boolean' ||
    typeof input.costs.complete !== 'boolean' ||
    !['available', 'empty', 'missing', 'error'].includes(input.commonView.availability) ||
    !['sufficient', 'insufficient', 'missing'].includes(input.commonView.calibration) ||
    !['positive', 'neutral', 'negative', 'mixed'].includes(input.commonView.direction) ||
    (input.previousDecision !== null &&
      !['ADD', 'HOLD', 'REDUCE', 'EXIT', 'WATCH', 'NO_ACTION', 'INSUFFICIENT_DATA'].includes(
        input.previousDecision.action,
      ))
  ) {
    return abstain(input, 'INVALID_DISCRIMINANT_INPUT');
  }
  if (
    !finiteInRange(input.profile.maxPositionWeight, 0.000_001, 1) ||
    !finiteInRange(input.profile.noTradeBand, 0, 0.999_999) ||
    input.profile.maxPositionWeight + input.profile.noTradeBand > 1 ||
    !finiteInRange(input.position.portfolioWeight, 0, 1) ||
    (!input.position.hasPosition && input.position.portfolioWeight !== 0) ||
    (input.position.hasPosition && input.position.portfolioWeight <= 0) ||
    !finiteInRange(input.commonView.coverage, 0, 1) ||
    !finiteInRange(input.commonView.strength, 0, 1) ||
    !Number.isFinite(input.commonView.maxAgeMinutes) ||
    !Number.isFinite(input.commonView.maxAgeMinutes * 60_000) ||
    input.commonView.maxAgeMinutes <= 0 ||
    (input.commonView.expectedBenefitBps !== null &&
      (!Number.isFinite(input.commonView.expectedBenefitBps) ||
        input.commonView.expectedBenefitBps < 0)) ||
    (input.costs.complete &&
      (input.costs.roundTripBps === null ||
        input.costs.taxBps === null ||
        !Number.isFinite(input.costs.roundTripBps) ||
        !Number.isFinite(input.costs.taxBps) ||
        !Number.isFinite(input.costs.roundTripBps + input.costs.taxBps) ||
        input.costs.roundTripBps < 0 ||
        input.costs.taxBps < 0))
  ) {
    return abstain(input, 'INVALID_NUMERIC_INPUT');
  }
  let previousGeneratedAt: number | null = null;
  if (input.previousDecision) {
    previousGeneratedAt = parseUtcTimestamp(input.previousDecision.generatedAt);
    if (
      !Number.isFinite(previousGeneratedAt) ||
      previousGeneratedAt > generatedAt ||
      !Number.isSafeInteger(input.previousDecision.confirmationCount) ||
      input.previousDecision.confirmationCount < 0
    ) {
      return abstain(input, 'INVALID_PREVIOUS_DECISION');
    }
  }
  if (input.commonView.availability !== 'available') {
    return abstain(input, 'COMMON_VIEW_UNAVAILABLE');
  }
  const ageMinutes = (generatedAt - commonViewAsOf) / 60_000;
  if (ageMinutes < 0 || ageMinutes > input.commonView.maxAgeMinutes) {
    return abstain(input, 'COMMON_VIEW_STALE');
  }
  if (input.commonView.coverage < MIN_COVERAGE) {
    return abstain(input, 'COVERAGE_INSUFFICIENT');
  }
  if (input.commonView.calibration !== 'sufficient') {
    return abstain(input, 'CALIBRATION_INSUFFICIENT');
  }
  if (input.commonView.modelConflict || input.commonView.direction === 'mixed') {
    return abstain(input, 'MODEL_CONFLICT');
  }

  let action: DecisionAction;
  let actionReason: string;
  const upperBand = input.profile.maxPositionWeight + input.profile.noTradeBand;
  const lowerBand = Math.max(0, input.profile.maxPositionWeight - input.profile.noTradeBand);

  if (!input.position.hasPosition) {
    if (input.commonView.direction === 'positive' && input.commonView.strength >= STRONG_SIGNAL) {
      action = 'ADD';
      actionReason = '강한 긍정 근거가 관찰됐지만 주문과 분리된 검토 후보입니다.';
    } else {
      action = 'WATCH';
      actionReason = '현재 보유가 없고 변경을 정당화할 강한 근거가 없어 관찰 상태를 유지합니다.';
    }
  } else if (
    input.commonView.thesisInvalidated &&
    input.commonView.direction === 'negative' &&
    input.commonView.strength >= STRONG_SIGNAL
  ) {
    action = 'EXIT';
    actionReason = '기존 논지의 무효화 조건과 강한 부정 근거가 함께 관찰됐습니다.';
  } else if (input.position.portfolioWeight > upperBand) {
    action = 'REDUCE';
    actionReason = '현재 비중이 사용자 상한과 no-trade band를 초과했습니다.';
  } else if (
    input.commonView.direction === 'positive' &&
    input.commonView.strength >= STRONG_SIGNAL &&
    input.position.portfolioWeight < lowerBand
  ) {
    action = 'ADD';
    actionReason = '비중이 하단 band 아래이며 강한 긍정 근거가 관찰됐습니다.';
  } else if (
    input.commonView.direction === 'negative' &&
    input.commonView.strength >= STRONG_SIGNAL
  ) {
    action = 'REDUCE';
    actionReason = '강한 부정 근거가 관찰되어 비중 축소 검토 상태입니다.';
  } else {
    action = 'HOLD';
    actionReason = '현재 근거는 포트폴리오 변경 임계값을 넘지 않습니다.';
  }

  if (action === 'ADD' || action === 'REDUCE') {
    const { complete, roundTripBps, taxBps } = input.costs;
    if (
      !complete ||
      roundTripBps === null ||
      taxBps === null ||
      !Number.isFinite(roundTripBps) ||
      !Number.isFinite(taxBps) ||
      roundTripBps < 0 ||
      taxBps < 0 ||
      input.commonView.expectedBenefitBps === null ||
      !Number.isFinite(input.commonView.expectedBenefitBps)
    ) {
      return abstain(input, 'COST_DATA_INCOMPLETE');
    }
    if (input.commonView.expectedBenefitBps <= roundTripBps + taxBps) {
      action = 'NO_ACTION';
      actionReason = '추정 편익이 거래·세금 비용을 넘지 않아 변경하지 않습니다.';
    }
  }

  if (
    input.previousDecision &&
    previousGeneratedAt !== null &&
    generatedAt - previousGeneratedAt < DIRECTION_FLIP_COOLDOWN_MS
  ) {
    const previousDirection = actionDirection(input.previousDecision.action);
    const nextDirection = actionDirection(action);
    if (previousDirection * nextDirection < 0 && input.previousDecision.confirmationCount < 2) {
      action = input.position.hasPosition ? 'HOLD' : 'WATCH';
      actionReason = '단일 관측에 의한 방향 반전을 막기 위해 추가 확인을 기다립니다.';
    }
  }

  return buildPacket(input, action, actionReason);
}
