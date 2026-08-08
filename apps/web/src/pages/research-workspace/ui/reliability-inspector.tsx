import { ShieldCheck } from 'lucide-react';

import { DetailInspectorFrame, type DetailInspectorPresentation } from './detail-inspector-frame';
import styles from './reliability-inspector.module.css';
import { availabilityLabels, formatDate } from './workspace-presenters';

import { reliabilityInspectorWidthStorageKey } from '@/pages/research-workspace/model/detail-inspector-layout';
import {
  reliabilityLevelLabels,
  type ReliabilityBriefingItem,
} from '@/pages/research-workspace/model/reliability-briefing';
import { StructuredList } from '@/shared/ui/workspace';

function EvidenceSection({ item }: { item: ReliabilityBriefingItem }) {
  return (
    <section aria-labelledby="reliability-inspector-evidence">
      <h3 id="reliability-inspector-evidence">최근 확인된 데이터</h3>
      {item.evidence.length > 0 ? (
        <StructuredList className={styles.evidenceList}>
          {item.evidence.map((evidence) => (
            <li key={evidence.id}>
              <span>
                <strong>{evidence.label}</strong>
                <span>{availabilityLabels[evidence.availability]}</span>
              </span>
              <span>
                {evidence.checkedAt
                  ? `최근 확인 ${formatDate(evidence.checkedAt, true)}`
                  : '확인 시각 없음'}
              </span>
            </li>
          ))}
        </StructuredList>
      ) : (
        <p>현재 확인된 데이터 상태 근거가 없습니다.</p>
      )}
    </section>
  );
}

function TraceabilitySection({ item }: { item: ReliabilityBriefingItem }) {
  if (!item.sourceTraceability) return null;
  return (
    <section aria-labelledby="reliability-inspector-traceability">
      <h3 id="reliability-inspector-traceability">출처 근거 수준</h3>
      <dl className={styles.traceability}>
        <div>
          <dt>전체</dt>
          <dd>{item.sourceTraceability.total}건</dd>
        </div>
        <div>
          <dt>연결</dt>
          <dd>{item.sourceTraceability.linked}건</dd>
        </div>
        <div>
          <dt>원문 확인 가능</dt>
          <dd>{item.sourceTraceability.clickable}건</dd>
        </div>
      </dl>
    </section>
  );
}

function TextListSection({
  empty,
  id,
  title,
  values,
}: {
  empty: string;
  id: string;
  title: string;
  values: string[];
}) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {values.length > 0 ? (
        <StructuredList className={styles.textList}>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </StructuredList>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function AvailableEvidence({ item }: { item: ReliabilityBriefingItem }) {
  return (
    <div className={styles.comparisonColumn}>
      <h2>확인 가능한 근거</h2>
      <EvidenceSection item={item} />
      <TraceabilitySection item={item} />
    </div>
  );
}

function LimitationsAndImpact({ item }: { item: ReliabilityBriefingItem }) {
  return (
    <div className={styles.comparisonColumn}>
      <h2>제한과 영향</h2>
      <TextListSection
        empty="현재 확인된 부족 범위가 없습니다."
        id="reliability-inspector-limitations"
        title="부족한 범위"
        values={item.limitations}
      />
      <TextListSection
        empty="현재 추가 주의점이 없습니다."
        id="reliability-inspector-cautions"
        title="이용 시 주의점"
        values={item.cautions}
      />
    </div>
  );
}

export function ReliabilityInspectorContent({
  item,
  presentation,
}: {
  item: ReliabilityBriefingItem;
  presentation: DetailInspectorPresentation;
}) {
  return (
    <div className={styles.content} data-presentation={presentation}>
      <section className={styles.summary} aria-labelledby="reliability-inspector-summary">
        <h2 id="reliability-inspector-summary">상태 요약</h2>
        <strong data-level={item.level}>{reliabilityLevelLabels[item.level]}</strong>
        <p>{item.summary}</p>
      </section>
      {presentation === 'modal' ? (
        <div className={styles.comparisonGrid}>
          <AvailableEvidence item={item} />
          <LimitationsAndImpact item={item} />
        </div>
      ) : (
        <>
          <EvidenceSection item={item} />
          <TraceabilitySection item={item} />
          <TextListSection
            empty="현재 확인된 부족 범위가 없습니다."
            id="reliability-inspector-limitations"
            title="부족한 범위"
            values={item.limitations}
          />
          <TextListSection
            empty="현재 추가 주의점이 없습니다."
            id="reliability-inspector-cautions"
            title="이용 시 주의점"
            values={item.cautions}
          />
        </>
      )}
    </div>
  );
}

export function ReliabilityInspector({
  item,
  mobile,
  onClose,
  open,
}: {
  item: ReliabilityBriefingItem | null;
  mobile: boolean;
  onClose: () => void;
  open: boolean;
}) {
  return (
    <DetailInspectorFrame
      bodyClassName={styles.inspectorBody}
      closeLabel="데이터 신뢰도 상세 닫기"
      description="선택한 기능에서 현재 확인 가능한 근거와 이용 시 제한"
      detailKey={item?.surface ?? null}
      mobile={mobile}
      onClose={onClose}
      open={open}
      resizerLabel="데이터 신뢰도 상세 너비 조절"
      storageKey={reliabilityInspectorWidthStorageKey}
      testId="reliability-inspector"
      title={item ? `${item.title} 데이터 신뢰도` : '데이터 신뢰도 상세'}
      titleIcon={<ShieldCheck aria-hidden="true" />}
    >
      {(presentation) =>
        item ? <ReliabilityInspectorContent item={item} presentation={presentation} /> : null
      }
    </DetailInspectorFrame>
  );
}
