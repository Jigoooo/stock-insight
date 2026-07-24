/* oxlint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-noninteractive-tabindex -- Safari/VoiceOver list recovery and keyboard-focusable horizontal data region. */
import { formatCryptoConfidence, formatCryptoMagnitude } from '../../model/crypto-display';
import { PageHeader, WorkspaceState, formatDate } from '../research-workspace-page';
import styles from './crypto-workspace-view.module.css';

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
        eyebrow="Crypto × Equity"
        title="크립토·기업 연결 리서치"
        description="크립토 고유 사건과 토크노믹스를 주식 기업·거시·지역 관계망에 연결한 조회 전용 화면입니다."
        asOf={data.knownAt}
      />

      <output className={styles.safetyBar}>
        <strong>조회 전용</strong>
        <span>주문·지갑 연결·실시간 계정 연결이 없습니다.</span>
      </output>

      <dl className={styles.stats} aria-label="크립토 리서치 범위">
        <div>
          <dt>추적 자산</dt>
          <dd>{data.stats.entities}</dd>
        </div>
        <div>
          <dt>온체인 사건</dt>
          <dd>{data.stats.events}</dd>
        </div>
        <div>
          <dt>기업 연결</dt>
          <dd>{data.stats.companyLinks}</dd>
        </div>
        <div>
          <dt>리스크 경로</dt>
          <dd>{data.stats.riskExposures}</dd>
        </div>
      </dl>

      {data.availability === 'empty' ? (
        <WorkspaceState
          kind="empty"
          title="데이터가 아직 없습니다"
          description="검증된 크립토 identity와 기업 연결이 적재되면 이 화면에 표시됩니다."
        />
      ) : (
        <div className={styles.contentGrid}>
          <section className={styles.assetPanel} aria-labelledby="crypto-assets-title">
            <header className={styles.sectionHeader}>
              <div>
                <span>Canonical identity</span>
                <h2 id="crypto-assets-title">추적 자산</h2>
              </div>
            </header>
            {data.entities.length === 0 ? (
              <p className={styles.emptyCopy}>표시할 자산 identity가 없습니다.</p>
            ) : (
              <ul className={styles.assetList} aria-label="추적 자산 목록" role="list">
                {data.entities.map((entity) => (
                  <li key={entity.entityKey}>
                    <div>
                      <strong>{entity.displayName}</strong>
                      <span>{entity.symbol ?? entity.entityKind}</span>
                    </div>
                    <p>{entity.chainId ?? 'off-chain identity'}</p>
                    <small>출처 revision {entity.sourceRevisionId}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.companyPanel} aria-labelledby="crypto-company-links-title">
            <header className={styles.sectionHeader}>
              <div>
                <span>Cross-domain graph</span>
                <h2 id="crypto-company-links-title">기업 연결</h2>
              </div>
              <small>
                검증 {verifiedLinkCount}개 · 검토 중 {proposedLinkCount}개
              </small>
            </header>
            {data.companyLinks.length === 0 ? (
              <p className={styles.emptyCopy}>검증된 기업 연결이 없습니다.</p>
            ) : (
              <section
                className={styles.tableWrap}
                aria-label="기업 연결 표 가로 스크롤 영역"
                aria-describedby="crypto-company-scroll-hint"
                tabIndex={0}
              >
                <p id="crypto-company-scroll-hint" className={styles.tableScrollHint}>
                  좌우로 밀어 전체 근거 확인
                </p>
                <table>
                  <caption>크립토 자산과 주식·기업 간 검증 관계</caption>
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
                          <small>출처 revision {link.sourceRevisionId}</small>
                          <time dateTime={link.knownAt}>
                            기준 시각 {formatDate(link.knownAt, true)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </section>

          <section className={styles.eventPanel} aria-labelledby="crypto-events-title">
            <header className={styles.sectionHeader}>
              <div>
                <span>Truth ledger</span>
                <h2 id="crypto-events-title">온체인 사건</h2>
              </div>
            </header>
            {data.events.length === 0 ? (
              <p className={styles.emptyCopy}>표시할 사건이 없습니다.</p>
            ) : (
              <ol className={styles.eventList} aria-label="온체인 사건 목록" role="list">
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
                    <small>출처 revision {event.sourceRevisionId}</small>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.riskPanel} aria-labelledby="crypto-risk-title">
            <header className={styles.sectionHeader}>
              <div>
                <span>Impact chain</span>
                <h2 id="crypto-risk-title">리스크 전파</h2>
              </div>
            </header>
            {data.riskExposures.length === 0 ? (
              <p className={styles.emptyCopy}>표시할 리스크 경로가 없습니다.</p>
            ) : (
              <ul className={styles.riskList} aria-label="리스크 전파 목록" role="list">
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
                    <dl>
                      <div>
                        <dt>경제 크기</dt>
                        <dd>
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
                        </dd>
                      </div>
                      <div>
                        <dt>근거 신뢰</dt>
                        <dd>
                          {formatCryptoConfidence(risk.epistemicConfidence)}
                          {risk.epistemicConfidence !== null ? (
                            <small>원계수 {risk.epistemicConfidence}</small>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt>출처 revision</dt>
                        <dd>{risk.sourceRevisionId}</dd>
                      </div>
                      <div>
                        <dt>기준 시각</dt>
                        <dd>
                          <time dateTime={risk.knownAt}>{formatDate(risk.knownAt, true)}</time>
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
