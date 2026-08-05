import type { ChartBar, ChartFixture } from './chart-catalog-model';

const DAY_MS = 24 * 60 * 60 * 1_000;
const START_TIME = Date.parse('2026-01-02T00:00:00.000Z');
const NULL_VOLUME_INDEXES = new Set([19, 83, 147]);

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function createBar(index: number): ChartBar {
  const date = new Date(START_TIME + index * DAY_MS);
  const trend = index * 0.34;
  const cycle = Math.sin(index / 7) * 8.2 + Math.cos(index / 19) * 3.4;
  const gap = index % 37 === 0 ? 5.4 : index % 53 === 0 ? -4.8 : 0;
  const open = round(126 + trend + cycle + gap + ((index % 5) - 2) * 0.72);
  const close = round(open + Math.sin(index / 3) * 2.7 + ((index % 7) - 3) * 0.31);
  const high = round(Math.max(open, close) + 1.4 + (index % 4) * 0.47);
  const low = round(Math.min(open, close) - 1.2 - (index % 3) * 0.39);
  return {
    date,
    ts: date.toISOString(),
    open,
    high,
    low,
    close,
    volume: NULL_VOLUME_INDEXES.has(index) ? null : 420_000 + ((index * 97_531) % 1_360_000),
  };
}

export function createChartFixture(): ChartFixture {
  const bars = Array.from({ length: 180 }, (_, index) => createBar(index));
  return {
    entityKey: 'stock:kr:005930',
    ticker: '005930',
    market: 'KR',
    currency: 'KRW',
    asOf: bars.at(-1)!.ts,
    bars,
    evidence: [
      {
        id: 'evidence-demand',
        barIndex: 44,
        tone: 'positive',
        title: 'AI 메모리 수요 회복 근거',
        sourceCount: 4,
      },
      {
        id: 'evidence-margin',
        barIndex: 96,
        tone: 'neutral',
        title: '분기 마진 추정치 재점검',
        sourceCount: 3,
      },
      {
        id: 'evidence-supply',
        barIndex: 152,
        tone: 'risk',
        title: '공급 정상화 속도 리스크',
        sourceCount: 5,
      },
    ],
    bands: [
      {
        id: 'band-accumulation',
        startIndex: 35,
        endIndex: 61,
        low: 132,
        high: 148,
        label: '수요 확인 구간',
      },
      {
        id: 'band-risk',
        startIndex: 118,
        endIndex: 141,
        low: 158,
        high: 176,
        label: '변동성 점검 구간',
      },
    ],
  };
}

export const chartFixture = createChartFixture();
