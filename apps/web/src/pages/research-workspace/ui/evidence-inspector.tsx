import { AlertCircle, CircleDot, FileText, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';

import styles from './research-workspace-page.module.css';
import { useWorkspaceOverlayMotion } from './use-workspace-overlay-motion';

import {
  presentResearchSummary,
  sourceAttributionLabel,
} from '@/pages/research-workspace/model/presentation';
import { Button, IconButton, TextLink } from '@/shared/ui/primitives';
import type {
  EntityRelationGraph,
  ResearchRecordDetail,
} from '@stock-insight/contracts/research-workspace';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () =>
      Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) =>
          !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      );
    const frame = window.requestAnimationFrame(() => {
      (
        container.querySelector<HTMLElement>('[data-initial-focus]') ??
        focusableElements()[0] ??
        container
      ).focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) window.setTimeout(() => previousFocus.focus(), 0);
    };
  }, [active, containerRef]);
}

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '기준 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(value));
}

function confidenceLabel(value: string) {
  if (value === 'high') return '근거 높음';
  if (value === 'medium') return '근거 보통';
  return '근거 낮음';
}

function marketLabel(value: string) {
  return (
    {
      KR: '한국',
      KRX: '한국',
      KOSDAQ: '코스닥',
      US: '미국',
      NASDAQ: '나스닥',
      NYSE: '뉴욕증권거래소',
      AMEX: '미국',
      MACRO: '거시경제',
      GLOBAL: '글로벌',
    }[value] ?? '기타 시장'
  );
}

function categoryLabel(value: string) {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  const labels: Record<string, string> = {
    news: '시장 소식',
    market_news: '시장 소식',
    disclosure: '공시',
    radar: '레이더 신호',
    research: '리서치',
    theme: '테마 변화',
  };
  if (labels[normalized]) return labels[normalized];
  return /[가-힣]/.test(value) ? value : '리서치 기록';
}

function sourceBindingLabel(value: string) {
  const labels: Record<string, string> = {
    verified: '기준 시점 확인됨',
    superseded: '이후 갱신됨',
    missing: '연결 확인 필요',
  };
  return labels[value] ?? '연결 상태 확인 중';
}

