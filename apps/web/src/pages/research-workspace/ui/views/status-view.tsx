import {
  availabilityLabels,
  datasetLabel,
  domainLabels,
  formatDate,
  formatNumber,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';

import {
  AvailabilityNotice,
  DataTable,
  PageHeader,
  Panel,
  StatusSummary,
  WorkspaceState,
} from '@/shared/ui/workspace';

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
      <StatusSummary
        aria-label="데이터 상태 요약"
        items={[
          { label: '전체 상태', value: availabilityLabels[data.overall] },
          {
            label: '연결 출처',
            value: `${data.sourceCoverage.linked}/${data.sourceCoverage.total}`,
          },
          { label: '클릭 가능', value: data.sourceCoverage.clickable },
          { label: '그래프 근거', value: data.graphSourceCoverage.linked },
        ]}
      />
      <Panel>
        <div className={styles.tableWrap}>
          <DataTable caption="데이터 영역별 상태" className={styles.statusTable}>
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
          </DataTable>
        </div>
      </Panel>
    </>
  );
}
