import { AvailabilityNotice, formatDate, PageHeader } from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { DecisionSupportContent } from './decision-support-content';
import { getDecisionSupportPresentation } from './decision-support-presentation';
import { HistoryRows } from './history-view';

import type { MyResearchOverview } from '@stock-insight/contracts/research-workspace';

function DecisionSupportPanel({ data }: { data: MyResearchOverview['decisionSupport'] }) {
  const packet = data.latestPacket;
  const presentation = getDecisionSupportPresentation(data);
  return (
    <section className={styles.panel} aria-labelledby="decision-support-title">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="decision-support-title">판단 지원</h2>
          <p>공통 근거와 개인 원장을 분리한 읽기 전용 분석 상태입니다.</p>
        </div>
        <span>{data.packetCount}개</span>
      </header>
      <div className={styles.decisionSupportBody}>
        <DecisionSupportContent data={data} className={styles.decisionPrimary} />
        <dl className={styles.decisionMeta}>
          <div>
            <dt>공통 근거 기준</dt>
            <dd>
              {packet ? (
                <time dateTime={packet.commonViewAsOf}>
                  {formatDate(packet.commonViewAsOf, true)}
                </time>
              ) : (
                '없음'
              )}
            </dd>
          </div>
          <div>
            <dt>유효 기한</dt>
            <dd>
              {packet ? (
                <time dateTime={packet.expiresAt}>{formatDate(packet.expiresAt, true)}</time>
              ) : (
                '없음'
              )}
            </dd>
          </div>
          <div>
            <dt>실행 경계</dt>
            <dd>{presentation.executionBoundary}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function MyResearchView({ data }: { data: MyResearchOverview }) {
  return (
    <>
      <PageHeader
        eyebrow="개인 보관함"
        title="내 리서치"
        description="관심종목, 보유종목, 열린 판단과 검토 기한을 한곳에서 확인합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <section className={styles.metricStrip}>
        <div>
          <span>관심종목</span>
          <strong>{data.watchlistCount}</strong>
        </div>
        <div>
          <span>보유종목</span>
          <strong>{data.holdingCount}</strong>
        </div>
        <div>
          <span>열린 판단</span>
          <strong>{data.openHistoryCount}</strong>
        </div>
        <div>
          <span>검토 필요</span>
          <strong>{data.reviewDueCount}</strong>
        </div>
      </section>
      <div className={styles.researchSections}>
        <DecisionSupportPanel data={data.decisionSupport} />
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>최근 판단</h2>
              <p>주문·투자 조언이 아닌 개인 리서치 기록입니다.</p>
            </div>
          </header>
          <HistoryRows items={data.recentHistory} />
        </section>
      </div>
    </>
  );
}