function InspectorState({
  kind,
  title,
  description,
}: {
  kind: 'empty' | 'error' | 'loading';
  title: string;
  description: string;
}) {
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? AlertCircle : CircleDot;
  return (
    <div
      className={styles.stateSurface}
      data-kind={kind}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" data-motion-loop={kind === 'loading' ? 'spinner' : undefined} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function EvidenceInspector({
  detail,
  modal,
  onClose,
  open,
  relation,
  state,
}: {
  detail: ResearchRecordDetail | null;
  modal: boolean;
  onClose: () => void;
  open: boolean;
  relation: EntityRelationGraph | null;
  state: 'error' | 'loading' | 'ready';
}) {
  const inspectorRef = useRef<HTMLDialogElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const transition = useWorkspaceOverlayMotion({
    kind: 'inspector',
    open,
    panelRef: inspectorRef,
    scopeRef: inspectorRef,
    scrimRef,
  });

  const renderModal = transition.rendered && modal;

  useFocusTrap(renderModal && transition.desiredOpen, inspectorRef, onClose);
  useEffect(() => {
    if (renderModal || !transition.desiredOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, renderModal, transition.desiredOpen]);
  if (!transition.rendered) return null;

  return (
    <>
      {renderModal && (
        <Button
          ref={scrimRef}
          className={styles.scrim}
          type="button"
          motion="none"
          aria-hidden={!transition.desiredOpen || undefined}
          aria-label="인스펙터 닫기"
          disabled={!transition.desiredOpen}
          tabIndex={transition.desiredOpen ? 0 : -1}
          onClick={onClose}
        />
      )}
      <dialog
        open
        ref={inspectorRef}
        className={styles.inspector}
        aria-modal={(renderModal && transition.desiredOpen) || undefined}
        aria-hidden={!transition.desiredOpen || undefined}
        aria-label="근거 인스펙터"
        data-overlay-phase={transition.phase}
        data-testid="evidence-inspector"
        inert={!transition.desiredOpen || undefined}
        tabIndex={-1}
      >
        <header>
          <div>
            <FileText aria-hidden="true" />
            <strong>근거 인스펙터</strong>
          </div>
          <IconButton
            type="button"
            motion="quiet"
            aria-label="인스펙터 닫기"
            data-initial-focus
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </IconButton>
        </header>
        {state === 'loading' && (
          <div className={styles.inspectorState}>
            <InspectorState
              kind="loading"
              title="근거와 출처를 불러오고 있습니다"
              description="선택한 변화에 묶인 기준 시점의 자료를 확인하는 중입니다."
            />
          </div>
        )}
        {state === 'error' && (
          <div className={styles.inspectorState}>
            <InspectorState
              kind="error"
              title="상세 근거를 불러오지 못했습니다"
              description="목록으로 돌아가 잠시 후 같은 변화를 다시 선택해 주세요."
            />
          </div>
        )}
        {state === 'ready' && detail && (
          <div className={styles.inspectorBody}>
            <span className={styles.market}>
              {marketLabel(detail.market)} · {categoryLabel(detail.category)}
            </span>
            <h2>{detail.title}</h2>
            <p className={styles.bodyText}>{presentResearchSummary(detail.body)}</p>
            <dl className={styles.evidenceMeta}>
              <div>
                <dt>근거 수준</dt>
                <dd>{confidenceLabel(detail.confidence)}</dd>
              </div>
              <div>
                <dt>연결 출처</dt>
                <dd>
                  {detail.sourceCoverage.linked}/{detail.sourceCoverage.total}
                </dd>
              </div>
              <div>
                <dt>관계 경로</dt>
                <dd>{relation?.edges.length ?? 0}</dd>
              </div>
              <div>
                <dt>분석 기준</dt>
                <dd>{formatDate(detail.meta.contentSnapshot.analysisCutoffAt, true)}</dd>
              </div>
              <div>
                <dt>시장 데이터</dt>
                <dd>
                  {detail.meta.marketSnapshot.marketDataAsOf
                    ? formatDate(detail.meta.marketSnapshot.marketDataAsOf, true)
                    : '시각 미확인'}
                </dd>
              </div>
              <div>
                <dt>분석 버전</dt>
                <dd>{detail.meta.contentSnapshot.analysisRevision}</dd>
              </div>
            </dl>
            <section>
              <h3>검증 근거</h3>
              {detail.evidence.length === 0 ? (
                <InspectorState
                  kind="empty"
                  title="연결된 근거가 없습니다"
                  description="이 기록에 묶인 근거가 확인되면 이곳에 표시됩니다."
                />
              ) : (
                detail.evidence.map((item) => (
                  <article key={item.evidenceId} className={styles.evidenceItem}>
                    <strong>{presentResearchSummary(item.claim)}</strong>
                    <span>
                      {confidenceLabel(item.quality)} · 출처 {item.sourceKeys.length}개
                    </span>
                  </article>
                ))
              )}
            </section>
            <section>
              <h3>출처</h3>
              {detail.sources.length === 0 ? (
                <InspectorState
                  kind="empty"
                  title="연결된 출처가 없습니다"
                  description="원문 출처가 확인되면 이름과 기준 시점 상태를 보여드립니다."
                />
              ) : (
                detail.sources.map((source) =>
                  source.url ? (
                    <TextLink
                      key={source.sourceKey}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      motion="quiet"
                    >
                      <span>{sourceAttributionLabel(source.attributionText)}</span>
                      <small>
                        {sourceBindingLabel(source.bindingState)} ·{' '}
                        {source.publishedAt ? formatDate(source.publishedAt) : '발행일 미확인'}
                      </small>
                    </TextLink>
                  ) : (
                    <div key={source.sourceKey} className={styles.sourceMissing}>
                      <span>{sourceAttributionLabel(source.attributionText)}</span>
                      <small>링크 없음</small>
                    </div>
                  ),
                )
              )}
            </section>
            {detail.limitations.length > 0 && (
              <section>
                <h3>한계</h3>
                <ul>
                  {detail.limitations.map((item) => (
                    <li key={item}>{presentResearchSummary(item)}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
