import { ExternalLink, History } from 'lucide-react';

import { DetailInspectorFrame, type DetailInspectorPresentation } from './detail-inspector-frame';
import styles from './history-briefing-inspector.module.css';

import { historyInspectorWidthStorageKey } from '@/pages/research-workspace/model/detail-inspector-layout';
import type { HistoryBriefingDetail } from '@/pages/research-workspace/model/history-briefing';
import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/button';
import { TextLink } from '@/shared/ui/link';
import { StructuredList, WorkspaceState } from '@/shared/ui/workspace';

export type HistoryBriefingInspectorState = 'error' | 'loading' | 'ready';

function isValidHttpsUrl(value?: string): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function evidenceStateLabel(value: HistoryBriefingDetail['evidenceState']) {
  if (value === 'maintained') return '당시 근거가 현재까지 유지됨';
  if (value === 'changed') return '당시 근거 이후 변화가 확인됨';
  if (value === 'review_required') return '추가 확인이 필요한 상태';
  return null;
}

function LocalFailure({ message }: { message: string }) {
  return (
    <WorkspaceState
      className={styles.localFailure}
      kind="unavailable"
      title={message}
      description="기본 기록은 유지되며, 이 항목만 잠시 확인할 수 없습니다."
    />
  );
}

function EvidenceList({ detail }: { detail: HistoryBriefingDetail }) {
  const evidence = [
    ...detail.originalEvidence.map((item) => ({
      id: item.id,
      label: item.label,
      url: item.url,
      summary: undefined,
    })),
    ...detail.relatedNews.map((item) => ({
      id: item.id,
      label: item.title,
      url: item.url,
      summary: undefined,
    })),
    ...detail.marketPaths.map((item) => ({
      id: item.id,
      label: item.label,
      url: undefined,
      summary: item.summary,
    })),
  ];

  return (
    <>
      {evidence.length > 0 && (
        <StructuredList className={styles.evidenceList}>
          {evidence.map((item) => (
            <li key={item.id}>
              {isValidHttpsUrl(item.url) ? (
                <TextLink href={item.url} target="_blank" rel="noreferrer" motion="quiet">
                  <strong>{item.label}</strong>
                  <ExternalLink aria-hidden="true" />
                </TextLink>
              ) : (
                <strong>{item.label}</strong>
              )}
              {item.summary ? <p>{presentResearchSummary(item.summary)}</p> : null}
            </li>
          ))}
        </StructuredList>
      )}
      {detail.partialFailures.evidence && (
        <LocalFailure message={detail.partialFailures.evidence} />
      )}
    </>
  );
}

function JudgmentDetail({
  detail,
  presentation,
}: {
  detail: HistoryBriefingDetail;
  presentation: DetailInspectorPresentation;
}) {
  const evidenceState = evidenceStateLabel(detail.evidenceState);
  const hasEvidence =
    detail.originalEvidence.length > 0 ||
    detail.relatedNews.length > 0 ||
    detail.marketPaths.length > 0 ||
    Boolean(detail.partialFailures.evidence);
  const hasChanges = Boolean(detail.changeSummary || detail.partialFailures.changes);

  return (
    <div className={styles.readyContent} data-presentation={presentation}>
      <section className={styles.summary} aria-labelledby="history-inspector-summary">
        <span>판단 기록 · {detail.item.entityKey}</span>
        <h2 id="history-inspector-summary">요약</h2>
        <strong>{detail.item.title}</strong>
      </section>
      <div className={styles.comparisonGrid}>
        <div className={styles.originalColumn}>
          <section aria-labelledby="history-inspector-original-judgment">
            <h3 id="history-inspector-original-judgment">당시 판단</h3>
            <p>{presentResearchSummary(detail.item.thesis)}</p>
          </section>
          {hasEvidence && (
            <section aria-labelledby="history-inspector-original-evidence">
              <h3 id="history-inspector-original-evidence">당시 근거</h3>
              <EvidenceList detail={detail} />
            </section>
          )}
        </div>
        <div className={styles.currentColumn}>
          {hasChanges && (
            <section aria-labelledby="history-inspector-changes">
              <h3 id="history-inspector-changes">지금 달라진 점</h3>
              {detail.changeSummary ? <p>{presentResearchSummary(detail.changeSummary)}</p> : null}
              {detail.partialFailures.changes && (
                <LocalFailure message={detail.partialFailures.changes} />
              )}
            </section>
          )}
          {evidenceState && (
            <section aria-labelledby="history-inspector-evidence-state">
              <h3 id="history-inspector-evidence-state">근거 상태</h3>
              <p>{evidenceState}</p>
            </section>
          )}
        </div>
      </div>
      {detail.checkpoints.length > 0 && (
        <section aria-labelledby="history-inspector-checkpoints">
          <h3 id="history-inspector-checkpoints">다음 확인 조건</h3>
          <StructuredList>
            {detail.checkpoints.map((checkpoint) => (
              <li key={checkpoint}>{checkpoint}</li>
            ))}
          </StructuredList>
        </section>
      )}
    </div>
  );
}

