import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SystemStatus } from '@stock-insight/contracts/research-workspace';

const generatedAt = '2026-08-08T09:00:00.000Z';

function statusFixture(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    generatedAt,
    overall: 'available',
    datasets: [
      {
        domain: 'stock',
        datasetName: 'rss_news',
        availability: 'available',
        watermarkAt: '2026-08-08T08:50:00.000Z',
        rowCount: 120,
        analysisRunId: null,
        analysisRevision: null,
      },
      {
        domain: 'stock',
        datasetName: 'market_snapshots',
        availability: 'available',
        watermarkAt: '2026-08-08T08:45:00.000Z',
        rowCount: 80,
        analysisRunId: null,
        analysisRevision: null,
      },
      {
        domain: 'stock',
        datasetName: 'market_signals',
        availability: 'available',
        watermarkAt: '2026-08-08T08:30:00.000Z',
        rowCount: 18,
        analysisRunId: null,
        analysisRevision: null,
      },
      {
        domain: 'stock',
        datasetName: 'decision_history',
        availability: 'available',
        watermarkAt: '2026-08-08T08:00:00.000Z',
        rowCount: 12,
        analysisRunId: null,
        analysisRevision: null,
      },
    ],
    sourceCoverage: { linked: 12, clickable: 12, total: 12 },
    graphSourceCoverage: { linked: 8, clickable: 8, total: 8 },
    pipelineJobs: [],
    coverage: [],
    coverageGaps: [],
    ...overrides,
  };
}

