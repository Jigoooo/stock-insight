import {
  AvailabilityNotice,
  PageHeader,
  WorkspaceState,
  availabilityLabels,
  datasetLabel,
  domainLabels,
  formatDate,
  formatNumber,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';

import type { SystemStatus } from '@stock-insight/contracts/research-workspace';

export function StatusView({ data }: { data: SystemStatus }) {
  return (
    <>
      <PageHeader
        eyebrow="데이터 운영"
        title="데이터 상태"
        description="데이터가 언제까지 확인됐는지와 출처 연결 수준을 공개합니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.overall} />
      <section className={styles.metricStrip}>
        <div>
          <span>전체 상태</span>
          <strong>{availabilityLabels[data.overall]}</strong>
        </div>
        <div>
          <span>연결 출처</span>
          <strong>
            {data.sourceCoverage.linked}/{data.sourceCoverage.total}
          </strong>
        </div>
        <div>
          <span>클릭 가능</span>
          <strong>{data.sourceCoverage.clickable}</strong>
        </div>
        <div>
          <span>그래프 근거</span>
          <strong>{data.graphSourceCoverage.linked}</strong>
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.statusTable}>
            <thead>
              <tr>
                <th>데이터 영역</th>
                <th>상태</th>
                <th>항목 수</th>
                <th>최근 확인</th>
              </tr>
            </thead>
            <tbody>
              {data.datasets.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <WorkspaceState
                      kind="empty"
                      title="확인할 데이터 영역이 없습니다"
                      description="연결된 데이터가 준비되면 영역별 상태를 이곳에 표시합니다."
                    />
                  </td>
                </tr>
              )}
              {data.datasets.map((dataset) => (
                <tr key={[dataset.domain, dataset.datasetName].join(':')}>
                  <td>
                    <strong>{datasetLabel(dataset.domain, dataset.datasetName)}</strong>
                    <small>{domainLabels[dataset.domain] ?? '기타 영역'}</small>
                  </td>
                  <td>{availabilityLabels[dataset.availability]}</td>
                  <td>{dataset.rowCount === null ? '—' : formatNumber(dataset.rowCount)}</td>
                  <td>{formatDate(dataset.watermarkAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
