import {
  buildHistoryBriefingModel,
  type HistoryBriefingDetail,
  type HistoryBriefingItem,
} from '../../research-workspace/model/history-briefing.ts';
import type { ResearchWorkspaceViewPayload } from '@/pages/research-workspace/model/workspace-view-payload';
import type { DecisionHistoryItem } from '@stock-insight/contracts/research-workspace';

export type HistoryPreviewScenario =
  | 'default'
  | 'no-user-judgments'
  | 'no-due'
  | 'empty'
  | 'partial'
  | 'detail-error';

type HistoryPreviewPayload = Extract<ResearchWorkspaceViewPayload, { view: 'history' }>;

const generatedAt = '2026-08-08T09:00:00.000Z';

function previewItem(
  historyId: string,
  overrides: Partial<DecisionHistoryItem>,
): DecisionHistoryItem {
  return {
    historyId,
    entityKey: 'KR:005930',
    market: 'KR',
    entryType: 'manual_note',
    title: '메모리 업황 회복 판단 복기',
    thesis: '수요 회복과 재고 정상화가 이어지는지 확인합니다.',
    evidenceCount: 2,
    sourceKind: '공시',
    sourceRef: 'https://example.com/stock-insight/history/source',
    occurredAt: '2026-08-01T00:00:00.000Z',
    reviewDueAt: '2026-08-08T00:00:00.000Z',
    status: 'open',
    adviceProhibited: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

const defaultItems: DecisionHistoryItem[] = [
  previewItem('10000000-0000-4000-8000-000000000001', {
    title: '메모리 재고 정상화 확인',
    reviewDueAt: '2026-08-06T09:00:00.000Z',
  }),
  previewItem('10000000-0000-4000-8000-000000000002', {
    entityKey: 'US:NVDA',
    market: 'US',
    title: 'AI 인프라 수요 지속성 확인',
    thesis: '데이터센터 투자와 공급 제약의 변화를 함께 확인합니다.',
    reviewDueAt: '2026-08-07T09:00:00.000Z',
  }),
  previewItem('10000000-0000-4000-8000-000000000003', {
    entityKey: 'KR:000660',
    title: '고대역폭 메모리 공급 조건 확인',
    reviewDueAt: generatedAt,
  }),
  previewItem('10000000-0000-4000-8000-000000000004', {
    entityKey: 'US:AAPL',
    market: 'US',
    title: '서비스 매출 구성 변화 확인',
    reviewDueAt: '2026-08-12T09:00:00.000Z',
  }),
  previewItem('10000000-0000-4000-8000-000000000005', {
    entryType: 'alert_review',
    title: '환율 변동 자동 관찰',
    thesis: '원화 환율 변동이 수출 기업 환경에 줄 수 있는 영향을 관찰합니다.',
    reviewDueAt: null,
    sourceKind: '시장 데이터',
  }),
  previewItem('10000000-0000-4000-8000-000000000006', {
    title: '이전 수요 판단 복기',
    status: 'reviewed',
    reviewDueAt: '2026-07-20T09:00:00.000Z',
  }),
  previewItem('10000000-0000-4000-8000-000000000007', {
    entryType: 'trade_note',
    title: '보관된 당시 조건 기록',
    status: 'archived',
    reviewDueAt: null,
  }),
];

function historyPayload(items: DecisionHistoryItem[], availability: 'available' | 'missing') {
  return {
    view: 'history',
    shell: { radarScopeTotal: 5, watchlistCount: 4 },
    history: {
      generatedAt,
      availability,
      scopeTotal: items.length,
      items,
      nextCursor: null,
    },
  } satisfies HistoryPreviewPayload;
}

function completeDetail(item: HistoryBriefingItem): HistoryBriefingDetail {
  const sourceUrl = item.sourceRef?.startsWith('https://') ? item.sourceRef : undefined;
  return {
    item,
    availability: 'available',
    evidenceState: item.kind === 'observation' ? 'review_required' : 'maintained',
    originalEvidence: [
      {
        id: `${item.historyId}:evidence`,
        label: item.sourceKind ?? '기록된 근거',
        ...(sourceUrl ? { url: sourceUrl } : {}),
      },
    ],
    changeSummary: '최근 공개 정보에서는 당시 조건을 뒤집는 변화가 확인되지 않았습니다.',
    relatedNews: [
      {
        id: `${item.historyId}:news`,
        title: '연결된 최근 공개 정보',
        url: 'https://example.com/stock-insight/history/news',
      },
    ],
    marketPaths: [
      {
        id: `${item.historyId}:path`,
        label: '수요 → 재고 → 가격 경로',
        summary: '수요와 재고 변화를 다음 공개 자료에서 다시 확인합니다.',
      },
    ],
    checkpoints: ['다음 분기 공개 자료에서 재고와 수요 지표를 다시 확인'],
    partialFailures: {},
  };
}

function resolveItems(scenario: HistoryPreviewScenario) {
  if (scenario === 'no-user-judgments') {
    return defaultItems.filter(
      (item) => item.entryType === 'alert_review' && item.status === 'open',
    );
  }
  if (scenario === 'no-due') {
    return defaultItems
      .filter((item) => item.status === 'open' && item.entryType !== 'alert_review')
      .map((item, index) => ({
        ...item,
        reviewDueAt: `2026-08-${12 + index}T09:00:00.000Z`,
      }));
  }
  if (scenario === 'empty') return [];
  return defaultItems;
}

export function resolveHistoryPreview(scenario: HistoryPreviewScenario) {
  const items = resolveItems(scenario);
  const data = historyPayload(items, scenario === 'empty' ? 'missing' : 'available');
  const briefing = buildHistoryBriefingModel(data.history);
  const details = new Map(
    [
      ...briefing.priorityJudgments,
      ...briefing.activeJudgments,
      ...briefing.observations,
      ...briefing.pastEntries,
    ].map((item) => {
      const detail = completeDetail(item);
      if (scenario === 'partial') {
        detail.availability = 'partial';
        detail.changeSummary = undefined;
        detail.originalEvidence = [];
        detail.partialFailures = {
          changes: '현재 변화 요약을 불러오지 못했습니다.',
          evidence: '연결 근거를 불러오지 못했습니다.',
        };
      }
      return [item.historyId, detail] as const;
    }),
  );
  let detailAttempts = 0;

  const getDetail = (historyId: string) => {
    const detail = details.get(historyId);
    if (!detail) throw new Error(`Unknown history preview item: ${historyId}`);
    return detail;
  };

  return {
    data,
    briefing,
    getDetail,
    async loader(historyId: string) {
      detailAttempts += 1;
      if (scenario === 'detail-error' && detailAttempts === 1) {
        throw new Error('개발 미리보기에서 상세를 불러오지 못했습니다.');
      }
      return getDetail(historyId);
    },
    detailError:
      scenario === 'detail-error' ? '개발 미리보기에서 상세를 불러오지 못했습니다.' : null,
    canRetryDetail: scenario === 'detail-error',
  };
}
