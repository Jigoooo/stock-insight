import { ExternalLink, Newspaper } from 'lucide-react';

import { DetailInspectorFrame } from './detail-inspector-frame';
import { RelationSigmaGraph } from './relation-sigma-graph';
import styles from './stock-briefing-inspector.module.css';
import { formatDate, formatNumber, marketLabel } from './workspace-presenters';
import {
  stockBriefingEvidenceLevelLabel,
  stockBriefingStatusLabel,
  type StockBriefingDetail,
} from '../model/stock-briefing';

import {
  filterSourceBackedCompanyMetricGroups,
  formatCompanyMetricValue,
  getCompanyMetricGroupTitle,
  getCompanyMetricSourceSummary,
} from '@/entities/stock/model/format-company-metrics';
import { stockInspectorWidthStorageKey } from '@/pages/research-workspace/model/detail-inspector-layout';
import { presentResearchSummary } from '@/pages/research-workspace/model/presentation';
import { Button } from '@/shared/ui/button';
import { TextLink } from '@/shared/ui/link';
import { PropertyList, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

export type StockBriefingInspectorState = 'error' | 'loading' | 'ready';

function priceLabel(detail: StockBriefingDetail) {
  const { currency, latestPrice } = detail.stock;
  if (latestPrice === undefined) return '가격 정보 없음';
  const unit = currency === 'KRW' ? '원' : currency === 'USD' ? '달러' : currency;
  return `${formatNumber(latestPrice)}${unit ? ` ${unit}` : ''}`;
}

function LocalFailure({ description, title }: { description: string; title: string }) {
  return (
    <WorkspaceState
      className={styles.localFailure}
      kind="unavailable"
      title={title}
      description={description}
    />
  );
}

export function StockBriefingInspector({
  detail,
  detailKey,
  errorMessage,
  mobile,
  onClose,
  onRetry,
  onSelectEntity,
  open,
  relation,
  state,
}: {
  detail: StockBriefingDetail | null;
  detailKey: string | null;
  errorMessage?: string;
  mobile: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSelectEntity: (entityKey: string) => void;
  open: boolean;
  relation: EntityRelationGraph | null;
  state: StockBriefingInspectorState;
}) {
  const companyMetrics = filterSourceBackedCompanyMetricGroups(detail?.companyMetrics);

  return (
    <DetailInspectorFrame
      bodyClassName={styles.inspectorContent}
      closeLabel="종목 브리핑 인스펙터 닫기"
      description="선택한 종목에 연결된 근거와 확인할 리스크"
      detailKey={detailKey}
      mobile={mobile}
      onClose={onClose}
      open={open}
      resizerLabel="종목 브리핑 인스펙터 너비 조절"
      storageKey={stockInspectorWidthStorageKey}
      testId="stock-briefing-inspector"
      title="종목 브리핑"
      titleIcon={<Newspaper aria-hidden="true" />}
    >
      {(presentation) => (
        <>
          {state === 'loading' && (
            <WorkspaceState
              className={styles.state}
              delayMs={0}
              kind="loading"
              title="종목 브리핑을 불러오고 있습니다"
              description="상세 정보와 연결 근거를 확인하는 중입니다."
            />
          )}
          {state === 'error' && (
            <WorkspaceState
              className={styles.state}
              kind="error"
              title="종목 브리핑을 불러오지 못했습니다"
              description={errorMessage ?? '잠시 후 같은 종목을 다시 확인해 주세요.'}
              action={
                <Button size="sm" type="button" variant="secondary" onClick={onRetry}>
                  다시 불러오기
                </Button>
              }
            />
          )}
          {state === 'ready' && detail && (
            <div className={styles.inspectorBody} data-availability={detail.availability}>
              <section className={styles.summary} aria-labelledby="stock-inspector-summary">
                <div>
                  <span>
                    {marketLabel(detail.stock.market)} · {detail.stock.ticker}
                  </span>
                  <h2 id="stock-inspector-summary">종목 요약</h2>
                  <strong>{detail.stock.displayName}</strong>
                </div>
                <PropertyList
                  className={styles.summaryMeta}
                  items={[
                    { label: '종목 상태', value: stockBriefingStatusLabel(detail.stock) },
                    {
                      label: '연결 뉴스',
                      value: detail.whyNow ? `${detail.whyNow.newsCount}건` : '명시적 데이터 없음',
                    },
                    {
                      label: '근거 수준',
                      value: stockBriefingEvidenceLevelLabel(detail.evidenceLevel),
                    },
                    { label: '현재 가격', value: priceLabel(detail) },
                    {
                      label: '변화율',
                      value:
                        detail.stock.changePct === undefined
                          ? '변화율 없음'
                          : `${detail.stock.changePct.toFixed(2)}%`,
                    },
                    {
                      label: '분석 기준',
                      value: (
                        <time dateTime={detail.generatedAt}>
                          {formatDate(detail.generatedAt, true)}
                        </time>
                      ),
                    },
                  ]}
                />
              </section>

              {detail.whyNow && (
                <section aria-labelledby="stock-inspector-why-now">
                  <h3 id="stock-inspector-why-now">왜 지금 확인하나요</h3>
                  <strong>{detail.whyNow.changeSummary}</strong>
                  <p>{detail.whyNow.connectionReason}</p>
                </section>
              )}

              {(detail.paths.length > 0 || detail.partialFailures.impact) && (
                <section aria-labelledby="stock-inspector-paths">
                  <h3 id="stock-inspector-paths">영향 경로</h3>
                  {detail.paths.length > 0 && (
                    <StructuredList>
                      {detail.paths.map((path) => (
                        <li key={path.id}>
                          <strong>{path.label}</strong>
                          {path.summary ? (
                            <span>{presentResearchSummary(path.summary)}</span>
                          ) : null}
                        </li>
                      ))}
                    </StructuredList>
                  )}
                  {detail.partialFailures.impact && (
                    <LocalFailure
                      title="영향 경로를 확인하지 못했습니다"
                      description="기본 종목 정보는 표시되며, 영향 경로만 잠시 사용할 수 없습니다."
                    />
                  )}
                </section>
              )}

              {detail.news.length > 0 && (
                <section aria-labelledby="stock-inspector-news">
                  <h3 id="stock-inspector-news">관련 뉴스</h3>
                  <StructuredList className={styles.newsList}>
                    {detail.news.slice(0, 3).map((item) => (
                      <li key={item.id}>
                        {item.url ? (
                          <TextLink href={item.url} target="_blank" rel="noreferrer" motion="quiet">
                            <strong>{item.title}</strong>
                            <ExternalLink aria-hidden="true" />
                          </TextLink>
                        ) : (
                          <strong>{item.title}</strong>
                        )}
                        {item.summary ? <p>{presentResearchSummary(item.summary)}</p> : null}
                        {(item.sourceName || item.publishedAt) && (
                          <small>
                            {item.sourceName}
                            {item.sourceName && item.publishedAt ? ' · ' : null}
                            {item.publishedAt ? (
                              <time dateTime={item.publishedAt}>
                                {formatDate(item.publishedAt, true)}
                              </time>
                            ) : null}
                          </small>
                        )}
                      </li>
                    ))}
                  </StructuredList>
                </section>
              )}

              {(detail.risks.length > 0 || detail.checkpoints.length > 0) && (
                <section aria-labelledby="stock-inspector-risks">
                  <h3 id="stock-inspector-risks">확인할 리스크와 체크포인트</h3>
                  <div className={styles.riskColumns}>
                    {detail.risks.length > 0 && (
                      <div>
                        <strong>확인할 리스크</strong>
                        <StructuredList>
                          {detail.risks.map((risk) => (
                            <li key={risk}>{risk}</li>
                          ))}
                        </StructuredList>
                      </div>
                    )}
                    {detail.checkpoints.length > 0 && (
                      <div>
                        <strong>체크포인트</strong>
                        <StructuredList>
                          {detail.checkpoints.map((checkpoint) => (
                            <li key={checkpoint}>{checkpoint}</li>
                          ))}
                        </StructuredList>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {detail.primaryThesis && (
                <section aria-labelledby="stock-inspector-thesis">
                  <h3 id="stock-inspector-thesis">보유 논지 복기</h3>
                  <p>{detail.primaryThesis}</p>
                </section>
              )}

              {presentation === 'modal' && (
                <div className={styles.modalDetails}>
                  {(relation || detail.partialFailures.relation) && (
                    <section aria-labelledby="stock-inspector-relation">
                      <h3 id="stock-inspector-relation">테마와 연결된 기업</h3>
                      {relation ? (
                        <div className={styles.graphRegion}>
                          <RelationSigmaGraph graph={relation} onSelectEntity={onSelectEntity} />
                        </div>
                      ) : null}
                      {detail.partialFailures.relation && (
                        <LocalFailure
                          title="기업 관계를 확인하지 못했습니다"
                          description="기본 종목 정보는 표시되며, 관계 지도만 잠시 사용할 수 없습니다."
                        />
                      )}
                    </section>
                  )}
                  {detail.companyProfile && (
                    <section aria-labelledby="stock-inspector-company-profile">
                      <h3 id="stock-inspector-company-profile">회사 개요</h3>
                      <strong>{detail.companyProfile.name ?? detail.stock.displayName}</strong>
                      {detail.companyProfile.summaryText ? (
                        <p>{detail.companyProfile.summaryText}</p>
                      ) : null}
                      <small>
                        {[detail.companyProfile.sector, detail.companyProfile.industry]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </section>
                  )}
                  {companyMetrics.length > 0 && (
                    <section aria-labelledby="stock-inspector-company-metrics">
                      <h3 id="stock-inspector-company-metrics">회사 지표</h3>
                      <div className={styles.metricGroups}>
                        {companyMetrics.map((group) => (
                          <article key={`${group.metricGroup}-${group.fiscalPeriod ?? 'latest'}`}>
                            <div>
                              <strong>{getCompanyMetricGroupTitle(group)}</strong>
                              <small>{getCompanyMetricSourceSummary(group)}</small>
                            </div>
                            <PropertyList
                              items={group.metrics.slice(0, 6).map((metric) => ({
                                label: metric.label,
                                value: formatCompanyMetricValue(metric, group.currency),
                              }))}
                            />
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </DetailInspectorFrame>
  );
}
