import { useReducedMotion } from 'motion/react';

import {
  filterBarsBySelection,
  findEvidenceVisibleDomain,
  type ChartBar,
  type ChartPreviewState,
  type ChartRangeSelection,
  type EvidenceBandVariantId,
  type EvidenceRecord,
  type ReferenceBand,
} from './chart-catalog-model';
import styles from './chart-catalog.module.css';
import { ChartPreviewFrame, type ChartSummary } from './chart-preview-frame';

import { BklitEvidenceBandRenderer } from '@/shared/ui/chart/internal/bklit-preview';

export type EvidenceBandPreviewProps = {
  bands: readonly ReferenceBand[];
  currency: 'KRW' | 'USD';
  evidence: readonly EvidenceRecord[];
  rangeSelection: ChartRangeSelection | null;
  selectedEvidenceId?: string;
  showBands: boolean;
  sourceBars: readonly ChartBar[];
  state: ChartPreviewState;
  variantId: EvidenceBandVariantId;
  onRangeSelectionChange: (selection: ChartRangeSelection | null) => void;
  onRetry: () => void;
  onSelectEvidence: (id: string) => void;
};

const variantCopy = {
  'band-ledger': {
    title: 'A · Range Ledger',
    description: '조건 구간의 시작과 끝, 가격 경로의 통과 방식을 먼저 읽습니다.',
  },
  'event-pulse': {
    title: 'B · Event Pulse',
    description: '사건 시점과 당시 가격을 marker와 guide로 연결해 탐색합니다.',
  },
  'evidence-split': {
    title: 'C · Linked Evidence',
    description: '차트와 근거 원장을 한 선택 상태로 연결해 함께 분석합니다.',
  },
} satisfies Record<EvidenceBandVariantId, { title: string; description: string }>;

