import { CheckCircle2, TriangleAlert } from 'lucide-react';

import styles from './stock-detail.module.css';

import type { Stock } from '../model/types';

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
            </div>
          </div>
        </div>
        <div className={styles.price}>
          <span>목업 현재가</span>
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
          {stock.segments.map(([label, value]) => (
            <ProgressRow key={`${stock.id}-segment-${label}`} label={label} value={value} />
          ))}
        </section>

        <section className={styles.section}>
          <h4>자본·주주 구조</h4>
          <p>
            {stock.capital} · {stock.shares} · 부채비율 {stock.debtRatio}
          </p>
          {stock.shareholders.map(([label, value]) => (
            <ProgressRow key={`${stock.id}-holder-${label}`} label={label} value={value} />
          ))}
        </section>

        <section className={styles.section}>
          <h4>확인 포인트 / 리스크</h4>
          {stock.positives.map((text) => (
            <p className={styles.bullet} key={`${stock.id}-positive-${text}`}>
              <CheckCircle2 aria-hidden="true" />
              <span>{text}</span>
            </p>
          ))}
          {stock.risks.map((text) => (
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
        <p>모든 데이터는 UI 목업용 가상/축약 데이터입니다.</p>
      </section>
    </div>
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
