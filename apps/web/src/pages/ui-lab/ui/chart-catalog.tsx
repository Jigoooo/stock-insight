import { useMemo, useState } from 'react';

import { CandleLedgerPreview } from './candle-ledger-preview';
import {
  chartPreviewStates,
  chartRoles,
  sliceBarsByRange,
  type ChartPreviewState,
  type ChartRange,
  type ChartRangeSelection,
  type ChartRoleId,
} from './chart-catalog-model';
import styles from './chart-catalog.module.css';
import { chartFixture } from './chart-fixtures';
import { EvidenceBandPreview } from './evidence-band-preview';
import { MarketTapePreview } from './market-tape-preview';

import { Checkbox } from '@/shared/ui/checkbox';
import {
  Tabs,
  TabsContent,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/tabs';
import { ToggleGroup } from '@/shared/ui/toggle-group';

const rangeItems = ['1M', '3M', '6M', '1Y'].map((value) => ({ label: value, value }));

function fullSelection(bars: ReturnType<typeof sliceBarsByRange>): ChartRangeSelection | null {
  const start = bars[0]?.date;
  const end = bars.at(-1)?.date;
  return start && end ? { start, end } : null;
}

export function ChartCatalog() {
  const [activeRole, setActiveRole] = useState<ChartRoleId>('market-tape');
  const [range, setRange] = useState<ChartRange>('3M');
  const [previewState, setPreviewState] = useState<ChartPreviewState>('ready');
  const [currency, setCurrency] = useState<'KRW' | 'USD'>(chartFixture.currency);
  const [showBands, setShowBands] = useState(true);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>();
  const initialBars = useMemo(() => sliceBarsByRange(chartFixture.bars, '3M'), []);
  const [rangeSelection, setRangeSelection] = useState<ChartRangeSelection | null>(() =>
    fullSelection(initialBars),
  );
  const visibleBars = sliceBarsByRange(chartFixture.bars, range);

  const changeRange = (value: string) => {
    const nextRange = value as ChartRange;
    const nextBars = sliceBarsByRange(chartFixture.bars, nextRange);
    setRange(nextRange);
    setRangeSelection(fullSelection(nextBars));
    setSelectedEvidenceId(undefined);
  };

  const role = chartRoles.find(({ id }) => id === activeRole)!;

  return (
    <section
      aria-labelledby="chart-catalog-title"
      className={styles.catalog}
      data-slot="chart-catalog"
    >
      <header className={styles.catalogHeader}>
        <div>
          <span>06 · Charts End-to-End</span>
          <h2 id="chart-catalog-title">차트 역할별 A/B/C 비교</h2>
        </div>
        <p>같은 결정론적 일봉을 공유하고, 한 번에 선택한 역할의 세 variant만 마운트합니다.</p>
      </header>

      <Tabs
        className={styles.roleTabs}
        value={activeRole}
        variant="sliding-underline"
        onValueChange={(value) => setActiveRole(value as ChartRoleId)}
      >
        <TabsHighlight>
          <TabsList aria-label="차트 역할" className={styles.roleTabList}>
            {chartRoles.map((item) => (
              <TabsHighlightItem key={item.id} value={item.id}>
                <TabsTrigger className={styles.roleTab} value={item.id}>
                  {item.label}
                </TabsTrigger>
              </TabsHighlightItem>
            ))}
          </TabsList>
        </TabsHighlight>
        {chartRoles.map((panelRole) => (
          <TabsContent
            className={styles.rolePanel}
            forceMount
            hidden={panelRole.id !== activeRole}
            key={panelRole.id}
            value={panelRole.id}
          >
            {panelRole.id === activeRole ? (
              <>
                <div className={styles.catalogToolbar} aria-label="차트 공통 제어">
                  <div className={styles.toolbarField}>
                    <span>기간</span>
                    <ToggleGroup
                      aria-label="표시 기간"
                      items={rangeItems}
                      value={range}
                      onValueChange={changeRange}
                    />
                  </div>
                  <label className={styles.toolbarField}>
                    <span>상태</span>
                    <select
                      aria-label="차트 상태"
                      value={previewState}
                      onChange={(event) => setPreviewState(event.target.value as ChartPreviewState)}
                    >
                      {chartPreviewStates.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.toolbarField}>
                    <span>통화</span>
                    <select
                      aria-label="표시 통화"
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value as 'KRW' | 'USD')}
                    >
                      <option value="KRW">KRW</option>
                      <option value="USD">USD</option>
                    </select>
                  </label>
                  <Checkbox
                    checked={showBands}
                    label="조건 구간 표시"
                    variant="inset"
                    onCheckedChange={(checked) => setShowBands(checked === true)}
                  />
                </div>

                <div className={styles.roleDescription}>
                  <span>{role.label}</span>
                  <p>{role.description}</p>
                </div>

                <div className={styles.variantStack} data-active-role={activeRole}>
                  {activeRole === 'market-tape'
                    ? (['quiet-trace', 'layered-range', 'signal-ledger'] as const).map(
                        (variantId) => (
                          <MarketTapePreview
                            bars={visibleBars}
                            currency={currency}
                            key={variantId}
                            range={range}
                            rangeSelection={rangeSelection}
                            state={previewState}
                            variantId={variantId}
                            onRangeSelectionChange={setRangeSelection}
                            onRetry={() => setPreviewState('ready')}
                          />
                        ),
                      )
                    : null}
                  {activeRole === 'evidence-band'
                    ? (['band-ledger', 'event-pulse', 'evidence-split'] as const).map(
                        (variantId) => (
                          <EvidenceBandPreview
                            bands={chartFixture.bands}
                            currency={currency}
                            evidence={chartFixture.evidence}
                            key={variantId}
                            rangeSelection={rangeSelection}
                            selectedEvidenceId={selectedEvidenceId}
                            showBands={showBands}
                            sourceBars={chartFixture.bars}
                            state={previewState}
                            variantId={variantId}
                            onRangeSelectionChange={setRangeSelection}
                            onRetry={() => setPreviewState('ready')}
                            onSelectEvidence={setSelectedEvidenceId}
                          />
                        ),
                      )
                    : null}
                  {activeRole === 'candle-ledger'
                    ? (['clean-candle', 'dual-pane', 'market-ledger'] as const).map((variantId) => (
                        <CandleLedgerPreview
                          bars={visibleBars}
                          currency={currency}
                          key={variantId}
                          state={previewState}
                          variantId={variantId}
                          onRetry={() => setPreviewState('ready')}
                        />
                      ))
                    : null}
                </div>
              </>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