function formatPrice(currency: 'KRW' | 'USD', value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function createSummary(bars: readonly ChartBar[], currency: 'KRW' | 'USD'): ChartSummary {
  const first = bars[0];
  const last = bars.at(-1);
  if (!(first && last)) {
    return { latest: '—', change: '—', high: '—', low: '—', asOf: '—' };
  }
  const change = ((last.close - first.close) / first.close) * 100;
  return {
    latest: formatPrice(currency, last.close),
    change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    high: formatPrice(currency, Math.max(...bars.map(({ high }) => high))),
    low: formatPrice(currency, Math.min(...bars.map(({ low }) => low))),
    asOf: last.date.toLocaleDateString('ko-KR'),
  };
}

function toneLabel(tone: EvidenceRecord['tone']) {
  if (tone === 'positive') return '긍정 근거';
  if (tone === 'risk') return '확인할 리스크';
  return '중립 근거';
}

function isBarInSelection(bar: ChartBar, selection: ChartRangeSelection | null) {
  if (!selection) return true;
  const start = Math.min(selection.start.getTime(), selection.end.getTime());
  const end = Math.max(selection.start.getTime(), selection.end.getTime());
  const timestamp = bar.date.getTime();
  return timestamp >= start && timestamp <= end;
}

function EvidenceContextLegend({ bands }: { bands: readonly ReferenceBand[] }) {
  return (
    <div
      aria-label="표시 중인 조건 구간"
      className={styles.evidenceContextLegend}
      data-slot="evidence-context-legend"
    >
      {bands.map((band, index) => (
        <span
          data-band-tone={index === 0 ? 'copper' : 'risk'}
          data-slot="reference-band"
          key={band.id}
        >
          <i aria-hidden="true" />
          {band.label}
        </span>
      ))}
    </div>
  );
}

function EvidenceList({
  evidence,
  rangeSelection,
  selectedEvidenceId,
  sourceBars,
  variantId,
  visibleBarCount,
  onRangeSelectionChange,
  onSelectEvidence,
}: {
  evidence: readonly EvidenceRecord[];
  rangeSelection: ChartRangeSelection | null;
  selectedEvidenceId?: string;
  sourceBars: readonly ChartBar[];
  variantId: EvidenceBandVariantId;
  visibleBarCount: number;
  onRangeSelectionChange: (selection: ChartRangeSelection) => void;
  onSelectEvidence: (id: string) => void;
}) {
  return (
    <div className={styles.evidenceList} data-slot="evidence-list" data-variant={variantId}>
      {evidence.map((item) => {
        const bar = sourceBars[item.barIndex];
        const selected = item.id === selectedEvidenceId;
        const outsideRange = Boolean(selected && bar && !isBarInSelection(bar, rangeSelection));
        return (
          <button
            aria-current={selected ? 'true' : undefined}
            aria-pressed={selected}
            className={styles.evidenceRow}
            data-evidence-id={item.id}
            data-selected={selected || undefined}
            data-slot="evidence-row"
            key={item.id}
            type="button"
            onClick={() => {
              onSelectEvidence(item.id);
              onRangeSelectionChange(findEvidenceVisibleDomain(item, sourceBars, visibleBarCount));
            }}
          >
            <span className={styles.evidenceRowMeta}>
              <time dateTime={bar?.ts}>{bar?.date.toLocaleDateString('ko-KR') ?? '날짜 없음'}</time>
              <span data-tone={item.tone}>{toneLabel(item.tone)}</span>
            </span>
            <strong>{item.title}</strong>
            <small>
              {item.sourceCount}개 출처
              {outsideRange ? ' · 선택 시점이 현재 범위 밖' : null}
            </small>
          </button>
        );
      })}
    </div>
  );
}

export function EvidenceBandPreview({
  bands,
  currency,
  evidence,
  rangeSelection,
  selectedEvidenceId,
  showBands,
  sourceBars,
  state,
  variantId,
  onRangeSelectionChange,
  onRetry,
  onSelectEvidence,
}: EvidenceBandPreviewProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const visibleBars = filterBarsBySelection(sourceBars, rangeSelection);
  const copy = variantCopy[variantId];
  const summary = createSummary(visibleBars, currency);
  const rendererEvidence = evidence.map((item) => ({
    ...item,
    date: sourceBars[item.barIndex]!.date,
  }));
  const rendererBands = bands.map((band) => ({
    ...band,
    start: sourceBars[band.startIndex]!.date,
    end: sourceBars[band.endIndex]!.date,
  }));
  const selectedEvidence = evidence.find((item) => item.id === selectedEvidenceId);
  const selectedBar = selectedEvidence ? sourceBars[selectedEvidence.barIndex] : undefined;
  const list = (
    <EvidenceList
      evidence={evidence}
      rangeSelection={rangeSelection}
      selectedEvidenceId={selectedEvidenceId}
      sourceBars={sourceBars}
      variantId={variantId}
      visibleBarCount={Math.max(1, visibleBars.length)}
      onRangeSelectionChange={onRangeSelectionChange}
      onSelectEvidence={onSelectEvidence}
    />
  );

  return (
    <ChartPreviewFrame
      bars={visibleBars}
      currency={currency}
      description={copy.description}
      limitation={
        state === 'partial' ? '일부 거래량과 근거 구간이 아직 구조화되지 않았습니다.' : undefined
      }
      state={state}
      summary={summary}
      title={copy.title}
      variantId={variantId}
      onRetry={onRetry}
    >
      <div className={styles.evidencePreview} data-slot="evidence-band-preview">
        <div className={styles.evidenceChartColumn}>
          {showBands ? <EvidenceContextLegend bands={bands} /> : null}
          <BklitEvidenceBandRenderer
            bands={rendererBands}
            bars={sourceBars}
            currency={currency}
            evidence={rendererEvidence}
            rangeSelection={rangeSelection}
            reducedMotion={reducedMotion}
            selectedEvidenceId={selectedEvidenceId}
            showBands={showBands}
            tone={variantId}
            onRangeSelectionChange={onRangeSelectionChange}
            onSelectEvidence={onSelectEvidence}
          />
        </div>
        <div className={styles.evidencePanel} data-slot="evidence-panel">
          {variantId === 'evidence-split' && selectedEvidence && selectedBar ? (
            <aside className={styles.selectedEvidenceSummary} data-slot="evidence-selected-summary">
              <span data-tone={selectedEvidence.tone}>{toneLabel(selectedEvidence.tone)}</span>
              <strong>{selectedEvidence.title}</strong>
              <small>
                {selectedBar.date.toLocaleDateString('ko-KR')} ·{' '}
                {formatPrice(currency, selectedBar.close)} · {selectedEvidence.sourceCount}개 출처
              </small>
            </aside>
          ) : null}
          {list}
        </div>
      </div>
    </ChartPreviewFrame>
  );
}
