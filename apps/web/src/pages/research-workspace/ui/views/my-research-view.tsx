import { formatDate } from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { DecisionSupportContent } from './decision-support-content';
import { getDecisionSupportPresentation } from './decision-support-presentation';
import { HistoryRows } from './history-view';
import { PersonalizationWorkspacePanel } from './personalization-workspace-panel';
import type { PersonalizationResearchWorkspace } from '../../model/workspace-view-payload';

import {
  AvailabilityNotice,
  MetricStrip,
  PageHeader,
  Panel,
  PanelHeader,
  PropertyList,
} from '@/shared/ui/workspace';
import type { MyResearchOverview } from '@stock-insight/contracts/research-workspace';

function DecisionSupportPanel({ data }: { data: MyResearchOverview['decisionSupport'] }) {
  const packet = data.latestPacket;
  const presentation = getDecisionSupportPresentation(data);
  return (
    <Panel aria-labelledby="decision-support-title">
      <PanelHeader meta={`${data.packetCount}개`}>
        <h2 id="decision-support-title">판단 지원</h2>
        <p>공통 근거와 개인 원장을 분리한 읽기 전용 분석 상태입니다.</p>
      </PanelHeader>
      <div className={styles.decisionSupportBody}>
        <DecisionSupportContent data={data} className={styles.decisionPrimary} />
        <PropertyList
          className={styles.decisionMeta}
          items={[
            {
              label: '공통 근거 기준',
              value: packet ? (
                <time dateTime={packet.commonViewAsOf}>
                  {formatDate(packet.commonViewAsOf, true)}
                </time>
              ) : (
                '없음'
              ),
            },
            {
              label: '유효 기한',
              value: packet ? (
                <time dateTime={packet.expiresAt}>{formatDate(packet.expiresAt, true)}</time>
              ) : (
                '없음'
              ),
            },
            { label: '실행 경계', value: presentation.executionBoundary },
          ]}
        />
      </div>
    </Panel>
  );
}

export function MyResearchView({
  data,
  personalization,
}: {
  data: MyResearchOverview;
  personalization: PersonalizationResearchWorkspace;
}) {
  return (
    <>
      <PageHeader
        eyebrow="개인 보관함"
        title="내 리서치"
        description="관심종목, 보유종목, 열린 판단과 검토 기한을 한곳에서 확인합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <MetricStrip
        label="내 리서치 현황"
        items={[
          { label: '관심종목', value: data.watchlistCount },
          { label: '보유종목', value: data.holdingCount },
          { label: '열린 판단', value: data.openHistoryCount },
          { label: '검토 필요', value: data.reviewDueCount },
        ]}
      />
      <PersonalizationWorkspacePanel data={personalization} />
      <div className={styles.researchSections}>
        <DecisionSupportPanel data={data.decisionSupport} />
        <Panel>
          <PanelHeader>
            <h2>최근 판단</h2>
            <p>주문·투자 조언이 아닌 개인 리서치 기록입니다.</p>
          </PanelHeader>
          <HistoryRows items={data.recentHistory} />
        </Panel>
      </div>
    </>
  );
}
