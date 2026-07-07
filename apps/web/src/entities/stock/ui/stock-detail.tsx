import {
  CheckCircle2,
  GraduationCap,
  Link as LinkIcon,
  Newspaper,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import styles from './stock-detail.module.css';

import {
  filterSourceBackedCompanyMetricGroups,
  formatCompanyMetricValue,
  getCompanyMetricGroupTitle,
  getCompanyMetricSourceSummary,
} from '../model/format-company-metrics';
import type { Stock } from '../model/types';
import { loadStockDetailResponse } from '@/pages/dashboard/model/load-stock-detail-response';
import { resolveStockDetailForDashboard } from '@/pages/dashboard/model/resolve-stocks';
import { DataQualityPopover, StatusBadge } from '@/shared/ui/primitives';
import type {
  DataAvailability,
  ResponseMeta,
  StockDetail as ApiStockDetail,
  StockDetailResponse,
} from '@stock-insight/contracts';

type StockDetailProps = {
  stock: Stock;
};

const metrics = [
  ['설립', 'founded'],
  ['본사', 'hq'],
  ['자본금', 'capital'],
  ['발행주식', 'shares'],
  ['시가총액', 'marketCap'],
  ['매출', 'sales'],
  ['영업이익', 'operatingProfit'],
  ['ROE', 'roe'],
] as const;

export function StockDetail({ stock }: StockDetailProps) {
  const [detailState, setDetailState] = useState<{
    entityKey: string;
    response?: StockDetailResponse;
  }>({ entityKey: '' });
  const detailResponse =
    detailState.entityKey === stock.entityKey ? detailState.response : undefined;
  const isLoadingDetail = Boolean(stock.entityKey && detailState.entityKey !== stock.entityKey);
  const liveDetail = resolveStockDetailForDashboard(detailResponse);
  const detailAvailability = isLoadingDetail
    ? 'collecting'
    : (liveDetail?.deepReport.status ??
      detailResponse?.availability ??
      stock.dataAvailability ??
      'collecting');
  const detailSource: ResponseMeta['source'] =
    detailResponse?.meta.source ?? stock.dataSource ?? 'fallback';
  const hasLiveDatabaseDetail = Boolean(liveDetail && detailSource === 'database');
  const positives = hasLiveDatabaseDetail ? (liveDetail?.checkpoints ?? []) : stock.positives;
  const risks = hasLiveDatabaseDetail ? (liveDetail?.risks ?? []) : stock.risks;

  useEffect(() => {
    if (!stock.entityKey) return;

    let isMounted = true;
    const entityKey = stock.entityKey;

    void loadStockDetailResponse(entityKey).then((response) => {
      if (!isMounted) return;
      setDetailState({ entityKey, response });
    });

    return () => {
      isMounted = false;
    };
  }, [stock.entityKey]);

  return (
    <div className={styles.detail} data-reveal>
      <div className={styles.headerGrid}>
        <div className={styles.company}>
          <div className={styles.logo}>{stock.logo}</div>
          <div>
            <h3>{stock.name}</h3>
            <p>{stock.summary}</p>
            <div className={styles.tags}>
              <span className={`${styles.tag} ${styles.tagBlue}`}>{stock.ticker}</span>
              <span className={`${styles.tag} ${stock.holding ? styles.tagGreen : ''}`}>
                {stock.holding ? '보유종목' : '검색종목'}
              </span>
              <span className={`${styles.tag} ${styles.tagAmber}`}>{stock.stance}</span>
              <span className={styles.tag} data-source={stock.dataSource ?? 'fallback'}>
                {stock.dataSource === 'database' ? '전용 API' : '화면 fallback'}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.price}>
          <span>{stock.dataSource === 'database' ? '실데이터 현재가' : '목업 현재가'}</span>
          <strong>{stock.price}</strong>
          <small>
            {stock.change} · {stock.holding ? '보유 기준' : '관심 후보'}
          </small>
        </div>
      </div>

      <div className={styles.metrics}>
        {metrics.map(([label, key]) => (
          <div className={styles.metric} key={key}>
            <span>{label}</span>
            <b>{stock[key]}</b>
          </div>
        ))}
      </div>

      <LiveResearchPanel
        detail={liveDetail}
        availability={detailAvailability}
        isLoading={isLoadingDetail}
        source={detailSource}
        stock={stock}
      />

      <div className={styles.grid}>
        <section className={styles.section}>
          <h4>주요 연혁</h4>
          {stock.history.map(([year, text]) => (
            <div className={styles.timeline} key={`${stock.id}-${year}`}>
              <em>{year}</em>
              <span>{text}</span>
            </div>
          ))}
        </section>

        <section className={styles.section}>
          <h4>매출 구성</h4>
          {stock.segments.length > 0 ? (
            stock.segments.map(([label, value]) => (
              <ProgressRow key={`${stock.id}-segment-${label}`} label={label} value={value} />
            ))
          ) : (
            <p>구조화된 매출 구성은 수집중입니다. 출처 없는 숫자는 표시하지 않습니다.</p>
          )}
        </section>

        <section className={styles.section}>
          <h4>자본·주주 구조</h4>
          <p>
            {stock.capital} · {stock.shares} · 부채비율 {stock.debtRatio}
          </p>
          {stock.shareholders.length > 0 ? (
            stock.shareholders.map(([label, value]) => (
              <ProgressRow key={`${stock.id}-holder-${label}`} label={label} value={value} />
            ))
          ) : (
            <p>자본·주주 구조는 출처 수집 후 표시합니다.</p>
          )}
        </section>

        <section className={styles.section}>
          <h4>확인 포인트 / 리스크</h4>
          {positives.map((text) => (
            <p className={styles.bullet} key={`${stock.id}-positive-${text}`}>
              <CheckCircle2 aria-hidden="true" />
              <span>{text}</span>
            </p>
          ))}
          {risks.map((text) => (
            <p className={styles.bullet} key={`${stock.id}-risk-${text}`}>
              <TriangleAlert aria-hidden="true" />
              <span>{text}</span>
            </p>
          ))}
        </section>
      </div>

      <section className={styles.review}>
        <h4>{stock.holding ? '매수 당시 조건 복기' : '관심 후보 점검'}</h4>
        <div className={styles.reviewGrid}>
          <ReviewCard label={stock.holding ? '매수일' : '분류'} value={stock.review[0]} />
          <ReviewCard label="맥락" value={stock.review[1]} />
          <ReviewCard label="복기 결과" value={stock.review[2]} />
        </div>
        <p>
          {stock.dataSource === 'database'
            ? '전용 종목 API 데이터 기준으로 표시합니다. 주문 기능은 없습니다.'
            : '모든 데이터는 UI 목업용 가상/축약 데이터입니다.'}
        </p>
      </section>
    </div>
  );
}

