import type { SystemStatus } from '@stock-insight/contracts/research-workspace';

export type ReliabilityLevel = 'ready' | 'limited' | 'attention';

export type ReliabilitySurface = 'today' | 'stocks' | 'market_connections' | 'history';

export type ReliabilityEvidence = {
  id: string;
  label: string;
  availability: SystemStatus['datasets'][number]['availability'];
  checkedAt: string | null;
};

export type ReliabilityBriefingItem = {
  surface: ReliabilitySurface;
  title: string;
  level: ReliabilityLevel;
  summary: string;
  availableNow: string[];
  limitations: string[];
  cautions: string[];
  evidence: ReliabilityEvidence[];
  sourceTraceability: {
    linked: number;
    clickable: number;
    total: number;
  } | null;
};

export type ReliabilityBriefingModel = {
  summary: {
    level: ReliabilityLevel;
    generatedAt: string;
    headline: string;
    commonLimitations: string[];
  };
  surfaces: ReliabilityBriefingItem[];
};

type DatasetAvailability = SystemStatus['datasets'][number]['availability'];

type SurfaceDefinition = {
  surface: ReliabilitySurface;
  title: string;
  datasetNames: readonly string[];
  traceability: 'publication' | 'graph';
  caution: string;
};

const levelWeight: Record<ReliabilityLevel, number> = {
  ready: 0,
  limited: 1,
  attention: 2,
};

const datasetLabels: Record<string, string> = {
  rss_news: '최근 뉴스',
  news_translation: '뉴스 번역',
  publication_records: '리서치 발행 정보',
  market_snapshots: '시장 가격',
  macro_observations: '거시 지표',
  ohlcv_1d: '일별 가격 흐름',
  company_profiles: '기업 기본 정보',
  company_financials: '기업 재무 정보',
  market_signals: '시장 변화 신호',
  graph_edges: '기업·테마 연결 관계',
  decision_history: '판단 기록',
  forecast_outcome: '판단 후 변화 근거',
};

const surfaceDefinitions: readonly SurfaceDefinition[] = [
  {
    surface: 'today',
    title: '오늘',
    datasetNames: [
      'rss_news',
      'news_translation',
      'publication_records',
      'market_snapshots',
      'macro_observations',
      'ohlcv_1d',
    ],
    traceability: 'publication',
    caution: '기사와 시장 지표는 서로 다른 시각에 확인될 수 있습니다.',
  },
  {
    surface: 'stocks',
    title: '내 종목',
    datasetNames: [
      'market_snapshots',
      'ohlcv_1d',
      'company_profiles',
      'company_financials',
      'rss_news',
      'news_translation',
    ],
    traceability: 'publication',
    caution: '이 상태는 보유·관심 목록 자체의 완전성을 보증하지 않습니다.',
  },
  {
    surface: 'market_connections',
    title: '시장 연결',
    datasetNames: ['market_signals', 'graph_edges', 'macro_observations'],
    traceability: 'graph',
    caution: '연결 관계는 근거가 확인된 범위 안에서만 해석해야 합니다.',
  },
  {
    surface: 'history',
    title: '복기',
    datasetNames: ['decision_history', 'forecast_outcome', 'rss_news', 'market_signals'],
    traceability: 'publication',
    caution: '판단의 성공 여부가 아니라 변화 비교 근거의 상태를 보여줍니다.',
  },
] as const;

export const reliabilityLevelLabels: Record<ReliabilityLevel, string> = {
  ready: '활용 가능',
  limited: '일부 제한',
  attention: '확인 필요',
};

export function reliabilityLevelForAvailability(
  availability: DatasetAvailability,
): ReliabilityLevel {
  if (availability === 'available') return 'ready';
  if (availability === 'collecting' || availability === 'stale' || availability === 'text_only') {
    return 'limited';
  }
  return 'attention';
}

function worstLevel(levels: readonly ReliabilityLevel[]): ReliabilityLevel {
  return levels.reduce<ReliabilityLevel>(
    (worst, level) => (levelWeight[level] > levelWeight[worst] ? level : worst),
    'ready',
  );
}

function availabilityLimitation(evidence: ReliabilityEvidence): string | null {
  const objectParticle = /[가-힣]/.test(evidence.label.at(-1) ?? '')
    ? (evidence.label.at(-1)!.charCodeAt(0) - 0xac00) % 28 === 0
      ? '를'
      : '을'
    : '을';
  switch (evidence.availability) {
    case 'available':
      return null;
    case 'collecting':
      return `${evidence.label}${objectParticle} 수집하고 있습니다.`;
    case 'stale':
      return `${evidence.label}의 최근 확인 시각이 지연되었습니다.`;
    case 'text_only':
      return `${evidence.label}은 텍스트 정보만 확인할 수 있습니다.`;
    case 'missing':
      return `${evidence.label}의 상태 정보를 확인할 수 없습니다.`;
    case 'unsupported':
      return `${evidence.label}은 현재 지원하지 않습니다.`;
    case 'error':
      return `${evidence.label} 상태를 확인하는 과정에 문제가 있습니다.`;
  }
}

