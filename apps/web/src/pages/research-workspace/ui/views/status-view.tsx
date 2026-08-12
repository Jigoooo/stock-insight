import type { MouseEvent } from 'react';

import { describeCoverageDetail } from '../../model/coverage-detail';
import {
  buildReliabilityBriefingModel,
  reliabilityLevelLabels,
  type ReliabilityBriefingItem,
  type ReliabilityBriefingModel,
  type ReliabilitySurface,
} from '../../model/reliability-briefing';
import { formatDate } from '../workspace-presenters';
import styles from './status-view.module.css';

import { DepthGate, detailDepthFor } from '@/shared/depth';
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
      <CoverageDetailPanel data={data} />
    </>
  );
}

/**
 * IA §4 행 11 의 **두 번째 화면**. `stock-detail(요약) · status(전체)` 에서 전체 쪽이다.
 *
 * 위 요약은 게이트 **밖**에 그대로 둔다. 요약까지 접으면 초보 모드에서 이 화면이
 * 자기 상태를 말하지 않게 되고, 그것은 배치가 아니라 삭제다.
 *
 * 여기 실리는 것은 새 정보가 아니라 카드가 `slice(0, 3)` 으로 버린 것이다 —
 * 화면별 제한·주의 전체, 커버리지 갭의 사유와 칸 수, 데이터셋별 확인 시각.
 */
function CoverageDetailPanel({ data }: { data: SystemStatus }) {
  const detail = describeCoverageDetail(data);
  const briefing = buildReliabilityBriefingModel(data);

  return (
    <DepthGate
      at={detailDepthFor('coverage_freshness_uncertainty')}
      label="자료 범위와 신선도 전체 보기"
    >
      <Panel aria-labelledby="coverage-detail-title" className={styles.detailPanel}>
        <PanelHeader>
          <strong id="coverage-detail-title">자료 범위 상세</strong>
          <p>위 카드가 요약하며 줄인 목록의 전부입니다.</p>
        </PanelHeader>

        {briefing.surfaces.map((surface) => (
          <section key={surface.surface}>
            <h3>{surface.title}</h3>
            <CoverageDetailList label="현재 확인 가능" values={surface.availableNow} />
            <CoverageDetailList label="부족한 정보" values={surface.limitations} />
            <CoverageDetailList label="이용 시 주의점" values={surface.cautions} />
          </section>
        ))}

        <section>
          <h3>확인하지 못한 칸과 그 이유</h3>
          {detail.gapRows.length > 0 ? (
            <dl>
              {detail.gapRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>확인하지 못한 칸이 없습니다.</p>
          )}
          {detail.unlabelledGapCells > 0 ? (
            <p>
              {detail.unlabelledGapCells.toLocaleString('ko-KR')}칸은 아직 사유를 한국어로 옮기지
              못해 이유를 적지 못했습니다.
            </p>
          ) : null}
        </section>

        <section>
          <h3>자료 계열별 확인 상태</h3>
          {detail.stateRows.length > 0 ? (
            <dl>
              {detail.stateRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>기록된 계열이 없습니다.</p>
          )}
        </section>

        <section>
          <h3>데이터셋별 최근 확인 시각</h3>
          <p>
            {data.datasets.length}개 중 {detail.staleDatasetCount}개가 최신 상태가 아닙니다.
          </p>
          {detail.unlabelledDatasetCount > 0 ? (
            // 지연된 것의 부분집합이 아니다 — 겹칠 수도, 안 겹칠 수도 있다.
            // 두 수를 한 문장에 엮으면 화면이 세지 않은 관계를 주장한다.
            <p>
              또한 전체 {data.datasets.length}개 가운데 {detail.unlabelledDatasetCount}개는 아직
              이름을 한국어로 옮기지 못해 아래 목록에 넣지 않았습니다. 최신 여부와는 별개입니다.
            </p>
          ) : null}
          <dl>
            {detail.datasetRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Panel>
    </DepthGate>
  );
}

function CoverageDetailList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className={styles.detailList}>
      <strong>{label}</strong>
      {values.length > 0 ? (
        <ul>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p>해당 항목이 없습니다.</p>
      )}
    </div>
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
