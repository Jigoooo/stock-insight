import { ExternalLink, Network } from 'lucide-react';

import { DetailInspectorFrame, type DetailInspectorPresentation } from './detail-inspector-frame';
import { GeoMarketMap } from './geo-market-map';
import styles from './market-connection-inspector.module.css';
import { RelationSigmaGraph } from './relation-sigma-graph';
import { formatDate, marketLabel, signalTypeLabel } from './workspace-presenters';
import {
  marketConnectionStrength,
  marketConnectionStrengthLabel,
  type MarketConnectionLoadResult,
} from '../model/market-connections';

import { marketConnectionInspectorWidthStorageKey } from '@/pages/research-workspace/model/detail-inspector-layout';
import { Button } from '@/shared/ui/button';
import { TextLink } from '@/shared/ui/link';
import { DataTable, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type { RadarSignalPage } from '@stock-insight/contracts/research-workspace';

type MarketConnectionInspectorState = 'error' | 'loading' | 'ready';

function isValidHttpsUrl(value?: string): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function evidenceLevelLabel(value: 'high' | 'medium' | 'low' | undefined) {
  if (value === 'high') return '높음';
  if (value === 'medium') return '보통';
  if (value === 'low') return '낮음';
  return '명시적 데이터 없음';
}

function precisionLabel(value: string) {
  return (
    {
      exact: '정확한 위치',
      approximate: '근사 위치',
      centroid: '대표 중심점',
      region_only: '지역 단위',
      unknown: '정밀도 미확인',
    }[value] ?? '정밀도 미확인'
  );
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

function EntityConnections({
  entities,
}: {
  entities: MarketConnectionLoadResult['detail']['item']['connectedEntities'];
}) {
  return (
    <StructuredList className={styles.entityList} aria-label="연결 종목 목록">
      {entities.map((entity) => (
        <li key={entity.entityKey}>
          <div>
            <strong>{entity.displayName}</strong>
            <small>{entity.entityKey}</small>
          </div>
          <div className={styles.entityStates}>
            {entity.holding && <span>보유</span>}
            {entity.watched && <span>관심</span>}
            {!entity.holding && !entity.watched && <span>시장 연결</span>}
          </div>
        </li>
      ))}
    </StructuredList>
  );
}

function MarketConnectionDetailContent({
  factorRows,
  geoSnapshot,
  onRetry,
  presentation,
  result,
  state,
}: {
  factorRows: RadarSignalPage['items'];
  geoSnapshot: GeoSnapshot;
  onRetry: () => void;
  presentation: DetailInspectorPresentation;
  result: MarketConnectionLoadResult | null;
  state: MarketConnectionInspectorState;
}) {
  if (state === 'loading') {
    return (
      <WorkspaceState
        className={styles.state}
        delayMs={0}
        kind="loading"
        title="시장 변화 상세를 준비하고 있습니다"
        description="연결 관계와 영향 경로를 확인하는 중입니다."
      />
    );
  }

  if (state === 'error') {
    return (
      <WorkspaceState
        className={styles.state}
        kind="error"
        title="시장 변화 상세를 불러오지 못했습니다"
        description="선택은 유지됩니다. 같은 변화를 다시 불러올 수 있습니다."
        action={
          <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
            다시 불러오기
          </Button>
        }
      />
    );
  }

  if (!result || result.detail.availability === 'missing') {
    return (
      <WorkspaceState
        className={styles.state}
        kind="empty"
        title="시장 변화 상세가 준비되지 않았습니다"
        description="현재 기준 시점에는 이 변화에 연결된 상세 데이터가 없습니다."
      />
    );
  }

  const { detail, relation } = result;
  const rawStrength = detail.item.rawStrength;
  const compactPaths = detail.paths.slice(0, 1);
  const geoFeatures = geoSnapshot.geojson.features;

  return (
    <div className={styles.readyContent} data-presentation={presentation}>
      <div className={styles.primarySections}>
        {detail.availability === 'partial' && (
          <WorkspaceState
            className={styles.partialState}
            kind="partial"
            title="일부 상세 데이터가 준비되지 않았습니다"
            description="확인 가능한 기본 변화와 근거는 유지하고, 실패한 구역만 별도로 표시합니다."
          />
        )}

        <section className={styles.summary} aria-labelledby="market-inspector-summary">
          <span>
            {marketLabel(detail.item.market)}
            {detail.item.regionLabel ? ` · ${detail.item.regionLabel}` : null}
          </span>
          <h2 id="market-inspector-summary">시장 변화 요약</h2>
          <strong>{detail.item.title}</strong>
          <p>{detail.item.summary}</p>
        </section>

        {detail.item.whyNow && (
          <section aria-labelledby="market-inspector-why-now">
            <h3 id="market-inspector-why-now">왜 지금 중요한가</h3>
            <p>{detail.item.whyNow}</p>
          </section>
        )}

        {detail.item.connectedEntities.length > 0 && (
          <section aria-labelledby="market-inspector-entities">
            <h3 id="market-inspector-entities">연결된 내 보유·관심 종목</h3>
            <EntityConnections entities={detail.item.connectedEntities} />
          </section>
        )}

        {(detail.paths.length > 0 || detail.partialFailures.impact) && (
          <section aria-labelledby="market-inspector-paths">
            <h3 id="market-inspector-paths">시장 변화가 종목까지 이어지는 영향 경로</h3>
            {compactPaths.length > 0 && (
              <StructuredList>
                {compactPaths.map((path) => (
                  <li key={path.id}>
                    <strong>{path.label}</strong>
                    {path.summary ? <p>{path.summary}</p> : null}
                  </li>
                ))}
              </StructuredList>
            )}
            {detail.partialFailures.impact && (
              <LocalFailure
                title="영향 경로를 확인하지 못했습니다"
                description="기본 변화 정보는 표시되며, 영향 경로만 잠시 사용할 수 없습니다."
              />
            )}
          </section>
        )}

        {detail.sources.length > 0 && (
          <section aria-labelledby="market-inspector-sources">
            <h3 id="market-inspector-sources">관련 뉴스·공시·근거 출처</h3>
            <StructuredList className={styles.sourceList}>
              {detail.sources.map((source) => (
                <li key={source.id}>
                  {isValidHttpsUrl(source.url) ? (
                    <TextLink href={source.url} target="_blank" rel="noreferrer" motion="quiet">
                      <strong>{source.title}</strong>
                      <ExternalLink aria-hidden="true" />
                    </TextLink>
                  ) : (
                    <strong>{source.title}</strong>
                  )}
                  {source.summary ? <p>{source.summary}</p> : null}
                  {(source.sourceName || source.publishedAt) && (
                    <small>
                      {source.sourceName}
                      {source.sourceName && source.publishedAt ? ' · ' : null}
                      {source.publishedAt ? (
                        <time dateTime={source.publishedAt}>
                          {formatDate(source.publishedAt, true)}
                        </time>
                      ) : null}
                    </small>
                  )}
                </li>
              ))}
            </StructuredList>
          </section>
        )}

        {(detail.counterEvidence.length > 0 ||
          detail.risks.length > 0 ||
          detail.checkpoints.length > 0) && (
          <section aria-labelledby="market-inspector-risks">
            <h3 id="market-inspector-risks">반대 근거와 확인할 리스크</h3>
            <div className={styles.riskBlocks}>
              {detail.counterEvidence.length > 0 && (
                <div>
                  <strong>반대 근거</strong>
                  <StructuredList>
                    {detail.counterEvidence.map((evidence) => (
                      <li key={evidence}>{evidence}</li>
                    ))}
                  </StructuredList>
                </div>
              )}
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
                  <strong>다음 체크포인트</strong>
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

        <section aria-labelledby="market-inspector-meta">
          <h3 id="market-inspector-meta">데이터 기준 시각과 근거 수준</h3>
          <dl className={styles.metadata}>
            <div>
              <dt>분석 기준</dt>
              <dd>{formatDate(detail.generatedAt, true)}</dd>
            </div>
            <div>
              <dt>근거 수준</dt>
              <dd>{evidenceLevelLabel(detail.evidenceLevel)}</dd>
            </div>
            {rawStrength !== undefined && (
              <div>
                <dt>관측 신호 상대 강도</dt>
                <dd>{Math.round(rawStrength * 100)}</dd>
              </div>
            )}
          </dl>
          {rawStrength !== undefined && (
            <p className={styles.strengthBoundary}>
              관측된 신호의 상대 강도이며 상승·하락 확률이나 가격 전망이 아닙니다.
            </p>
          )}
        </section>
      </div>

      {presentation === 'modal' && (
        <div className={styles.supplementarySections}>
          {(relation || detail.partialFailures.relation) && (
            <section aria-labelledby="market-inspector-relation">
              <h3 id="market-inspector-relation">관계 그래프</h3>
              {relation ? (
                <div className={styles.graphRegion}>
                  <RelationSigmaGraph graph={relation} onSelectEntity={() => undefined} />
                </div>
              ) : null}
              {detail.partialFailures.relation && (
                <LocalFailure
                  title="관계 그래프를 확인하지 못했습니다"
                  description="기본 변화 정보는 표시되며, 기업 관계만 잠시 사용할 수 없습니다."
                />
              )}
            </section>
          )}

          {(geoSnapshot.geojson.features.length > 0 || detail.partialFailures.geo) && (
            <section aria-labelledby="market-inspector-geo">
              <h3 id="market-inspector-geo">세계 지도 위치와 정밀도</h3>
              {geoFeatures.length > 0 && (
                <>
                  <div className={styles.geoMapRegion}>
                    <GeoMarketMap snapshot={geoSnapshot} />
                  </div>
                  <StructuredList className={styles.geoList} aria-label="위치 정밀도 목록">
                    {geoFeatures.map((feature) => (
                      <li key={feature.properties.geoEntityKey}>
                        <strong>{feature.properties.label}</strong>
                        <span>{precisionLabel(feature.properties.precisionClass)}</span>
                        {feature.properties.uncertaintyRadiusKm !== undefined && (
                          <small>불확실성 반경 {feature.properties.uncertaintyRadiusKm} km</small>
                        )}
                      </li>
                    ))}
                  </StructuredList>
                </>
              )}
              {detail.partialFailures.geo && (
                <LocalFailure
                  title="지역 정보를 확인하지 못했습니다"
                  description="기본 변화 정보는 표시되며, 위치와 정밀도만 잠시 사용할 수 없습니다."
                />
              )}
            </section>
          )}

          {detail.paths.length > 0 && (
            <section aria-labelledby="market-inspector-full-paths">
              <h3 id="market-inspector-full-paths">전체 영향 경로</h3>
              <StructuredList>
                {detail.paths.map((path) => (
                  <li key={path.id}>
                    <strong>{path.label}</strong>
                    {path.summary ? <p>{path.summary}</p> : null}
                  </li>
                ))}
              </StructuredList>
            </section>
          )}

          {relation && relation.nodes.length > 0 && (
            <section aria-labelledby="market-inspector-related-entities">
              <h3 id="market-inspector-related-entities">연관 기업과 테마</h3>
              <StructuredList>
                {relation.nodes.map((node) => (
                  <li key={node.entityKey}>
                    <strong>{node.label}</strong>
                    <span>{marketLabel(node.market)}</span>
                  </li>
                ))}
              </StructuredList>
            </section>
          )}

          {(detail.relatedEvents.length > 0 || detail.partialFailures.history) && (
            <section aria-labelledby="market-inspector-history">
              <h3 id="market-inspector-history">같은 유형의 이전 사건</h3>
              {detail.relatedEvents.length > 0 && (
                <StructuredList>
                  {detail.relatedEvents.map((event) => (
                    <li key={event.connectionKey}>
                      <time dateTime={event.occurredAt}>{formatDate(event.occurredAt, true)}</time>
                      <strong>{event.title}</strong>
                      <p>{event.summary}</p>
                    </li>
                  ))}
                </StructuredList>
              )}
              {detail.partialFailures.history && (
                <LocalFailure
                  title="이전 사건을 확인하지 못했습니다"
                  description="기본 변화 정보는 표시되며, 이전 관측 기록만 잠시 사용할 수 없습니다."
                />
              )}
            </section>
          )}

          {factorRows.length > 0 && (
            <section aria-labelledby="market-inspector-factor-comparison">
              <h3 id="market-inspector-factor-comparison">요인별 비교</h3>
              <DataTable
                caption="연결 종목의 시장 신호 비교"
                className={styles.factorTable}
                containerProps={{
                  className: styles.factorTableWrap,
                  'aria-label': '연결 종목 시장 신호 비교표 가로 스크롤 영역',
                  tabIndex: 0,
                }}
              >
                <thead>
                  <tr>
                    <th scope="col">종목</th>
                    <th scope="col">시장</th>
                    <th scope="col">요인</th>
                    <th scope="col">강도</th>
                  </tr>
                </thead>
                <tbody>
                  {factorRows.map((row) => (
                    <tr key={row.signalKey}>
                      <td>{row.name}</td>
                      <td>{marketLabel(row.market)}</td>
                      <td>{signalTypeLabel(row.signalType)}</td>
                      <td>
                        {marketConnectionStrengthLabel(marketConnectionStrength(row.strength))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export function MarketConnectionInspector({
  geoSnapshot,
  mobile,
  onClose,
  onRetry,
  open,
  radarItems,
  result,
  selectedConnectionKey,
  state,
}: {
  geoSnapshot: GeoSnapshot;
  mobile: boolean;
  onClose: () => void;
  onRetry: () => void;
  open: boolean;
  radarItems: RadarSignalPage['items'];
  result: MarketConnectionLoadResult | null;
  selectedConnectionKey: string | null;
  state: MarketConnectionInspectorState;
}) {
  const connectedEntityKeys = new Set(
    result?.detail.item.connectedEntities.map(({ entityKey }) => entityKey) ?? [],
  );
  const factorRows = radarItems.filter(({ entityKey }) => connectedEntityKeys.has(entityKey));

  return (
    <DetailInspectorFrame
      bodyClassName={styles.inspectorContent}
      closeLabel="시장 연결 상세 인스펙터 닫기"
      description="선택한 시장 변화와 보유·관심 종목의 연결 근거"
      detailKey={selectedConnectionKey}
      mobile={mobile}
      onClose={onClose}
      open={open}
      resizerLabel="시장 연결 상세 인스펙터 너비 조절"
      storageKey={marketConnectionInspectorWidthStorageKey}
      testId="market-connection-inspector"
      title="시장 연결 상세"
      titleIcon={<Network aria-hidden="true" />}
    >
      {(presentation) => (
        <MarketConnectionDetailContent
          factorRows={factorRows}
          geoSnapshot={geoSnapshot}
          onRetry={onRetry}
          presentation={presentation}
          result={result}
          state={state}
        />
      )}
    </DetailInspectorFrame>
  );
}
