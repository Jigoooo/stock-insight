import { FileText } from 'lucide-react';

import styles from './relation-detail.module.css';

import {
  presentResearchSummary,
  sourceAttributionLabel,
} from '@/pages/research-workspace/model/presentation';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { TextLink } from '@/shared/ui/link';
import { PropertyList, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type {
  EntityRelationGraph,
  ResearchRecordDetail,
} from '@stock-insight/contracts/research-workspace';

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
  return (
    <Dialog
      modal={modal}
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className={styles.inspector}
        closeLabel="인스펙터 닫기"
        composition="detail"
        data-testid="evidence-inspector"
        portalled={modal}
        presentation="inspector"
        showOverlay={modal}
        size="lg"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          if (!modal) event.preventDefault();
        }}
      >
        <DialogHeader className={styles.inspectorHeader}>
          <DialogTitle asChild>
            <strong className={styles.inspectorTitle}>
              <FileText aria-hidden="true" />
              <span>근거 인스펙터</span>
            </strong>
          </DialogTitle>
          <DialogDescription className={styles.inspectorDescription}>
            선택한 변화의 검증 근거와 출처
          </DialogDescription>
        </DialogHeader>
        <DialogBody className={styles.inspectorContent}>
          {state === 'loading' && (
            <div className={styles.inspectorState}>
              <WorkspaceState
                kind="loading"
                title="근거와 출처를 불러오고 있습니다"
                description="선택한 변화에 묶인 기준 시점의 자료를 확인하는 중입니다."
              />
            </div>
          )}
          {state === 'error' && (
            <div className={styles.inspectorState}>
              <WorkspaceState
                kind="error"
                title="상세 근거를 불러오지 못했습니다"
                description="목록으로 돌아가 잠시 후 같은 변화를 다시 선택해 주세요."
              />
            </div>
          )}
          {state === 'ready' && detail && (
            <div className={styles.inspectorBody}>
              <span className={styles.evidenceMarket}>
                {marketLabel(detail.market)} · {categoryLabel(detail.category)}
              </span>
              <h2>{detail.title}</h2>
              <p className={styles.bodyText}>{presentResearchSummary(detail.body)}</p>
              <PropertyList
                className={styles.evidenceMeta}
                items={[
                  { label: '근거 수준', value: confidenceLabel(detail.confidence) },
                  {
                    label: '연결 출처',
                    value: `${detail.sourceCoverage.linked}/${detail.sourceCoverage.total}`,
                  },
                  { label: '관계 경로', value: relation?.edges.length ?? 0 },
                  {
                    label: '분석 기준',
                    value: formatDate(detail.meta.contentSnapshot.analysisCutoffAt, true),
                  },
                  {
                    label: '시장 데이터',
                    value: detail.meta.marketSnapshot.marketDataAsOf
                      ? formatDate(detail.meta.marketSnapshot.marketDataAsOf, true)
                      : '시각 미확인',
                  },
                  { label: '분석 버전', value: detail.meta.contentSnapshot.analysisRevision },
                ]}
              />
              <section>
                <h3>검증 근거</h3>
                {detail.evidence.length === 0 ? (
                  <WorkspaceState
                    kind="empty"
                    title="연결된 근거가 없습니다"
                    description="이 기록에 묶인 근거가 확인되면 이곳에 표시됩니다."
                  />
                ) : (
                  <StructuredList className={styles.evidenceList} aria-label="검증 근거 목록">
                    {detail.evidence.map((item) => (
                      <li key={item.evidenceId} className={styles.evidenceItem}>
                        <strong>{presentResearchSummary(item.claim)}</strong>
                        <span>
                          {confidenceLabel(item.quality)} · 출처 {item.sourceKeys.length}개
                        </span>
                      </li>
                    ))}
                  </StructuredList>
                )}
              </section>
              <section>
                <h3>출처</h3>
                {detail.sources.length === 0 ? (
                  <WorkspaceState
                    kind="empty"
                    title="연결된 출처가 없습니다"
                    description="원문 출처가 확인되면 이름과 기준 시점 상태를 보여드립니다."
                  />
                ) : (
                  <StructuredList className={styles.sourceList} aria-label="출처 목록">
                    {detail.sources.map((source) => (
                      <li key={source.sourceKey}>
                        {source.url ? (
                          <TextLink
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            motion="quiet"
                          >
                            <span>{sourceAttributionLabel(source.attributionText)}</span>
                            <small>
                              {sourceBindingLabel(source.bindingState)} ·{' '}
                              {source.publishedAt
                                ? formatDate(source.publishedAt)
                                : '발행일 미확인'}
                            </small>
                          </TextLink>
                        ) : (
                          <div className={styles.sourceMissing}>
                            <span>{sourceAttributionLabel(source.attributionText)}</span>
                            <small>링크 없음</small>
                          </div>
                        )}
                      </li>
                    ))}
                  </StructuredList>
                )}
              </section>
              {detail.limitations.length > 0 && (
                <section>
                  <h3>한계</h3>
                  <StructuredList>
                    {detail.limitations.map((item) => (
                      <li key={item}>{presentResearchSummary(item)}</li>
                    ))}
                  </StructuredList>
                </section>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
