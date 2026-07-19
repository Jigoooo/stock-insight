import {
  AvailabilityNotice,
  PageHeader,
  WorkspaceState,
  analysisStatusLabel,
  availabilityLabels,
  formatDate,
  formatNumber,
  marketLabel,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';

import type { StockListResponse } from '@stock-insight/contracts';

export function StocksView({
  data,
  pending,
  stocks,
}: {
  data: StockListResponse;
  pending: boolean;
  stocks: StockListResponse['data'];
}) {
  return (
    <>
      <PageHeader
        eyebrow="종목 리서치"
        title="종목"
        description="관심·보유 여부와 분석 준비 상태를 한 표에서 확인합니다."
        asOf={data.meta.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <section
        className={styles.panel}
        data-pending={pending || undefined}
        aria-busy={pending || undefined}
      >
        <header className={styles.panelHeader}>
          <div>
            <h2>종목 커버리지</h2>
            <p aria-live="polite">
              {pending
                ? '검색 결과를 갱신하고 있습니다'
                : `${stocks.length}개 표시 · ${availabilityLabels[data.availability]}`}
            </p>
          </div>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.stockTable}>
            <thead>
              <tr>
                <th>종목</th>
                <th>시장</th>
                <th>현재 상태</th>
                <th>최근 가격</th>
                <th>변화율</th>
                <th>분석 시각</th>
              </tr>
            </thead>
            <tbody>
              {!pending && stocks.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <WorkspaceState
                      kind="empty"
                      title="조건에 맞는 종목이 없습니다"
                      description="검색어를 지우거나 다른 종목 이름과 티커를 입력해 보세요."
                    />
                  </td>
                </tr>
              )}
              {stocks.map((stock) => (
                <tr
                  key={stock.entityKey}
                  className={stocks.length > 100 ? styles.deferredTableRow : undefined}
                >
                  <td aria-label={`${stock.displayName} ${stock.ticker}`}>
                    <span>
                      <strong>{stock.displayName}</strong>
                      <small>{stock.ticker}</small>
                    </span>
                  </td>
                  <td>{marketLabel(stock.market)}</td>
                  <td>
                    {stock.isHolding
                      ? '보유종목'
                      : stock.isWatched
                        ? '관심종목'
                        : analysisStatusLabel(stock.analysisStatus)}
                  </td>
                  <td>
                    {stock.latestPrice === undefined
                      ? '—'
                      : `${formatNumber(stock.latestPrice)} ${
                          stock.currency === 'KRW' ? '원' : stock.currency === 'USD' ? '달러' : ''
                        }`}
                  </td>
                  <td className={(stock.changePct ?? 0) < 0 ? styles.negative : styles.positive}>
                    {stock.changePct === undefined ? '—' : `${stock.changePct.toFixed(2)}%`}
                  </td>
                  <td>{formatDate(stock.lastAnalyzedAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
