# Judgment Review Redesign Design

## Product decision

- The menu label remains `복기`; the page title remains `판단 복기`.
- The fixed page order is `오늘 다시 볼 판단 → 진행 중 판단 → 자동 시장 관찰 → 지난 복기`.
- Review is organized around `당시 근거 → 현재 변화 → 근거 상태 → 다음 확인 조건`, never investment performance or a success/failure verdict.
- The surface stays read-only. It adds no authoring, editing, completion, broker action, or advisory behavior.

## Architecture and boundaries

- `HistoryView` remains the shared live/preview product view.
- A page-local adapter derives an honest briefing from the existing `DecisionHistoryResponse`. The live path makes no additional detail request and does not infer unavailable evidence state, changes, or checkpoints.
- The dev preview injects deterministic complete fixtures without calling authenticated loaders.
- The existing `DetailInspectorFrame` supplies desktop drawer/modal and mobile bottom-sheet behavior.
- Do not change the database, migrations, API server, public `@stock-insight/contracts` responses, or dependencies.

## Page-local model

```ts
type HistoryEntryKind = 'judgment' | 'observation';
type HistoryEvidenceState = 'maintained' | 'changed' | 'review_required' | null;

type HistoryBriefingItem = {
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

type HistoryBriefingModel = {
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

type HistoryBriefingDetail = {
  item: HistoryBriefingItem;
  availability: 'available' | 'partial' | 'missing';
  evidenceState: HistoryEvidenceState;
  originalEvidence: Array<{ id: string; label: string; url?: string }>;
  changeSummary?: string;
  relatedNews: Array<{ id: string; title: string; url?: string }>;
  marketPaths: Array<{ id: string; label: string; summary?: string }>;
  checkpoints: string[];
  partialFailures: {
    changes?: string;
    evidence?: string;
  };
};
```

## Classification and ordering

- `alert_review` is an automatic observation; all other entry types are user judgments.
- Priority judgments are de-duplicated loaded entries with `status === 'open'` and `reviewDueAt <= generatedAt`, sorted by review date ascending and capped at three.
- Active judgments are remaining open user judgments. Observations are presented independently. Reviewed and archived entries belong to the collapsed past section.
- Summary counts are explicitly scoped to the loaded response where applicable. A zero-item `missing` response is presented as a normal no-record state.
- Only valid HTTPS `sourceRef` values become external links.

## Screen behavior

- Summary metrics: total records, due among loaded records, automatic observations, generated time.
- With no due judgment, render `오늘 예정된 복기가 없습니다`; do not promote a recent item.
- Past reviews are collapsed by default and expand/collapse without mutating data.
- All entry points share exact selection state and one detail inspector.

## Inspector behavior

- Desktop: 420–760px resizable drawer, 520px default, and a wide modal using the same loaded detail.
- Mobile: bottom sheet entering from the bottom, with no resize or presentation toggle.
- Overlay click and Escape close only the detail and restore focus to the exact opener.
- Judgment order: `요약 → 당시 판단 → 당시 근거 → 지금 달라진 점 → 근거 상태 → 다음 확인 조건`.
- Observation detail is reduced to `감지된 변화 → 연결 근거 → 확인 상태` and is not described as a user judgment.
- Missing optional sections are omitted; localized partial failures remain visible. Modal switching performs no request.

## Development preview

`surface=history` supports exactly:

- `default`: three due judgments, active judgments, observations, past entries, complete details.
- `no-user-judgments`: observations only.
- `no-due`: open judgments but no due review.
- `empty`: no records.
- `partial`: base detail remains while evidence/change sections fail locally.
- `detail-error`: selection remains and the detail provides retry.

## Verification contract

- Cover classification, ordering, de-duplication, honest live null states, HTTPS filtering, and zero records with focused model tests.
- Cover desktop/mobile order, selection consistency, geometry, overlay close-only, no-request modal switch, remembered width, exact focus restoration, 1240px stacking, 390px bottom sheet, dark mode, reduced motion, Axe, wrapping, and overflow with Playwright.
- Assert that buy/sell instructions, target/stop prices, and success/failure verdicts never render.
- Regress Today, Stocks, and Market Connections inspector behavior.
