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

const variantCopy: Record<EvidenceBandVariantId, { title: string; description: string }> = {
  'band-ledger': {
    title: 'A · Band Ledger',
    description: '패턴과 dashed edge를 가진 조건 구간을 먼저 읽습니다.',
  },
  'event-pulse': {
    title: 'B · Event Pulse',
    description: '사건 marker와 선택 crosshair를 중심으로 근거를 탐색합니다.',
  },
  'evidence-split': {
    title: 'C · Evidence Split',
    description: '차트와 근거 원장을 나란히 두고 한 선택 상태로 연결합니다.',
  },
};

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

function EvidenceList({
  evidence,
  selectedEvidenceId,
  sourceBars,
  visibleBarCount,
  onRangeSelectionChange,
  onSelectEvidence,
}: {
  evidence: readonly EvidenceRecord[];
  selectedEvidenceId?: string;
  sourceBars: readonly ChartBar[];
  visibleBarCount: number;
  onRangeSelectionChange: (selection: ChartRangeSelection) => void;
  onSelectEvidence: (id: string) => void;
}) {
  return (
    <div className={styles.evidenceList} data-slot="evidence-list">
      {evidence.map((item) => {
        const bar = sourceBars[item.barIndex];
        const selected = item.id === selectedEvidenceId;
        return (
          <button
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
            <span data-tone={item.tone}>{toneLabel(item.tone)}</span>
            <strong>{item.title}</strong>
            <small>
              {bar?.date.toLocaleDateString('ko-KR') ?? '날짜 없음'} · {item.sourceCount}개 출처
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
  const list = (
    <EvidenceList
      evidence={evidence}
      selectedEvidenceId={selectedEvidenceId}
      sourceBars={sourceBars}
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
          {showBands ? (
            <div className={styles.bandLabels} aria-label="표시 중인 조건 구간">
              {bands.map((band) => (
                <span data-slot="reference-band" key={band.id}>
                  {band.label}
                </span>
              ))}
            </div>
          ) : null}
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
        {list}
      </div>
    </ChartPreviewFrame>
  );
}
