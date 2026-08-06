/* oxlint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-noninteractive-tabindex -- Safari/VoiceOver list recovery and keyboard-focusable horizontal data region. */
import { formatCryptoConfidence, formatCryptoMagnitude } from '../../model/crypto-display';
import { formatDate } from '../workspace-presenters';
import styles from './crypto-workspace-view.module.css';

import {
  DataTable,
  MetricStrip,
  PageHeader,
  Panel,
  PanelHeader,
  PropertyList,
  StructuredList,
  Timeline,
  WorkspaceState,
} from '@/shared/ui/workspace';

import type { CryptoResearchWorkspace } from '@stock-insight/contracts/crypto-research';

const relationLabels: Record<string, string> = {
  issued_by_company: '발행사',
  treasury_held_by_company: '기업 보유',
  reserve_managed_by_company: '준비금 운용',
  operated_by_company: '운영 주체',
  mined_by_company: '채굴 사업',
  custodied_by_company: '수탁 관계',
  revenue_exposure_company: '매출 민감도',
  cost_exposure_company: '비용 민감도',
  payment_distribution_company: '결제 유통',
  etf_underlying_exposure: 'ETF 기초자산',
};

const eventLabels: Record<string, string> = {
  transaction_anomaly: '거래 이상',
  contract_upgrade: '계약 업그레이드',
  audit_publication: '감사 공개',
  exploit: '취약점 악용',
  depeg: '페그 이탈',
  peg_recovery: '페그 회복',
  protocol_pause: '프로토콜 중지',
  validator_incident: '검증자 사건',
  bridge_incident: '브리지 사건',
  oracle_incident: '오라클 사건',
  governance_execution: '거버넌스 실행',
  chain_halt: '체인 중단',
  chain_restart: '체인 재개',
};

const finalityLabels: Record<string, string> = {
  unfinalized: '미확정',
  safe: '안전 확인',
  finalized: '최종 확정',
  not_applicable: '확정성 비적용',
};

const channelLabels: Record<string, string> = {
  contract_dependency: '계약 의존',
  reserve_backing: '준비자산',
  bridge_route: '브리지 경로',
  oracle_feed: '오라클 피드',
  custody_chain: '수탁 경로',
  exchange_venue: '거래소 경로',
  liquidity_pool: '유동성 풀',
  collateral_chain: '담보 연쇄',
  treasury_exposure: '기업 보유',
  revenue_exposure: '매출 노출',
};

const shockLabels: Record<string, string> = {
  bridge_failure: '브리지 장애',
  oracle_failure: '오라클 장애',
  custody_loss: '수탁 손실',
  exchange_insolvency: '거래소 지급불능',
  stablecoin_depeg: '스테이블코인 디페그',
  liquidation_cascade: '연쇄 청산',
  smart_contract_exploit: '스마트 계약 악용',
  validator_failure: '검증자 장애',
  liquidity_withdrawal: '유동성 회수',
  regulatory_restriction: '규제 제한',
};