describe('reliability briefing model', () => {
  it('maps canonical availability to the three user-facing levels and keeps the worst level', async () => {
    const modelModule =
      await import('../src/pages/research-workspace/model/reliability-briefing.ts').catch(
        () => null,
      );
    assert.ok(modelModule, 'expected the page-local reliability model to exist');
    if (!modelModule) return;

    assert.equal(modelModule.reliabilityLevelForAvailability('available'), 'ready');
    for (const availability of ['collecting', 'stale', 'text_only'] as const) {
      assert.equal(modelModule.reliabilityLevelForAvailability(availability), 'limited');
    }
    for (const availability of ['missing', 'unsupported', 'error'] as const) {
      assert.equal(modelModule.reliabilityLevelForAvailability(availability), 'attention');
    }

    const model = modelModule.buildReliabilityBriefingModel(
      statusFixture({
        overall: 'available',
        datasets: [
          ...statusFixture().datasets,
          {
            domain: 'stock',
            datasetName: 'forecast_outcome',
            availability: 'error',
            watermarkAt: null,
            rowCount: 0,
            analysisRunId: null,
            analysisRevision: null,
          },
        ],
      }),
    );

    assert.equal(model.surfaces.find(({ surface }) => surface === 'history')?.level, 'attention');
    assert.equal(model.summary.level, 'attention');
  });

  it('uses only explicit mappings and does not treat absent or unknown datasets as missing', async () => {
    const { buildReliabilityBriefingModel } =
      await import('../src/pages/research-workspace/model/reliability-briefing.ts');
    const base = statusFixture();
    const model = buildReliabilityBriefingModel({
      ...base,
      datasets: [
        ...base.datasets,
        {
          domain: 'stock',
          datasetName: 'future_unmapped_dataset',
          availability: 'error',
          watermarkAt: null,
          rowCount: 9_999_999,
          analysisRunId: 'internal-run-must-not-surface',
          analysisRevision: 9,
        },
      ],
    });

    assert.deepEqual(
      model.surfaces.map(({ surface }) => surface),
      ['today', 'stocks', 'market_connections', 'history'],
    );
    assert.equal(model.summary.level, 'ready');
    assert.equal(
      model.surfaces.some(({ evidence }) =>
        evidence.some(({ id }) => id === 'future_unmapped_dataset'),
      ),
      false,
    );
    assert.doesNotMatch(JSON.stringify(model), /9999999|internal-run-must-not-surface/);
  });

  it('degrades incomplete publication and graph traceability without fabricating an attention state', async () => {
    const { buildReliabilityBriefingModel } =
      await import('../src/pages/research-workspace/model/reliability-briefing.ts');
    const model = buildReliabilityBriefingModel(
      statusFixture({
        sourceCoverage: { linked: 10, clickable: 6, total: 12 },
        graphSourceCoverage: { linked: 7, clickable: 4, total: 8 },
      }),
    );

    assert.equal(model.surfaces.find(({ surface }) => surface === 'today')?.level, 'limited');
    assert.equal(model.surfaces.find(({ surface }) => surface === 'stocks')?.level, 'limited');
    assert.equal(
      model.surfaces.find(({ surface }) => surface === 'market_connections')?.level,
      'limited',
    );
    assert.equal(model.surfaces.find(({ surface }) => surface === 'history')?.level, 'limited');
    assert.equal(model.summary.level, 'limited');
  });

  it('keeps pipeline and coverage uncertainty global and limits it to three plain messages', async () => {
    const { buildReliabilityBriefingModel } =
      await import('../src/pages/research-workspace/model/reliability-briefing.ts');
    const model = buildReliabilityBriefingModel(
      statusFixture({
        pipelineJobs: [
          {
            jobName: 'secret-internal-job',
            lastRunAt: generatedAt,
            lastSuccessAt: null,
            lastFailureAt: generatedAt,
            lastStatus: 'failed',
            consecutiveFailures: 2,
            recordsFailures: true,
            stuckSince: null,
          },
          {
            jobName: 'blind-stage-name',
            lastRunAt: generatedAt,
            lastSuccessAt: generatedAt,
            lastFailureAt: null,
            lastStatus: 'completed',
            consecutiveFailures: 0,
            recordsFailures: false,
            stuckSince: null,
          },
        ],
        coverage: [
          { factFamily: 'secret-family', state: 'not_collected', cells: 3 },
          { factFamily: 'another-family', state: 'partial', cells: 2 },
        ],
        coverageGaps: [{ factFamily: 'hidden-family', reason: 'raw database reason', cells: 5 }],
      }),
    );

    assert.equal(model.summary.level, 'limited');
    assert.equal(model.summary.commonLimitations.length, 3);
    assert.match(model.summary.commonLimitations.join(' '), /갱신|확인/);
    assert.doesNotMatch(
      JSON.stringify(model),
      /secret-internal-job|blind-stage-name|secret-family|raw database reason/,
    );
  });

  it('represents zero evidence as an honest attention state without a numeric trust score', async () => {
    const { buildReliabilityBriefingModel } =
      await import('../src/pages/research-workspace/model/reliability-briefing.ts');
    const model = buildReliabilityBriefingModel(
      statusFixture({
        overall: 'missing',
        datasets: [],
        sourceCoverage: { linked: 0, clickable: 0, total: 0 },
        graphSourceCoverage: { linked: 0, clickable: 0, total: 0 },
      }),
    );

    assert.equal(model.summary.level, 'attention');
    assert.deepEqual(
      model.surfaces.map(({ level }) => level),
      ['attention', 'attention', 'attention', 'attention'],
    );
    assert.ok(model.surfaces.every(({ limitations }) => limitations.length > 0));
    assert.match(model.summary.headline, /상태 정보 확인 필요/);
    assert.doesNotMatch(JSON.stringify(model), /신뢰도\s*\d|\d+%/);
  });
});

describe('status preview fixtures', () => {
  it('provides exactly six deterministic status scenarios with no authenticated loader', async () => {
    const fixtureModule =
      await import('../src/pages/dev-preview/model/status-preview-fixture.ts').catch(() => null);
    assert.ok(fixtureModule, 'expected deterministic status preview fixtures to exist');
    if (!fixtureModule) return;

    const scenarios = [
      'default',
      'all-ready',
      'stale',
      'source-limited',
      'empty',
      'error',
    ] as const;

    for (const scenario of scenarios) {
      const preview = fixtureModule.resolveStatusPreview(scenario);
      assert.equal(preview.data.view, 'status');
      assert.equal(preview.briefing.summary.generatedAt, preview.data.status.generatedAt);
    }

    assert.equal(fixtureModule.resolveStatusPreview('all-ready').briefing.summary.level, 'ready');
    assert.equal(fixtureModule.resolveStatusPreview('stale').briefing.summary.level, 'limited');
    assert.equal(
      fixtureModule.resolveStatusPreview('source-limited').briefing.summary.level,
      'limited',
    );
    assert.equal(fixtureModule.resolveStatusPreview('empty').briefing.summary.level, 'attention');
    assert.equal(fixtureModule.resolveStatusPreview('error').initialError, true);
  });
});
