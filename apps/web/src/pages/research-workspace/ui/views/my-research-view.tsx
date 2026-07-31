import personalizationStyles from '../personalization.module.css';
import { formatDate } from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { DecisionSupportContent } from './decision-support-content';
import { getDecisionSupportPresentation } from './decision-support-presentation';
import { HistoryRows } from './history-view';
import { PersonalizationWorkspacePanel } from './personalization-workspace-panel';
import type { PersonalizationResearchWorkspace } from '../../model/workspace-view-payload';

import {
  AvailabilityNotice,
  DetailSurface,
  PageHeader,
  Panel,
  PanelHeader,
  PropertyList,
  StructuredList,
} from '@/shared/ui/workspace';
import type { MyResearchOverview } from '@stock-insight/contracts/research-workspace';

function DecisionSupportPanel({ data }: { data: MyResearchOverview['decisionSupport'] }) {
  const packet = data.latestPacket;
  const presentation = getDecisionSupportPresentation(data);
  return (
    <DetailSurface aria-labelledby="decision-support-title">
      <PanelHeader meta={`${data.packetCount}개`}>
        <h2 id="decision-support-title">판단 지원</h2>
        <p>공통 근거와 개인 원장을 분리한 읽기 전용 분석 상태입니다.</p>
      </PanelHeader>
      <div className={personalizationStyles.decisionSupportBody}>
        <DecisionSupportContent data={data} className={personalizationStyles.decisionPrimary} />
        <PropertyList
          className={personalizationStyles.decisionMeta}
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
    </DetailSurface>
  );
}

export function MyResearchView({
  data,
  personalization,
}: {
  data: MyResearchOverview;
  personalization: PersonalizationResearchWorkspace;
}) {
  const recentEvidenceCount = data.recentHistory.reduce(
    (total, item) => total + item.evidenceCount,
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="개인 보관함"
        title="내 리서치"
        description="관심종목, 보유종목, 열린 판단과 검토 기한을 한곳에서 확인합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <Panel aria-labelledby="my-research-inputs-title">
        <PanelHeader>
          <h2 id="my-research-inputs-title">개인 리서치 입력</h2>
          <p>관심 목록과 개인 판단 기록의 범위만 요약하며 투자 행동을 제안하지 않습니다.</p>
        </PanelHeader>
        <div className={personalizationStyles.researchInputGrid}>
          <PropertyList
            aria-label="개인 리서치 입력"
            items={[
              { label: '관심종목', value: `${data.watchlistCount}개` },
              { label: '보유종목', value: `${data.holdingCount}개` },
              { label: '열린 판단', value: `${data.openHistoryCount}개` },
              { label: '검토 필요', value: `${data.reviewDueCount}개` },
            ]}
          />
          <StructuredList
            className={personalizationStyles.researchLedger}
            aria-label="관심종목과 판단 근거"
          >
            <li>
              <strong>관심종목 원장</strong>
              <span>{data.watchlistCount}개 항목이 개인화 입력에 반영됩니다.</span>
            </li>
            <li>
              <strong>최근 판단 근거</strong>
              <span>
                최근 {data.recentHistory.length}개 기록에 근거 {recentEvidenceCount}개가
                연결됐습니다.
              </span>
            </li>
          </StructuredList>
        </div>
      </Panel>
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