function ObservationDetail({ detail }: { detail: HistoryBriefingDetail }) {
  const evidenceState = evidenceStateLabel(detail.evidenceState);
  const hasEvidence =
    detail.originalEvidence.length > 0 ||
    detail.relatedNews.length > 0 ||
    detail.marketPaths.length > 0 ||
    Boolean(detail.partialFailures.evidence);

  return (
    <div className={styles.readyContent} data-presentation="observation">
      <section className={styles.summary} aria-labelledby="history-inspector-observation-change">
        <span>자동 시장 관찰 · {detail.item.entityKey}</span>
        <h2 id="history-inspector-observation-change">감지된 변화</h2>
        <strong>{detail.item.title}</strong>
        <p>{presentResearchSummary(detail.changeSummary ?? detail.item.thesis)}</p>
        {detail.partialFailures.changes && (
          <LocalFailure message={detail.partialFailures.changes} />
        )}
      </section>
      {hasEvidence && (
        <section aria-labelledby="history-inspector-observation-evidence">
          <h3 id="history-inspector-observation-evidence">연결 근거</h3>
          <EvidenceList detail={detail} />
        </section>
      )}
      {(evidenceState || detail.checkpoints.length > 0) && (
        <section aria-labelledby="history-inspector-observation-state">
          <h3 id="history-inspector-observation-state">확인 상태</h3>
          {evidenceState ? <p>{evidenceState}</p> : null}
          {detail.checkpoints.length > 0 && (
            <StructuredList>
              {detail.checkpoints.map((checkpoint) => (
                <li key={checkpoint}>{checkpoint}</li>
              ))}
            </StructuredList>
          )}
        </section>
      )}
    </div>
  );
}

export function HistoryBriefingInspectorContent({
  detail,
  onRetry,
  presentation,
  state,
}: {
  detail: HistoryBriefingDetail | null;
  onRetry: () => void;
  presentation: DetailInspectorPresentation;
  state: HistoryBriefingInspectorState;
}) {
  if (state === 'loading') {
    return (
      <div className={styles.state}>
        {detail ? <strong>{detail.item.title}</strong> : null}
        <WorkspaceState
          delayMs={0}
          kind="loading"
          title="복기 상세를 준비하고 있습니다"
          description="선택한 기록의 근거와 현재 변화를 확인하는 중입니다."
        />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={styles.state}>
        {detail ? <strong>{detail.item.title}</strong> : null}
        <WorkspaceState
          kind="error"
          title="복기 상세를 불러오지 못했습니다"
          description="선택은 유지됩니다. 같은 기록을 다시 불러올 수 있습니다."
          action={
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              다시 불러오기
            </Button>
          }
        />
      </div>
    );
  }

  if (!detail || detail.availability === 'missing') {
    return (
      <WorkspaceState
        className={styles.state}
        kind="empty"
        title="복기 상세가 준비되지 않았습니다"
        description="현재 기록 범위에는 연결된 상세 정보가 없습니다."
      />
    );
  }

  return detail.item.kind === 'observation' ? (
    <ObservationDetail detail={detail} />
  ) : (
    <JudgmentDetail detail={detail} presentation={presentation} />
  );
}

export function HistoryBriefingInspector({
  detail,
  detailKey,
  mobile,
  onClose,
  onRetry,
  open,
  state,
}: {
  detail: HistoryBriefingDetail | null;
  detailKey: string | null;
  mobile: boolean;
  onClose: () => void;
  onRetry: () => void;
  open: boolean;
  state: HistoryBriefingInspectorState;
}) {
  return (
    <DetailInspectorFrame
      bodyClassName={styles.inspectorBody}
      closeLabel="복기 상세 닫기"
      description="선택한 기록의 당시 근거와 현재 변화"
      detailKey={detailKey}
      mobile={mobile}
      onClose={onClose}
      open={open}
      resizerLabel="복기 상세 너비 조절"
      storageKey={historyInspectorWidthStorageKey}
      testId="history-briefing-inspector"
      title="판단 복기 상세"
      titleIcon={<History aria-hidden="true" />}
    >
      {(presentation) => (
        <HistoryBriefingInspectorContent
          detail={detail}
          onRetry={onRetry}
          presentation={presentation}
          state={state}
        />
      )}
    </DetailInspectorFrame>
  );
}
