import type { PersonalizationResearchWorkspace } from '../../model/workspace-view-payload';
import { formatDate } from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function money(value: string, currency: string): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(number)
    : value;
}

function ListOrEmpty({ items }: { items: readonly string[] }) {
  return items.length > 0 ? (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p>기록된 항목이 없습니다.</p>
  );
}

export function PersonalizationWorkspacePanel({
  data,
}: {
  data: PersonalizationResearchWorkspace;
}) {
  const explanation = data.decision?.explanation ?? null;
  const portfolio = data.portfolio;
  const thesis = data.thesis?.revision ?? null;
  return (
    <section
      className={`${styles.panel} ${styles.personalizationPanel}`}
      aria-labelledby="personalization-workspace-title"
      data-read-only="true"
    >
      <header className={styles.panelHeader}>
        <div>
          <h2 id="personalization-workspace-title">개인화 분석</h2>
          <p>개인 원장과 공통 근거를 결합한 조회 전용 화면이며 주문 기능은 없습니다.</p>
        </div>
        <span>{data.selectedEntityKey ?? '대상 없음'}</span>
      </header>

      <div className={styles.personalizationGrid}>
        <section aria-labelledby="portfolio-snapshot-title">
          <h3 id="portfolio-snapshot-title">포트폴리오 스냅샷</h3>
          {portfolio ? (
            <dl>
              <div>
                <dt>평가액</dt>
                <dd>{money(portfolio.totalMarketValue, portfolio.baseCurrency)}</dd>
              </div>
              <div>
                <dt>보유 종목</dt>
                <dd>{portfolio.positionCount}개</dd>
              </div>
              <div>
                <dt>봉인 시각</dt>
                <dd>
                  <time dateTime={portfolio.sealedAt}>{formatDate(portfolio.sealedAt, true)}</time>
                </dd>
              </div>
            </dl>
          ) : (
            <p>봉인된 스냅샷이 없습니다.</p>
          )}
        </section>

        <section aria-labelledby="portfolio-impact-title">
          <h3 id="portfolio-impact-title">포트폴리오 영향</h3>
          {data.impact ? (
            <>
              <strong>{signedPercent(data.impact.aggregateImpact)}</strong>
              <p>{data.impact.affectedPositions.length}개 보유 종목의 PIT 영향 합계입니다.</p>
            </>
          ) : (
            <p>연결된 영향 데이터가 없습니다.</p>
          )}
        </section>

        <section aria-labelledby="thesis-title">
          <h3 id="thesis-title">내 논지</h3>
          {thesis ? (
            <>
              <p>{thesis.thesisText}</p>
              <small>
                {thesis.sourceKind === 'user_authored' ? '사용자 작성' : '시스템 생성'} · revision{' '}
                {thesis.revisionNo}
              </small>
            </>
          ) : (
            <p>저장된 논지가 없습니다.</p>
          )}
        </section>

        <section aria-labelledby="decision-history-title">
          <h3 id="decision-history-title">판단 이력</h3>
          <p>{data.decisionHistory?.items.length ?? 0}개 패킷 · 오래된 패킷은 상세를 숨깁니다.</p>
        </section>
      </div>

      <section className={styles.explanationPanel} aria-labelledby="structured-explanation-title">
        <header>
          <h3 id="structured-explanation-title">구조화된 판단 설명</h3>
          <p>
            {data.decision?.packet.orderExecutable === false
              ? '주문 연결 없음'
              : '실행 경계를 확인할 수 없습니다.'}
          </p>
        </header>
        {explanation ? (
          <div className={styles.explanationGrid}>
            <article>
              <h4>변경된 사실</h4>
              <ListOrEmpty items={explanation.whatChanged} />
            </article>
            <article>
              <h4>공통 종목 관점</h4>
              <p>
                {explanation.commonAssetView.direction} · coverage{' '}
                {percent(explanation.commonAssetView.coverage)}
              </p>
            </article>
            <article>
              <h4>개인화 이유</h4>
              <p>{explanation.personalizedReason}</p>
            </article>
            <article>
              <h4>사건·지역 경로</h4>
              <p>
                전달 {signedPercent(explanation.eventAndGeoPaths.eventTransmission)} · 지역 집중{' '}
                {percent(explanation.eventAndGeoPaths.geoConcentrationRisk)}
              </p>
            </article>
            <article>
              <h4>상승·하락·기간</h4>
              <p>
                {signedPercent(explanation.upsideDownsideAndHorizon.lowerReturn)} ~{' '}
                {signedPercent(explanation.upsideDownsideAndHorizon.upperReturn)} ·{' '}
                {explanation.upsideDownsideAndHorizon.horizon}
              </p>
            </article>
            <article>
              <h4>비용·세금·집중도</h4>
              <p>
                총비용 {percent(explanation.costTaxAndConcentration.totalCost)} · 집중도{' '}
                {percent(explanation.costTaxAndConcentration.concentrationBefore)} →{' '}
                {percent(explanation.costTaxAndConcentration.concentrationAfter)}
              </p>
            </article>
            <article>
              <h4>반대 근거·미확인</h4>
              <ListOrEmpty items={explanation.counterEvidenceAndUnknowns} />
            </article>
            <article>
              <h4>무효화 조건</h4>
              <ListOrEmpty items={explanation.invalidationConditions} />
            </article>
            <article>
              <h4>유효 기한</h4>
              <p>
                <time dateTime={explanation.validUntil}>
                  {formatDate(explanation.validUntil, true)}
                </time>
              </p>
            </article>
          </div>
        ) : (
          <p>법률 검토 전이거나 만료된 패킷의 상세 설명은 표시하지 않습니다.</p>
        )}
      </section>
    </section>
  );
}
