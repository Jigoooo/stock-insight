import type { MouseEvent } from 'react';

import {
  buildReliabilityBriefingModel,
  reliabilityLevelLabels,
  type ReliabilityBriefingItem,
  type ReliabilityBriefingModel,
  type ReliabilitySurface,
} from '../../model/reliability-briefing';
import { formatDate, formatNumber } from '../workspace-presenters';
import styles from './status-view.module.css';

import { Button } from '@/shared/ui/button';
import { PageHeader, Panel, PanelHeader } from '@/shared/ui/workspace';
import type { SystemStatus } from '@stock-insight/contracts/research-workspace';

type ReliabilitySelectionHandler = (item: ReliabilityBriefingItem, opener: HTMLElement) => void;

export function StatusView({
  briefing,
  data,
  interactive,
  onOpenReliability,
  selectedSurface,
}: {
  briefing?: ReliabilityBriefingModel;
  data: SystemStatus;
  interactive: boolean;
  onOpenReliability: ReliabilitySelectionHandler;
  selectedSurface?: ReliabilitySurface;
}) {
  return (
    <>
      <PageHeader
        title="데이터 신뢰도"
        description="이 앱의 정보가 얼마나 최신인지, 근거가 어디까지 연결됐는지 보여줍니다."
        asOf={data.generatedAt}
      />
      <ReliabilityBriefingContent
        data={data}
        briefing={briefing ?? buildReliabilityBriefingModel(data)}
        interactive={interactive}
        onSelectSurface={onOpenReliability}
        selectedSurface={selectedSurface}
      />
    </>
  );
}

export function ReliabilityBriefingContent({
  briefing,
  data,
  interactive,
  onSelectSurface,
  selectedSurface,
}: {
  briefing: ReliabilityBriefingModel;
  data?: SystemStatus;
  interactive: boolean;
  onSelectSurface: ReliabilitySelectionHandler;
  selectedSurface?: ReliabilitySurface;
}) {
  return (
    <div className={styles.workspace}>
      <Panel aria-labelledby="reliability-overall-title" className={styles.overallPanel}>
        <div className={styles.overallHeader}>
          <span>
            <span className={styles.eyebrow}>전체 신뢰 상태</span>
            <strong id="reliability-overall-title">
              {reliabilityLevelLabels[briefing.summary.level]}
            </strong>
          </span>
        </div>
        <p>{briefing.summary.headline}</p>
        <span className={styles.generatedAt}>
          마지막 확인{' '}
          <time dateTime={briefing.summary.generatedAt}>
            {formatDate(briefing.summary.generatedAt, true)}
          </time>
        </span>
      </Panel>

      <div aria-label="기능별 데이터 신뢰도" className={styles.surfaceGrid}>
        {briefing.surfaces.map((item) => (
          <ReliabilitySurfaceCard
            interactive={interactive}
            item={item}
            key={item.surface}
            onSelectSurface={onSelectSurface}
            selected={selectedSurface === item.surface}
          />
        ))}
      </div>

      <Panel aria-labelledby="reliability-limitations-title">
        <PanelHeader>
          <h2 id="reliability-limitations-title">공통 제한 사항</h2>
          <p>특정 기능으로 단정할 수 없는 수집·확인 범위만 따로 안내합니다.</p>
        </PanelHeader>
        {briefing.summary.commonLimitations.length > 0 ? (
          <ul className={styles.commonLimitations}>
            {briefing.summary.commonLimitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.noLimitations}>현재 확인된 공통 제한이 없습니다.</p>
        )}
      </Panel>

      {data && <CoverageStatusPanel data={data} />}
    </div>
  );
}

