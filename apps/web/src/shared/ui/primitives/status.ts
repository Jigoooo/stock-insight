import type { DataAvailability, ResponseMeta } from '@stock-insight/contracts';

export type StatusTone = 'success' | 'neutral' | 'info' | 'warning' | 'danger' | 'muted';

export type StatusTextOptions = {
  label: string;
  source: ResponseMeta['source'];
  availability: DataAvailability;
};

export type DataQualitySummaryOptions = StatusTextOptions & {
  updatedAt?: string;
};

export type DataQualitySummary = {
  title: string;
  summary: string;
  nextAction: string;
  sourceLabel: string;
  freshnessLabel: string;
  tone: StatusTone;
};

export type EmptyStateCopyOptions = {
  label: string;
  reason: string;
  nextAction: string;
};

export type EmptyStateCopy = {
  title: string;
  reason: string;
  nextAction: string;
  text: string;
};

export type DelayedFeedbackOptions = {
  active: boolean;
  elapsedMs: number;
  delayMs?: number;
};

const availabilityLabels: Record<DataAvailability, string> = {
  available: '사용 가능',
  collecting: '수집 중',
  error: '오류',
  missing: '없음',
  stale: '오래됨',
  text_only: '텍스트만',
  unsupported: '지원 안 됨',
};

const availabilityTones: Record<DataAvailability, StatusTone> = {
  available: 'success',
  collecting: 'neutral',
  error: 'danger',
  missing: 'muted',
  stale: 'warning',
  text_only: 'info',
  unsupported: 'muted',
};

const dataQualityCopy: Record<
  DataAvailability,
  { titleSuffix: string; summary: string; nextAction: string }
> = {
  available: {
    titleSuffix: '사용 가능',
    summary: '구조화 데이터가 있으며 현재 화면에서 사용할 수 있습니다.',
    nextAction: '출처와 갱신시각을 확인하고 판단에 사용하세요.',
  },
  collecting: {
    titleSuffix: '수집 중',
    summary: '수집 또는 분석 작업이 아직 끝나지 않았습니다.',
    nextAction: '잠시 후 새로고침하거나 분석 작업 상태를 확인하세요.',
  },
  error: {
    titleSuffix: '읽기 오류',
    summary: 'API 또는 DB 읽기 중 오류가 발생했습니다.',
    nextAction: 'fallback 값을 사실처럼 사용하지 말고 오류 원인을 확인하세요.',
  },
  missing: {
    titleSuffix: '데이터 없음',
    summary: '현재 원천 테이블에 표시할 값이 없습니다.',
    nextAction: '출처 후보를 추가하거나 해당 섹션을 빈 상태로 유지하세요.',
  },
  stale: {
    titleSuffix: '오래됨',
    summary: '데이터는 있지만 freshness 기준을 넘었습니다.',
    nextAction: '최신 원천으로 재수집한 뒤 판단에 사용하세요.',
  },
  text_only: {
    titleSuffix: '텍스트 기반',
    summary: '원문/리포트에는 있으나 구조화 테이블로 승격 전입니다.',
    nextAction: '출처 있는 구조화 collector가 채워질 때까지 숫자 승격을 보류하세요.',
  },
  unsupported: {
    titleSuffix: '지원 범위 밖',
    summary: 'KR/US 주식 기본 범위 밖이라 이 화면에서는 구조화하지 않습니다.',
    nextAction: '기본 주식 화면에서는 제외하고 별도 도메인으로 분리하세요.',
  },
};

export function getSourceLabel(source: ResponseMeta['source']) {
  if (source === 'database') return 'DB';
  if (source === 'mock') return 'Mock';
  return 'Fallback';
}

export function getAvailabilityLabel(availability: DataAvailability) {
  return availabilityLabels[availability];
}

export function getAvailabilityTone(availability: DataAvailability) {
  return availabilityTones[availability];
}

export function buildStatusText({ availability, label, source }: StatusTextOptions) {
  return `${label} ${getSourceLabel(source)} · ${getAvailabilityLabel(availability)}`;
}

export function buildQualityTestId(label: string) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'section'}-quality-popover`;
}

function ensureSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildEmptyStateCopy({ label, nextAction, reason }: EmptyStateCopyOptions): EmptyStateCopy {
  const title = `${label.trim()} 없음`;
  const reasonSentence = ensureSentence(reason);
  const actionSentence = ensureSentence(nextAction);
  return {
    title,
    reason: reasonSentence,
    nextAction: actionSentence,
    text: `${title} — ${reasonSentence} 다음 행동: ${actionSentence}`,
  };
}

export function buildDataQualitySummary({
  availability,
  label,
  source,
  updatedAt,
}: DataQualitySummaryOptions): DataQualitySummary {
  const copy = dataQualityCopy[availability];
  return {
    title: `${label} ${copy.titleSuffix}`,
    summary: copy.summary,
    nextAction: copy.nextAction,
    sourceLabel: getSourceLabel(source),
    freshnessLabel: updatedAt?.trim() || '갱신시각 없음',
    tone: getAvailabilityTone(availability),
  };
}

export function shouldShowDelayedFeedback({
  active,
  elapsedMs,
  delayMs = 300,
}: DelayedFeedbackOptions) {
  return active && elapsedMs >= delayMs;
}