function LiveResearchPanel({
  availability,
  detail,
  isLoading,
  source,
  stock,
}: Readonly<{
  availability: DataAvailability;
  detail?: ApiStockDetail;
  isLoading: boolean;
  source: ResponseMeta['source'];
  stock: Stock;
}>) {
  const sourceLinks = detail?.deepReport.sources ?? [];
  const reportExcerpt = detail?.deepReport.reportMarkdown
    ? summarizeMarkdown(detail.deepReport.reportMarkdown)
    : '';
  const researchedAt = formatKstDate(detail?.deepReport.researchedAt ?? stock.lastAnalyzedAt);
  const learningCards = detail?.learningCards ?? [];
  const glossaryTerms = detail?.glossaryTerms ?? [];
  const companyProfile = detail?.companyProfile;
  const companyMetricGroups = filterSourceBackedCompanyMetricGroups(detail?.companyMetrics);
  const hasCompanyData = Boolean(companyProfile) || companyMetricGroups.length > 0;
  const detailAvailability = statusLabel(availability, isLoading);
  const detailSource: ResponseMeta['source'] = source;
  const analysisJob = detail?.analysisJob;
  const analysisLabel = analysisJob
    ? analysisJobLabel(analysisJob.status, analysisJob.progressPct)
    : stock.stance;
  const learningSummary = learningCards.length
    ? `${learningCards.length}개 공부 카드 준비됨`
    : '용어·사업모델·체크리스트 학습 카드 수집중';

  return (
    <section className={styles.livePanel} data-availability={detailAvailability}>
      <div className={styles.livePanelHead}>
        <div>
          <h4>심층 리포트 · 출처 · 분석 상태</h4>
          <p>
            {stock.entityKey
              ? `${stock.entityKey} 상세 API를 기준으로 표시합니다.`
              : '전용 상세 API 연결 전에는 화면 fallback을 보존합니다.'}
          </p>
        </div>
        <div className={styles.livePanelActions}>
          <span className={styles.statusPill}>{detailAvailability}</span>
          <DataQualityPopover
            availability={detailAvailability}
            label="심층 리포트"
            placement="below"
            source={detailSource}
            testId="stock-detail-quality-popover"
            updatedAt={detail?.deepReport.researchedAt ?? stock.lastAnalyzedAt}
          />
        </div>
      </div>

      <div className={styles.liveGrid}>
        <article className={styles.liveCard}>
          <b>분석 상태</b>
          <span>{analysisLabel}</span>
          <small>
            {analysisJob?.startedAt
              ? `${formatKstDate(analysisJob.startedAt)} 시작`
              : researchedAt
                ? `${researchedAt} 갱신`
                : '갱신시각 수집중'}
          </small>
        </article>
        <article className={styles.liveCard}>
          <b>심층 리포트</b>
          <span>{reportExcerpt || (isLoading ? '상세 API 확인 중' : '리포트 원문 수집중')}</span>
        </article>
        <article className={styles.liveCard}>
          <b>공부하기</b>
          <span>{learningSummary}</span>
          <button type="button" disabled>
            <GraduationCap aria-hidden="true" />
            {learningCards.length ? '공부 카드 읽기 준비' : '공부 카드 준비중'}
          </button>
        </article>
      </div>

      {hasCompanyData ? (
        <div className={styles.companyDataBlock} data-testid="company-structured-data">
          <b>회사 구조화 데이터</b>
          <div className={styles.companyDataGrid}>
            {companyProfile ? (
              <article className={styles.companyProfileCard}>
                <span>회사 개요</span>
                <strong>{companyProfile.name ?? stock.name}</strong>
                <p>
                  {companyProfile.summaryText ??
                    '회사 개요 원문은 수집중입니다. 출처 없는 숫자는 표시하지 않습니다.'}
                </p>
                <small>
                  {[
                    companyProfile.sector,
                    companyProfile.industry,
                    companyProfile.capturedAt
                      ? `${formatKstDate(companyProfile.capturedAt)} 갱신`
                      : null,
                    statusLabel(companyProfile.status, false),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </article>
            ) : null}

            {companyMetricGroups.map((group) => (
              <article
                className={styles.companyMetricGroup}
                key={`${group.metricGroup}-${group.fiscalPeriod ?? 'latest'}`}
              >
                <div className={styles.companyMetricHead}>
                  <span>{getCompanyMetricGroupTitle(group)}</span>
                  <small>
                    {[formatKstDate(group.reportedAt), getCompanyMetricSourceSummary(group)]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
                <div className={styles.companyMetricList}>
                  {group.metrics.slice(0, 6).map((metric) => (
                    <div
                      className={styles.companyMetricItem}
                      key={`${group.metricGroup}-${metric.key}`}
                    >
                      <span>{metric.label}</span>
                      <strong>{formatCompanyMetricValue(metric, group.currency)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {learningCards.length > 0 ? (
        <div className={styles.learningBlock} data-testid="learning-cards">
          <b>
            <GraduationCap aria-hidden="true" /> 공부 카드
          </b>
          <div className={styles.learningCards}>
            {learningCards.slice(0, 3).map((card) => (
              <article
                className={styles.learningCard}
                data-availability={card.availability}
                key={card.cardKey}
              >
                <div className={styles.learningCardHead}>
                  <span>{card.section}</span>
                  <div className={styles.learningCardQuality}>
                    <StatusBadge
                      availability={card.availability}
                      className={styles.learningCardStatus}
                      label="공부 카드"
                      source={detailSource}
                      testId={`learning-card-status-${card.cardKey}`}
                    />
                    <DataQualityPopover
                      availability={card.availability}
                      label="공부 카드"
                      placement="above"
                      source={detailSource}
                      testId={`learning-card-quality-popover-${card.cardKey}`}
                      updatedAt={card.updatedAt}
                    />
                  </div>
                </div>
                <strong>{card.title}</strong>
                {card.bodyMarkdown ? <p>{summarizeMarkdown(card.bodyMarkdown)}</p> : null}
                {card.bullets.length > 0 ? (
                  <ul>
                    {card.bullets.slice(0, 3).map((bullet) => (
                      <li key={`${card.cardKey}-${bullet}`}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {glossaryTerms.length > 0 ? (
        <div className={styles.sourceBlock} data-testid="glossary-terms">
          <b>용어 사전</b>
          <ul>
            {glossaryTerms.slice(0, 5).map((term) => (
              <li key={term.term}>
                <strong>{term.term}</strong> — {term.definition}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.sourceBlock}>
        <b>
          <LinkIcon aria-hidden="true" /> 출처
        </b>
        {sourceLinks.length > 0 ? (
          <ul>
            {sourceLinks.slice(0, 4).map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="noreferrer" target="_blank">
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>출처 링크는 수집중입니다. 출처 없는 숫자는 표시하지 않습니다.</p>
        )}
      </div>

      {detail?.relatedNews.length ? (
        <div className={styles.sourceBlock}>
          <b>
            <Newspaper aria-hidden="true" /> 관련 뉴스
          </b>
          <ul>
            {detail.relatedNews.map((news) => (
              <li key={news.id}>{news.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ProgressRow({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className={styles.rowbar}>
      <b>{label}</b>
      <div className={styles.track}>
        <span data-progress-reveal style={{ width: `${value}%` }} />
      </div>
      <em>{value}%</em>
    </div>
  );
}

function ReviewCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.reviewCard}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function summarizeMarkdown(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`\-[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 260 ? `${text.slice(0, 260)}…` : text;
}

function formatKstDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}.${month}.${day}` : undefined;
}

function analysisJobLabel(status: string, progressPct: number | undefined): string {
  const progress = progressPct === undefined ? '' : ` · ${progressPct.toFixed(0)}%`;
  if (status === 'queued') return '분석 대기열 등록';
  if (status === 'running') return `분석 진행 중${progress}`;
  if (status === 'completed') return '분석 완료';
  if (status === 'failed') return '분석 실패';
  if (status === 'cancelled') return '분석 취소됨';
  return '분석 상태 확인 중';
}

function statusLabel(status: string, isLoading: boolean): DataAvailability {
  if (isLoading) return 'collecting';
  if (status === 'available') return 'available';
  if (status === 'text_only') return 'text_only';
  if (status === 'unsupported') return 'unsupported';
  if (status === 'stale') return 'stale';
  if (status === 'collecting') return 'collecting';
  if (status === 'error') return 'error';
  return 'missing';
}
