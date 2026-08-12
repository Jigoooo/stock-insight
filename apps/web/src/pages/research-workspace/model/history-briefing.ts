import type {
  DecisionHistoryItem,
  DecisionHistoryPage,
} from '@stock-insight/contracts/research-workspace';

export type HistoryEntryKind = 'judgment' | 'observation';
export type HistoryEvidenceState = 'maintained' | 'changed' | 'review_required' | null;

export type HistoryBriefingItem = {
  historyId: string;
  entityKey: string;
  kind: HistoryEntryKind;
  entryType: DecisionHistoryItem['entryType'];
  status: DecisionHistoryItem['status'];
  title: string;
  thesis: string;
  evidenceCount: number;
  occurredAt: string | null;
  reviewDueAt: string | null;
  createdAt: string;
  sourceKind: string | null;
  sourceRef: string | null;
};

export type HistoryBriefingModel = {
  summary: {
    scopeTotal: number;
    loadedDueCount: number;
    loadedObservationCount: number;
    generatedAt: string;
  };
  priorityJudgments: HistoryBriefingItem[];
  activeJudgments: HistoryBriefingItem[];
  observations: HistoryBriefingItem[];
  pastEntries: HistoryBriefingItem[];
};

export type HistoryBriefingDetail = {
  item: HistoryBriefingItem;
  availability: 'available' | 'partial' | 'missing';
  evidenceState: HistoryEvidenceState;
  originalEvidence: Array<{ id: string; label: string; url?: string }>;
  changeSummary?: string;
  relatedNews: Array<{ id: string; title: string; url?: string }>;
  marketPaths: Array<{ id: string; label: string; summary?: string }>;
  /*
    `checkpoints` 가 여기 있었다. 라이브 경로에서 `[]` 로만 채워져 프로덕션에서는
    "다음 확인 조건"·"확인 상태" 두 섹션이 한 번도 그려지지 않았고, 프리뷰
    픽스처만 값을 넣어 e2e 가 그 위에서 통과했다. 같은 판단의 근거는
    `market-connections.ts` 의 대응 자리에 적었다.
  */
  partialFailures: {
    changes?: string;
    evidence?: string;
  };
};

function toBriefingItem(item: DecisionHistoryItem): HistoryBriefingItem {
  return {
    historyId: item.historyId,
    entityKey: item.entityKey,
    kind: item.entryType === 'alert_review' ? 'observation' : 'judgment',
    entryType: item.entryType,
    status: item.status,
    title: item.title,
    thesis: item.thesis,
    evidenceCount: item.evidenceCount,
    occurredAt: item.occurredAt,
    reviewDueAt: item.reviewDueAt,
    createdAt: item.createdAt,
    sourceKind: item.sourceKind,
    sourceRef: item.sourceRef,
  };
}

function isDue(item: HistoryBriefingItem, generatedAt: string) {
  if (item.kind !== 'judgment' || item.status !== 'open' || !item.reviewDueAt) return false;
  return Date.parse(item.reviewDueAt) <= Date.parse(generatedAt);
}

export function buildHistoryBriefingModel(data: DecisionHistoryPage): HistoryBriefingModel {
  const seen = new Set<string>();
  const items = data.items.flatMap((item) => {
    if (seen.has(item.historyId)) return [];
    seen.add(item.historyId);
    return [toBriefingItem(item)];
  });
  const dueJudgments = items
    .filter((item) => isDue(item, data.generatedAt))
    .sort((left, right) => (left.reviewDueAt ?? '').localeCompare(right.reviewDueAt ?? ''));
  const priorityIds = new Set(dueJudgments.slice(0, 3).map((item) => item.historyId));

  return {
    summary: {
      scopeTotal: data.scopeTotal,
      loadedDueCount: dueJudgments.length,
      loadedObservationCount: items.filter((item) => item.kind === 'observation').length,
      generatedAt: data.generatedAt,
    },
    priorityJudgments: dueJudgments.slice(0, 3),
    activeJudgments: items.filter(
      (item) =>
        item.kind === 'judgment' && item.status === 'open' && !priorityIds.has(item.historyId),
    ),
    observations: items.filter((item) => item.kind === 'observation' && item.status === 'open'),
    pastEntries: items.filter((item) => item.status !== 'open'),
  };
}

function httpsUrl(sourceRef: string | null) {
  if (!sourceRef) return undefined;
  try {
    const url = new URL(sourceRef);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function buildHistoryBriefingDetail(item: HistoryBriefingItem): HistoryBriefingDetail {
  const sourceUrl = httpsUrl(item.sourceRef);
  const originalEvidence =
    item.sourceKind || item.sourceRef
      ? [
          {
            id: `${item.historyId}:source`,
            label: item.sourceKind ?? '기록된 원문 근거',
            ...(sourceUrl ? { url: sourceUrl } : {}),
          },
        ]
      : [];

  return {
    item,
    availability: 'partial',
    evidenceState: null,
    originalEvidence,
    relatedNews: [],
    marketPaths: [],
    partialFailures: {},
  };
}
