import { AvailabilityNotice, PageHeader } from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { HistoryRows } from './history-view';

import type { MyResearchOverview } from '@stock-insight/contracts/research-workspace';

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
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>최근 판단</h2>
            <p>주문·투자 조언이 아닌 개인 리서치 기록입니다.</p>
          </div>
        </header>
        <HistoryRows items={data.recentHistory} />
      </section>
    </>
  );
}
