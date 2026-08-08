import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  DecisionHistoryItem,
  DecisionHistoryPage,
} from '@stock-insight/contracts/research-workspace';

const generatedAt = '2026-08-08T09:00:00.000Z';

function historyItem(
  historyId: string,
  overrides: Partial<DecisionHistoryItem> = {},
): DecisionHistoryItem {
  return {
    historyId,
    entityKey: 'KR:005930',
    market: 'KR',
    entryType: 'manual_note',
    title: `판단 ${historyId.slice(-2)}`,
    thesis: '당시 판단 근거',
    evidenceCount: 2,
    sourceKind: 'filing',
    sourceRef: 'https://example.com/evidence',
    occurredAt: '2026-08-01T00:00:00.000Z',
    reviewDueAt: '2026-08-08T00:00:00.000Z',
    status: 'open',
    adviceProhibited: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function historyPage(items: DecisionHistoryItem[], scopeTotal = items.length): DecisionHistoryPage {
  return {
    generatedAt,
    availability: items.length === 0 ? 'missing' : 'available',
    scopeTotal,
    items,
    nextCursor: null,
  };
}

describe('history briefing model', () => {
  it('classifies alert reviews as observations and every other entry type as judgments', async () => {
    const modelModule =
      await import('../src/pages/research-workspace/model/history-briefing.ts').catch(() => null);
    assert.ok(modelModule, 'expected the page-local history briefing model to exist');
    if (!modelModule) return;

    const alert = historyItem('00000000-0000-4000-8000-000000000001', {
      entryType: 'alert_review',
      reviewDueAt: null,
    });
    const manual = historyItem('00000000-0000-4000-8000-000000000002', {
      entryType: 'manual_note',
      reviewDueAt: null,
    });
    const trade = historyItem('00000000-0000-4000-8000-000000000003', {
      entryType: 'trade_note',
      reviewDueAt: null,
    });
    const evaluation = historyItem('00000000-0000-4000-8000-000000000004', {
      entryType: 'judgment_evaluation',
      reviewDueAt: null,
    });

    const model = modelModule.buildHistoryBriefingModel(
      historyPage([alert, manual, trade, evaluation]),
    );

    assert.deepEqual(
      model.observations.map((item) => [item.historyId, item.kind]),
      [[alert.historyId, 'observation']],
    );
    assert.deepEqual(
      model.activeJudgments.map((item) => [item.historyId, item.kind]),
      [
        [manual.historyId, 'judgment'],
        [trade.historyId, 'judgment'],
        [evaluation.historyId, 'judgment'],
      ],
    );
    assert.equal(model.summary.loadedObservationCount, 1);
  });

  it('de-duplicates loaded entries before selecting the earliest three due open judgments', async () => {
    const { buildHistoryBriefingModel } =
      await import('../src/pages/research-workspace/model/history-briefing.ts');
    const first = historyItem('00000000-0000-4000-8000-000000000011', {
      reviewDueAt: '2026-08-05T00:00:00.000Z',
    });
    const duplicate = { ...first, title: '중복 행' };
    const second = historyItem('00000000-0000-4000-8000-000000000012', {
      reviewDueAt: '2026-08-06T00:00:00.000Z',
    });
    const third = historyItem('00000000-0000-4000-8000-000000000013', {
      reviewDueAt: generatedAt,
    });
    const fourth = historyItem('00000000-0000-4000-8000-000000000014', {
      reviewDueAt: '2026-08-07T00:00:00.000Z',
    });
    const future = historyItem('00000000-0000-4000-8000-000000000015', {
      reviewDueAt: '2026-08-09T00:00:00.000Z',
    });

    const model = buildHistoryBriefingModel(
      historyPage([third, first, duplicate, future, fourth, second], 7),
    );

    assert.deepEqual(
      model.priorityJudgments.map((item) => item.historyId),
      [first.historyId, second.historyId, fourth.historyId],
    );
    assert.deepEqual(
      model.activeJudgments.map((item) => item.historyId),
      [third.historyId, future.historyId],
    );
    assert.equal(model.summary.loadedDueCount, 4);
    assert.equal(model.summary.scopeTotal, 7);
  });

  it('separates reviewed and archived entries from open judgments and observations', async () => {
    const { buildHistoryBriefingModel } =
      await import('../src/pages/research-workspace/model/history-briefing.ts');
    const reviewed = historyItem('00000000-0000-4000-8000-000000000021', {
      status: 'reviewed',
    });
    const archivedObservation = historyItem('00000000-0000-4000-8000-000000000022', {
      entryType: 'alert_review',
      status: 'archived',
    });

    const model = buildHistoryBriefingModel(historyPage([reviewed, archivedObservation]));

    assert.deepEqual(
      model.pastEntries.map((item) => item.historyId),
      [reviewed.historyId, archivedObservation.historyId],
    );
    assert.deepEqual(model.priorityJudgments, []);
    assert.deepEqual(model.activeJudgments, []);
    assert.deepEqual(model.observations, []);
  });

  it('derives honest live detail synchronously without inventing changes or checkpoints', async () => {
    const { buildHistoryBriefingDetail, buildHistoryBriefingModel } =
      await import('../src/pages/research-workspace/model/history-briefing.ts');
    const item = historyItem('00000000-0000-4000-8000-000000000031');
    const briefingItem = buildHistoryBriefingModel(historyPage([item])).priorityJudgments[0];
    assert.ok(briefingItem);

    const detail = buildHistoryBriefingDetail(briefingItem);

    assert.equal(detail.item, briefingItem);
    assert.equal(detail.availability, 'partial');
    assert.equal(detail.evidenceState, null);
    assert.equal(detail.changeSummary, undefined);
    assert.deepEqual(detail.checkpoints, []);
    assert.deepEqual(detail.relatedNews, []);
    assert.deepEqual(detail.marketPaths, []);
    assert.deepEqual(detail.partialFailures, {});
  });

  it('links only valid HTTPS source references', async () => {
    const { buildHistoryBriefingDetail, buildHistoryBriefingModel } =
      await import('../src/pages/research-workspace/model/history-briefing.ts');
    const sources = [
      'https://example.com/report',
      'http://example.com/report',
      'javascript:alert(1)',
      'not a url',
      null,
    ] as const;

    for (const [index, sourceRef] of sources.entries()) {
      const item = historyItem(`00000000-0000-4000-8000-00000000004${index}`, { sourceRef });
      const briefingItem = buildHistoryBriefingModel(historyPage([item])).priorityJudgments[0];
      assert.ok(briefingItem);
      const [evidence] = buildHistoryBriefingDetail(briefingItem).originalEvidence;
      assert.ok(evidence);
      assert.equal(evidence.url, index === 0 ? sourceRef : undefined);
    }
  });

  it('treats a zero-item missing response as a normal empty briefing', async () => {
    const { buildHistoryBriefingModel } =
      await import('../src/pages/research-workspace/model/history-briefing.ts');

    const model = buildHistoryBriefingModel(historyPage([], 0));

    assert.deepEqual(model, {
      summary: {
        scopeTotal: 0,
        loadedDueCount: 0,
        loadedObservationCount: 0,
        generatedAt,
      },
      priorityJudgments: [],
      activeJudgments: [],
      observations: [],
      pastEntries: [],
    });
  });
});

describe('history preview fixtures', () => {
  it('provides all six deterministic history scenarios with only a local preview detail loader', async () => {
    const fixtureModule =
      await import('../src/pages/dev-preview/model/history-preview-fixture.ts').catch(() => null);
    assert.ok(fixtureModule, 'expected deterministic history preview fixtures to exist');
    if (!fixtureModule) return;

    const scenarios = [
      'default',
      'no-user-judgments',
      'no-due',
      'empty',
      'partial',
      'detail-error',
    ] as const;

    for (const scenario of scenarios) {
      const preview = fixtureModule.resolveHistoryPreview(scenario);
      assert.equal(preview.data.view, 'history');
      assert.equal(preview.briefing.summary.generatedAt, preview.data.history.generatedAt);
      assert.equal(typeof preview.getDetail, 'function');
      assert.equal(typeof preview.loader, 'function');
    }

    const defaultPreview = fixtureModule.resolveHistoryPreview('default');
    assert.equal(defaultPreview.briefing.priorityJudgments.length, 3);
    assert.ok(defaultPreview.briefing.activeJudgments.length > 0);
    assert.ok(defaultPreview.briefing.observations.length > 0);
    assert.ok(defaultPreview.briefing.pastEntries.length > 0);
    assert.equal(
      defaultPreview.getDetail(defaultPreview.briefing.priorityJudgments[0]!.historyId)
        .availability,
      'available',
    );

    const observationsOnly = fixtureModule.resolveHistoryPreview('no-user-judgments');
    assert.equal(observationsOnly.briefing.priorityJudgments.length, 0);
    assert.equal(observationsOnly.briefing.activeJudgments.length, 0);
    assert.ok(observationsOnly.briefing.observations.length > 0);

    const noDue = fixtureModule.resolveHistoryPreview('no-due');
    assert.equal(noDue.briefing.priorityJudgments.length, 0);
    assert.ok(noDue.briefing.activeJudgments.length > 0);

    const empty = fixtureModule.resolveHistoryPreview('empty');
    assert.equal(empty.data.history.availability, 'missing');
    assert.equal(empty.briefing.summary.scopeTotal, 0);

    const partial = fixtureModule.resolveHistoryPreview('partial');
    const partialDetail = partial.getDetail(partial.briefing.priorityJudgments[0]!.historyId);
    assert.equal(partialDetail.availability, 'partial');
    assert.ok(partialDetail.partialFailures.changes);
    assert.ok(partialDetail.partialFailures.evidence);

    const detailError = fixtureModule.resolveHistoryPreview('detail-error');
    assert.equal(detailError.detailError, '개발 미리보기에서 상세를 불러오지 못했습니다.');
    assert.equal(detailError.canRetryDetail, true);
    const detailErrorItem = detailError.briefing.priorityJudgments[0]!;
    await assert.rejects(detailError.loader(detailErrorItem.historyId), /개발 미리보기/);
    assert.equal((await detailError.loader(detailErrorItem.historyId)).item, detailErrorItem);
  });
});
