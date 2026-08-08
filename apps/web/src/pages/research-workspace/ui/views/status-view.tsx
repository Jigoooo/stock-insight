import type { MouseEvent } from 'react';

import {
  buildReliabilityBriefingModel,
  reliabilityLevelLabels,
  type ReliabilityBriefingItem,
  type ReliabilityBriefingModel,
  type ReliabilitySurface,
} from '../../model/reliability-briefing';
import { formatDate } from '../workspace-presenters';
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
  interactive,
  onSelectSurface,
  selectedSurface,
}: {
  briefing: ReliabilityBriefingModel;
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
    </div>
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