function CoverageStatusPanel({ data }: { data: SystemStatus }) {
  const coverageTotal = data.coverage.reduce((sum, row) => sum + row.cells, 0);
  const coverageComplete = data.coverage.find((row) => row.state === 'complete')?.cells ?? 0;
  const coverageUnknown = data.coverage.find((row) => row.state === 'not_collected')?.cells ?? 0;

  return (
    <Panel aria-labelledby="reliability-coverage-title">
      <PanelHeader>
        <h2 id="reliability-coverage-title">수집 커버리지</h2>
        <p>
          자료가 <strong>없는 것</strong>과 아직 <strong>보지 않은 것</strong>을 구분합니다. 한 칸은
          수집기가 확인해야 할 기업·기간·보고서 조합 하나입니다.
        </p>
      </PanelHeader>
      {coverageTotal === 0 ? (
        <p className={styles.noLimitations}>
          수집 범위가 기록되면 확인한 칸과 아직 보지 않은 칸을 표시합니다.
        </p>
      ) : (
        <>
          <dl className={styles.coverageSummary}>
            <div>
              <dt>확인한 칸</dt>
              <dd>
                {formatNumber(coverageComplete)} / {formatNumber(coverageTotal)}
              </dd>
            </div>
            <div>
              <dt>아직 보지 않은 칸</dt>
              <dd>
                {coverageUnknown === 0
                  ? '없음'
                  : `${formatNumber(coverageUnknown)}개 — 자료가 없다는 뜻이 아니라 아직 확인하지 못했다는 뜻입니다`}
              </dd>
            </div>
          </dl>
          <div className={styles.coverageDetails}>
            <section aria-labelledby="coverage-state-title">
              <h3 id="coverage-state-title">상태별 수집 범위</h3>
              <ul className={styles.coverageList}>
                {data.coverage.map((row) => (
                  <li key={`${row.factFamily}:${row.state}`}>
                    <span>
                      <strong>{coverageStateLabels[row.state]}</strong>
                      <span>{row.factFamily}</span>
                    </span>
                    <span>{formatNumber(row.cells)}칸</span>
                  </li>
                ))}
              </ul>
            </section>
            {data.coverageGaps.length > 0 && (
              <section aria-labelledby="coverage-gap-title">
                <h3 id="coverage-gap-title">확인하지 못한 이유</h3>
                <ul className={styles.coverageList}>
                  {data.coverageGaps.map((gap) => (
                    <li key={`${gap.factFamily}:${gap.reason}`}>
                      <span>
                        <strong>{gap.factFamily}</strong>
                        <span>{gap.reason}</span>
                      </span>
                      <span>{formatNumber(gap.cells)}칸</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function ReliabilitySurfaceCard({
  interactive,
  item,
  onSelectSurface,
  selected,
}: {
  interactive: boolean;
  item: ReliabilityBriefingItem;
  onSelectSurface: ReliabilitySelectionHandler;
  selected: boolean;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onSelectSurface(item, event.currentTarget);
  };

  return (
    <Button
      data-surface={item.surface}
      aria-current={selected ? 'true' : 'false'}
      aria-label={`${item.title} 데이터 신뢰도 상세 보기`}
      className={styles.surfaceCard}
      data-testid="reliability-surface-card"
      disabled={!interactive}
      motion="quiet"
      onClick={handleClick}
      variant="ghost"
    >
      <span className={styles.cardLayout}>
        <span className={styles.cardHeader}>
          <span>
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
          </span>
          <ReliabilityLevelBadge level={item.level} />
        </span>
        <ReliabilityCardSection
          empty="현재 확인 가능한 정보가 없습니다."
          label="현재 확인 가능"
          values={item.availableNow}
        />
        <ReliabilityCardSection
          empty="현재 확인된 부족 정보가 없습니다."
          label="부족한 정보"
          values={item.limitations}
        />
        <ReliabilityCardSection
          empty="현재 추가 주의점이 없습니다."
          label="이용 시 주의점"
          values={item.cautions}
        />
      </span>
    </Button>
  );
}

function ReliabilityCardSection({
  empty,
  label,
  values,
}: {
  empty: string;
  label: string;
  values: string[];
}) {
  return (
    <span className={styles.cardSection}>
      <strong>{label}</strong>
      <span className={styles.cardValues}>
        {values.length > 0 ? (
          values.slice(0, 3).map((value) => <span key={value}>{value}</span>)
        ) : (
          <span>{empty}</span>
        )}
      </span>
    </span>
  );
}

function ReliabilityLevelBadge({ level }: { level: ReliabilityBriefingItem['level'] }) {
  return (
    <span className={styles.levelBadge} data-level={level}>
      {reliabilityLevelLabels[level]}
    </span>
  );
}

// The coverage ledger records epistemic state, not just row counts. In
// particular, not_collected means ignorance and must never be rendered as
// evidence that the source contains nothing.
const coverageStateLabels: Record<SystemStatus['coverage'][number]['state'], string> = {
  complete: '확인함',
  partial: '일부만 확인',
  not_collected: '아직 보지 않음',
  source_unavailable: '원천에 자료 없음',
  not_applicable: '해당 없음',
};