function traceabilityIsLimited(
  traceability: ReliabilityBriefingItem['sourceTraceability'],
): boolean {
  return Boolean(
    traceability &&
    traceability.total > 0 &&
    (traceability.linked < traceability.total || traceability.clickable < traceability.linked),
  );
}

function surfaceSummary(title: string, level: ReliabilityLevel): string {
  if (level === 'ready') return `${title}에 필요한 데이터가 현재 확인 가능합니다.`;
  if (level === 'limited') return `${title} 정보는 이용할 수 있지만 일부 제한이 있습니다.`;
  return `${title} 정보를 해석하기 전에 상태 근거를 확인해야 합니다.`;
}

function buildSurface(
  status: SystemStatus,
  definition: SurfaceDefinition,
): ReliabilityBriefingItem {
  const evidence = definition.datasetNames.flatMap((datasetName) => {
    const dataset = status.datasets.find((candidate) => candidate.datasetName === datasetName);
    if (!dataset) return [];
    return [
      {
        id: datasetName,
        label: datasetLabels[datasetName] ?? '확인된 데이터',
        availability: dataset.availability,
        checkedAt: dataset.watermarkAt,
      } satisfies ReliabilityEvidence,
    ];
  });
  const sourceTraceability =
    definition.traceability === 'graph' ? status.graphSourceCoverage : status.sourceCoverage;
  const incompleteTraceability = traceabilityIsLimited(sourceTraceability);
  const evidenceLevel =
    evidence.length === 0
      ? 'attention'
      : worstLevel(
          evidence.map(({ availability }) => reliabilityLevelForAvailability(availability)),
        );
  const level = incompleteTraceability && evidenceLevel === 'ready' ? 'limited' : evidenceLevel;
  const limitations = evidence.flatMap((item) => {
    const limitation = availabilityLimitation(item);
    return limitation ? [limitation] : [];
  });

  if (evidence.length === 0) {
    limitations.push('이 기능을 판단할 상태 정보가 아직 없습니다.');
  }
  if (incompleteTraceability) {
    limitations.push(
      definition.traceability === 'graph'
        ? '일부 연결 관계는 근거 원문을 바로 확인할 수 없습니다.'
        : '일부 정보는 원문 근거가 완전히 연결되지 않았습니다.',
    );
  }

  return {
    surface: definition.surface,
    title: definition.title,
    level,
    summary: surfaceSummary(definition.title, level),
    availableNow: evidence
      .filter(({ availability }) => reliabilityLevelForAvailability(availability) !== 'attention')
      .map(({ label }) => label),
    limitations,
    cautions: [definition.caution],
    evidence,
    sourceTraceability,
  };
}

function commonLimitations(status: SystemStatus): string[] {
  const messages: string[] = [];
  if (
    status.pipelineJobs.some(
      ({ consecutiveFailures, stuckSince }) => consecutiveFailures > 0 || stuckSince !== null,
    )
  ) {
    messages.push('일부 수집·분석 갱신이 지연되었을 수 있습니다.');
  }
  if (status.pipelineJobs.some(({ recordsFailures }) => !recordsFailures)) {
    messages.push('일부 갱신 과정은 실패 여부를 완전히 확인할 수 없습니다.');
  }
  if (status.coverage.some(({ state, cells }) => state === 'not_collected' && cells > 0)) {
    messages.push('아직 확인하지 않은 데이터 범위가 있습니다.');
  }
  if (status.coverage.some(({ state, cells }) => state === 'partial' && cells > 0)) {
    messages.push('일부 데이터 범위만 확인되었습니다.');
  }
  if (status.coverage.some(({ state, cells }) => state === 'source_unavailable' && cells > 0)) {
    messages.push('원천 자료가 제공되지 않는 범위가 있습니다.');
  }
  if (status.coverageGaps.length > 0 && messages.length === 0) {
    messages.push('확인하지 못한 데이터 범위가 기록되어 있습니다.');
  }
  return messages.slice(0, 3);
}

function summaryHeadline(level: ReliabilityLevel): string {
  if (level === 'ready') return '네 기능의 데이터가 현재 확인 가능한 상태입니다.';
  if (level === 'limited') return '일부 기능은 갱신 또는 근거 연결에 제한이 있습니다.';
  return '일부 기능은 상태 근거를 추가로 확인해야 합니다.';
}

export function buildReliabilityBriefingModel(status: SystemStatus): ReliabilityBriefingModel {
  const surfaces = surfaceDefinitions.map((definition) => buildSurface(status, definition));
  let summaryLevel = worstLevel([
    reliabilityLevelForAvailability(status.overall),
    ...surfaces.map(({ level }) => level),
  ]);
  if (
    summaryLevel === 'ready' &&
    status.pipelineJobs.some(
      ({ consecutiveFailures, stuckSince }) => consecutiveFailures > 0 || stuckSince !== null,
    )
  ) {
    summaryLevel = 'limited';
  }

  return {
    summary: {
      level: summaryLevel,
      generatedAt: status.generatedAt,
      headline:
        status.datasets.length === 0
          ? '상태 정보 확인 필요 · 현재 판정할 상태 근거가 없습니다.'
          : summaryHeadline(summaryLevel),
      commonLimitations: commonLimitations(status),
    },
    surfaces,
  };
}
