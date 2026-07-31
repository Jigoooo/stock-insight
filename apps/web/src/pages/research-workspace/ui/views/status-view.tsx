import ledgerStyles from '../feed-ledger.module.css';
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
  PanelHeader,
  PropertyList,
  StatusSummary,
  WorkspaceState,
} from '@/shared/ui/workspace';

import type { SystemStatus } from '@stock-insight/contracts/research-workspace';

export function StatusView({ data }: { data: SystemStatus }) {
  const availableDatasetCount = data.datasets.filter(
    (dataset) => dataset.availability === 'available',
  ).length;
  const unavailableDatasetCount = data.datasets.filter((dataset) =>
    ['error', 'missing', 'unsupported'].includes(dataset.availability),
  ).length;
  const limitedDatasetCount = data.datasets.filter((dataset) =>
    ['collecting', 'stale', 'text_only'].includes(dataset.availability),
  ).length;
  const latestWatermark = data.datasets.reduce<string | null>((latest, dataset) => {
    if (!dataset.watermarkAt) return latest;
    return latest === null || dataset.watermarkAt > latest ? dataset.watermarkAt : latest;
  }, null);

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
          {
            label: '연결 출처',
            value: `${data.sourceCoverage.linked}/${data.sourceCoverage.total}`,
          },
          { label: '클릭 가능 출처', value: data.sourceCoverage.clickable },
          {
            label: '그래프 근거',
            value: `${data.graphSourceCoverage.linked}/${data.graphSourceCoverage.total}`,
          },
          { label: '사용 가능 영역', value: `${availableDatasetCount}/${data.datasets.length}` },
        ]}
      />
      <Panel aria-labelledby="status-detail-title">
        <PanelHeader>
          <h2 id="status-detail-title">가용성과 제약</h2>
          <p>항목 수와 별개로 누락·미지원·갱신 필요 상태를 그대로 공개합니다.</p>
        </PanelHeader>
        <PropertyList
          className={ledgerStyles.statusProperties}
          aria-label="데이터 상태 세부 정보"
          items={[
            { label: '전체 가용성', value: availabilityLabels[data.overall] },
            {
              label: '최신 확인 시각',
              value: latestWatermark ? (
                <time dateTime={latestWatermark}>{formatDate(latestWatermark, true)}</time>
              ) : (
                '확인된 시각 없음'
              ),
            },
            {
              label: '출처 가용성',
              value:
                data.sourceCoverage.total === 0
                  ? '등록된 출처 없음'
                  : `${data.sourceCoverage.linked}개 연결 · ${data.sourceCoverage.clickable}개 원문 확인 가능`,
            },
            {
              label: '제약',
              value:
                unavailableDatasetCount + limitedDatasetCount === 0
                  ? '확인된 데이터 제약 없음'
                  : `${unavailableDatasetCount}개 사용 불가 · ${limitedDatasetCount}개 수집·갱신 제한`,
            },
          ]}
        />
        <div className={styles.tableWrap}>
          <DataTable caption="데이터 영역별 상태" className={styles.statusTable}>
            <thead>
              <tr>
                <th scope="col">데이터 영역</th>
                <th scope="col">상태</th>
                <th scope="col">항목 수</th>
                <th scope="col">최근 확인</th>
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
                  <td data-availability={dataset.availability}>
                    {availabilityLabels[dataset.availability]}
                  </td>
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
