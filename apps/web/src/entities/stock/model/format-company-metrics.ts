import type { StockCompanyMetric, StockCompanyMetricGroup } from '@stock-insight/contracts';

export function filterSourceBackedCompanyMetricGroups(
  groups: readonly StockCompanyMetricGroup[] | undefined,
): StockCompanyMetricGroup[] {
  return (groups ?? []).filter((group) => {
    if (group.availability !== 'available') return false;
    if (group.sources.length === 0 || group.metrics.length === 0) return false;
    const hasCurrencyMetric = group.metrics.some((metric) => metric.unit === 'currency');
    if (hasCurrencyMetric && !group.currency) return false;
    return true;
  });
}

export function getCompanyMetricGroupTitle(group: StockCompanyMetricGroup): string {
  if (group.metricGroup === 'market_snapshot') return '출처 기반 시장지표';
  if (group.metricGroup === 'financial_statement') return '출처 기반 재무지표';
  return group.metricGroup.replaceAll('_', ' ');
}

export function getCompanyMetricSourceSummary(group: StockCompanyMetricGroup): string {
  return group.sources
    .map((source) => source.label.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatCurrency(value: number, currency: StockCompanyMetricGroup['currency']): string {
  if (currency === 'KRW') return `₩${Math.round(value).toLocaleString('ko-KR')}`;
  if (currency === 'USD') {
    return `$${value.toLocaleString('en-US', {
      maximumFractionDigits: value >= 100 ? 2 : 2,
      minimumFractionDigits: value >= 100 ? 2 : 2,
    })}`;
  }
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export function formatCompanyMetricValue(
  metric: StockCompanyMetric,
  currency: StockCompanyMetricGroup['currency'],
): string {
  if (metric.unit === 'currency') return formatCurrency(metric.value, currency);
  if (metric.unit === 'percent') {
    const sign = metric.value > 0 ? '+' : '';
    return `${sign}${trimTrailingZeros(metric.value.toFixed(2))}%`;
  }
  if (metric.unit === 'shares') return `${Math.round(metric.value).toLocaleString('ko-KR')}주`;
  if (metric.unit === 'score') return trimTrailingZeros(metric.value.toFixed(1));
  return metric.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}