export function CryptoWorkspaceView({ data }: { data: CryptoResearchWorkspace }) {
  const verifiedLinkCount = data.companyLinks.filter(
    (link) => link.relationState === 'verified',
  ).length;
  const proposedLinkCount = data.companyLinks.length - verifiedLinkCount;
  return (
    <div className={styles.root} data-read-only="true" data-order-executable="false">
      <PageHeader
        title="크립토 리서치"
        description="크립토 사건과 기업·시장 관계를 확인합니다."
        asOf={data.knownAt}
      />

      <output className={styles.safetyBar}>
        <strong>조회 전용</strong>
        <span>주문·지갑 연결 없음</span>
      </output>

      <MetricStrip
        label="크립토 리서치 범위"
        items={[
          { label: '추적 자산', value: data.stats.entities },
          { label: '온체인 사건', value: data.stats.events },
          { label: '기업 연결', value: data.stats.companyLinks },
          { label: '리스크 경로', value: data.stats.riskExposures },
        ]}
      />

      {data.availability === 'empty' ? (
        // "준비되면 표시됩니다" 는 수집이 진행 중이라는 뜻인데 사실이 아니다.
        // 2026-08-05 확인: crypto_serving 네 표가 전부 0행이고 여기에 쓰는
        // 코드가 저장소에 없다. 곧 채워질 화면이 아니라 아직 시작하지 않은
        // 영역이므로, 기다리라고 말하지 않고 그렇게 말한다.
        <WorkspaceState
          kind="empty"
          title="크립토는 아직 수집하지 않습니다"
          description="이 화면이 쓰는 식별·연결·사건·리스크 자료를 아직 모으지 않고 있습니다. 비어 있는 것은 오류가 아니라 범위 밖이라는 뜻입니다."
        />
      ) : (
        <div className={styles.contentGrid}>
          <Panel className={styles.assetPanel} aria-labelledby="crypto-assets-title">
            <PanelHeader className={styles.sectionHeader}>
              <h2 id="crypto-assets-title">추적 자산</h2>
            </PanelHeader>
            {data.entities.length === 0 ? (
              <p className={styles.emptyCopy}>표시할 자산 식별 정보가 없습니다.</p>
            ) : (
              <StructuredList className={styles.assetList} aria-label="추적 자산 목록">
                {data.entities.map((entity) => (
                  <li key={entity.entityKey}>
                    <div>
                      <strong>{entity.displayName}</strong>
                      <span>{entity.symbol ?? entity.entityKind}</span>
                    </div>
                    <p>{entity.chainId ?? '체인 외 식별자'}</p>
                    <small>출처 버전 {entity.sourceRevisionId}</small>
                  </li>
                ))}
              </StructuredList>
            )}
          </Panel>

          <Panel className={styles.companyPanel} aria-labelledby="crypto-company-links-title">
            <PanelHeader
              className={styles.sectionHeader}
              meta={`검증 ${verifiedLinkCount}개 · 검토 중 ${proposedLinkCount}개`}
            >
              <h2 id="crypto-company-links-title">기업 연결</h2>
            </PanelHeader>
            {data.companyLinks.length === 0 ? (
              <p className={styles.emptyCopy}>검증된 기업 연결이 없습니다.</p>
            ) : (
              <section
                className={styles.tableWrap}
                aria-describedby="crypto-company-scroll-hint"
                aria-label="기업 연결 표 가로 스크롤 영역"
                tabIndex={0}
              >
                <p id="crypto-company-scroll-hint" className={styles.tableScrollHint}>
                  좌우로 밀어 전체 근거 확인
                </p>
                <DataTable caption="크립토 자산과 주식·기업 간 검증 관계">
                  <thead>
                    <tr>
                      <th scope="col">크립토</th>
                      <th scope="col">관계</th>
                      <th scope="col">기업·증권</th>
                      <th scope="col">정량 근거</th>
                      <th scope="col">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.companyLinks.map((link) => (
                      <tr key={link.relationKey} data-relation-key={link.relationKey}>
                        <td>
                          <strong>{link.cryptoName}</strong>
                          <small>{link.cryptoEntityKey}</small>
                        </td>
                        <td>{relationLabels[link.relationKind] ?? link.relationKind}</td>
                        <td>
                          <strong>{link.coreName}</strong>
                          <small>{link.coreEntityKey}</small>
                        </td>
                        <td>
                          {formatCryptoMagnitude(
                            link.economicMagnitude,
                            link.economicMagnitudeUnit,
                          )}
                          {link.economicMagnitude !== null &&
                          link.economicMagnitudeUnit !== null ? (
                            <small>
                              원계수 {link.economicMagnitude} {link.economicMagnitudeUnit}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <span data-state={link.relationState}>
                            {link.relationState === 'verified' ? '검증됨' : '검토 중'}
                          </span>
                          <small>{formatCryptoConfidence(link.epistemicConfidence)}</small>
                          {link.epistemicConfidence !== null ? (
                            <small>신뢰 원계수 {link.epistemicConfidence}</small>
                          ) : null}
                          <small>출처 버전 {link.sourceRevisionId}</small>
                          <time dateTime={link.knownAt}>
                            기준 시각 {formatDate(link.knownAt, true)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </section>
            )}
          </Panel>

          <Panel className={styles.eventPanel} aria-labelledby="crypto-events-title">
            <PanelHeader className={styles.sectionHeader}>
              <h2 id="crypto-events-title">온체인 사건</h2>
            </PanelHeader>
            {data.events.length === 0 ? (
              <p className={styles.emptyCopy}>표시할 사건이 없습니다.</p>
            ) : (
              <Timeline className={styles.eventList} aria-label="온체인 사건 목록">
                {data.events.map((event) => (
                  <li key={event.eventKey}>
                    <div>
                      <strong>{eventLabels[event.eventType] ?? event.eventType}</strong>
                      <div className={styles.eventStates}>
                        <span>{event.lifecycleState}</span>
                        <span data-finality={event.finalityState}>
                          {finalityLabels[event.finalityState] ?? event.finalityState}
                        </span>
                      </div>
                    </div>
                    <p>{event.summary}</p>
                    <time dateTime={event.knownAt}>{formatDate(event.knownAt, true)}</time>
                    <small>출처 버전 {event.sourceRevisionId}</small>
                  </li>
                ))}
              </Timeline>
            )}
          </Panel>

          <Panel className={styles.riskPanel} aria-labelledby="crypto-risk-title">
            <PanelHeader className={styles.sectionHeader}>
              <h2 id="crypto-risk-title">리스크 전파</h2>
            </PanelHeader>
            {data.riskExposures.length === 0 ? (
              <p className={styles.emptyCopy}>표시할 리스크 경로가 없습니다.</p>
            ) : (
              <StructuredList className={styles.riskList} aria-label="리스크 전파 목록">
                {data.riskExposures.map((risk) => (
                  <li key={risk.exposureKey} data-exposure-key={risk.exposureKey}>
                    <div>
                      <strong>{risk.cryptoName}</strong>
                      <div className={styles.riskStates}>
                        <span data-lifecycle={risk.lifecycleState}>
                          {risk.lifecycleState === 'sealed' ? '봉인됨' : '작성 중'}
                        </span>
                        <span data-direction={risk.directionSign}>
                          {risk.directionSign < 0
                            ? '하방'
                            : risk.directionSign > 0
                              ? '상방'
                              : '중립'}
                        </span>
                      </div>
                    </div>
                    <p>
                      {shockLabels[risk.shockType] ?? risk.shockType} ·{' '}
                      {channelLabels[risk.channelKey] ?? risk.channelKey}
                    </p>
                    <PropertyList
                      items={[
                        {
                          label: '경제 크기',
                          value: (
                            <>
                              {formatCryptoMagnitude(
                                risk.economicMagnitude,
                                risk.economicMagnitudeUnit,
                              )}
                              {risk.economicMagnitude !== null &&
                              risk.economicMagnitudeUnit !== null ? (
                                <small>
                                  원계수 {risk.economicMagnitude} {risk.economicMagnitudeUnit}
                                </small>
                              ) : null}
                            </>
                          ),
                        },
                        {
                          label: '근거 신뢰',
                          value: (
                            <>
                              {formatCryptoConfidence(risk.epistemicConfidence)}
                              {risk.epistemicConfidence !== null ? (
                                <small>원계수 {risk.epistemicConfidence}</small>
                              ) : null}
                            </>
                          ),
                        },
                        { label: '출처 버전', value: risk.sourceRevisionId },
                        {
                          label: '기준 시각',
                          value: (
                            <time dateTime={risk.knownAt}>{formatDate(risk.knownAt, true)}</time>
                          ),
                        },
                      ]}
                    />
                  </li>
                ))}
              </StructuredList>
            )}
          </Panel>
        </div>
      )}

      <Panel className={styles.limitationsPanel} aria-labelledby="crypto-limitations-title">
        <PanelHeader className={styles.sectionHeader}>
          <h2 id="crypto-limitations-title">제약과 가용성</h2>
        </PanelHeader>
        <PropertyList
          className={styles.limitations}
          aria-label="크립토 리서치 제약"
          items={[
            {
              label: '조회 기준',
              value: <time dateTime={data.knownAt}>{formatDate(data.knownAt, true)}</time>,
            },
            { label: '실시간 계정·지갑', value: '현재 사용할 수 없는 연결입니다.' },
            { label: '주문 실행', value: '지원하지 않음 · 모든 정보는 조회 전용입니다.' },
            {
              label: '정량 근거',
              value: '크기나 신뢰도가 확인되지 않은 항목은 대시(—)로 표시합니다.',
            },
          ]}
        />
      </Panel>
    </div>
  );
}
