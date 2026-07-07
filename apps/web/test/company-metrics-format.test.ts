import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  filterSourceBackedCompanyMetricGroups,
  formatCompanyMetricValue,
  getCompanyMetricGroupTitle,
  getCompanyMetricSourceSummary,
} from '../src/entities/stock/model/format-company-metrics.ts';
import type { StockCompanyMetricGroup } from '@stock-insight/contracts';

const groups: StockCompanyMetricGroup[] = [
  {
    metricGroup: 'market_snapshot',
    fiscalPeriod: 'latest',
    currency: 'USD',
    availability: 'available',
    reportedAt: '2026-07-06T00:00:00.000Z',
    sources: [{ label: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/NVDA' }],
    metrics: [
      { key: 'latestPrice', label: '현재가', value: 196.52, unit: 'currency' },
      { key: 'changePct', label: '등락률', value: 0.87, unit: 'percent' },
      { key: 'rsi14', label: 'RSI(14)', value: 41.9, unit: 'score' },
      { key: 'volume', label: '거래량', value: 51535676, unit: 'shares' },
    ],
  },
  {
    metricGroup: 'financial_statement',
    fiscalPeriod: 'FY',
    availability: 'available',
    sources: [],
    metrics: [{ key: 'revenue', label: '매출', value: 999, unit: 'currency' }],
  },
];

describe('company metric display helpers', () => {
  it('keeps only available metric groups that have sources and metrics', () => {
    const filtered = filterSourceBackedCompanyMetricGroups(groups);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.metricGroup, 'market_snapshot');
    assert.equal(filtered[0]?.sources[0]?.label, 'Yahoo Finance');
  });

  it('formats source-backed market metric values without pretending units', () => {
    const [group] = groups;
    assert.equal(getCompanyMetricGroupTitle(group!), '출처 기반 시장지표');
    assert.equal(getCompanyMetricSourceSummary(group!), 'Yahoo Finance');
    assert.equal(formatCompanyMetricValue(group!.metrics[0]!, group!.currency), '$196.52');
    assert.equal(formatCompanyMetricValue(group!.metrics[1]!, group!.currency), '+0.87%');
    assert.equal(formatCompanyMetricValue(group!.metrics[2]!, group!.currency), '41.9');
    assert.equal(formatCompanyMetricValue(group!.metrics[3]!, group!.currency), '51,535,676주');
  });
});
