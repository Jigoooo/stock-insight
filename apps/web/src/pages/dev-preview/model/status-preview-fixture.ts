import { buildReliabilityBriefingModel } from '../../research-workspace/model/reliability-briefing.ts';
import type { ResearchWorkspaceViewPayload } from '../../research-workspace/model/workspace-view-payload.ts';

import type { SystemStatus } from '@stock-insight/contracts/research-workspace';

export type StatusPreviewScenario =
  | 'default'
  | 'all-ready'
  | 'stale'
  | 'source-limited'
  | 'empty'
  | 'error';

type StatusPreviewPayload = Extract<ResearchWorkspaceViewPayload, { view: 'status' }>;
type DatasetAvailability = SystemStatus['datasets'][number]['availability'];

const generatedAt = '2026-08-08T09:00:00.000Z';

const datasetNames = [
  'rss_news',
  'news_translation',
  'publication_records',
  'market_snapshots',
  'macro_observations',
  'ohlcv_1d',
  'company_profiles',
  'company_financials',
  'market_signals',
  'graph_edges',
  'decision_history',
  'forecast_outcome',
] as const;

function dataset(datasetName: (typeof datasetNames)[number], availability: DatasetAvailability) {
  return {
    domain: 'stock',
    datasetName,
    availability,
    watermarkAt:
      availability === 'missing' || availability === 'unsupported' || availability === 'error'
        ? null
        : '2026-08-08T08:40:00.000Z',
    rowCount: availability === 'missing' ? 0 : 24,
    analysisRunId: null,
    analysisRevision: null,
  } satisfies SystemStatus['datasets'][number];
}

function readyStatus(): SystemStatus {
  return {
    generatedAt,
    overall: 'available',
    datasets: datasetNames.map((name) => dataset(name, 'available')),
    sourceCoverage: { linked: 48, clickable: 48, total: 48 },
    graphSourceCoverage: { linked: 24, clickable: 24, total: 24 },
    pipelineJobs: [],
    coverage: [{ factFamily: 'public_information', state: 'complete', cells: 36 }],
    coverageGaps: [],
  };
}

function defaultStatus(): SystemStatus {
  const base = readyStatus();
  return {
    ...base,
    overall: 'missing',
    datasets: base.datasets.map((item) => {
      if (item.datasetName === 'company_financials') return dataset(item.datasetName, 'collecting');
      if (item.datasetName === 'graph_edges') return dataset(item.datasetName, 'stale');
      if (item.datasetName === 'forecast_outcome') return dataset(item.datasetName, 'missing');
      return item;
    }),
    pipelineJobs: [
      {
        jobName: 'preview-analytics-job',
        lastRunAt: '2026-08-08T08:35:00.000Z',
        lastSuccessAt: '2026-08-08T07:30:00.000Z',
        lastFailureAt: '2026-08-08T08:35:00.000Z',
        lastStatus: 'failed',
        consecutiveFailures: 1,
        recordsFailures: true,
        stuckSince: null,
      },
    ],
    coverage: [
      { factFamily: 'public_information', state: 'complete', cells: 28 },
      { factFamily: 'public_information', state: 'not_collected', cells: 8 },
    ],
    coverageGaps: [{ factFamily: 'public_information', reason: 'preview source delay', cells: 8 }],
  };
}

function resolveStatus(scenario: StatusPreviewScenario): SystemStatus {
  if (scenario === 'all-ready' || scenario === 'source-limited') return readyStatus();
  if (scenario === 'empty') {
    return {
      generatedAt,
      overall: 'missing',
      datasets: [],
      sourceCoverage: { linked: 0, clickable: 0, total: 0 },
      graphSourceCoverage: { linked: 0, clickable: 0, total: 0 },
      pipelineJobs: [],
      coverage: [],
      coverageGaps: [],
    };
  }
  if (scenario === 'stale') {
    const base = readyStatus();
    return {
      ...base,
      overall: 'stale',
      datasets: base.datasets.map((item) =>
        ['rss_news', 'market_snapshots', 'market_signals'].includes(item.datasetName)
          ? dataset(item.datasetName as (typeof datasetNames)[number], 'stale')
          : item,
      ),
    };
  }
  return defaultStatus();
}

export function resolveStatusPreview(scenario: StatusPreviewScenario) {
  const status = resolveStatus(scenario);
  if (scenario === 'source-limited') {
    status.sourceCoverage = { linked: 34, clickable: 20, total: 48 };
    status.graphSourceCoverage = { linked: 18, clickable: 10, total: 24 };
  }
  const data = {
    view: 'status',
    shell: { radarScopeTotal: 6, watchlistCount: 4 },
    status,
  } satisfies StatusPreviewPayload;

  return {
    data,
    briefing: buildReliabilityBriefingModel(status),
    initialError: scenario === 'error',
  };
}
