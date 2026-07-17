import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDashboardBootstrap } from '../src/pages/dashboard/model/resolve-dashboard-bootstrap.ts';
import type { DashboardBootstrap, DashboardResponse } from '@stock-insight/contracts';

const fallback: DashboardBootstrap = {
  portfolio: {
    value: 'fallback-value',
    dailyChange: 'fallback-change',
    relatedIssueCount: 0,
    focusTheme: 'fallback-theme',
    scheduleCount: 0,
    cautionLevel: '낮음',
    bars: [1, 2, 3],
    trend: [{ label: 'fallback', value: 1 }],
    themeShare: [{ id: 'fallback', label: 'fallback', value: 100, colorRole: 'reserve' }],
  },
  insights: [],
  stocks: [
    {
      id: 'fallback-stock',
      holding: false,
      ticker: 'FALL',
      name: 'Fallback Stock',
      logo: 'F',
      theme: 'fallback',
      price: '수집중',
      change: '0%',
      stance: '수집중',
      summary: 'fallback summary',
      founded: '수집중',
      hq: '수집중',
      capital: '수집중',
      shares: '수집중',
      marketCap: '수집중',
      sales: '수집중',
      operatingProfit: '수집중',
      debtRatio: '수집중',
      roe: '수집중',
      segments: [],
      shareholders: [],
      history: [],
      positives: [],
      risks: [],
      review: ['수집중', '수집중', '수집중'],
    },
  ],
  themes: [],
};

const databaseBootstrap: DashboardBootstrap = {
  ...fallback,
  portfolio: {
    ...fallback.portfolio,
    value: 'database-value',
    focusTheme: 'database-theme',
  },
  stocks: [
    {
      ...fallback.stocks[0]!,
      id: 'database-stock',
      ticker: 'DB',
      name: 'Database Stock',
    },
  ],
};

describe('resolveDashboardBootstrap', () => {
  it('uses database dashboard data when the loader returns an available database envelope', () => {
    const response: DashboardResponse = {
      meta: { source: 'database', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'available',
      error: null,
      data: databaseBootstrap,
    };

    const resolved = resolveDashboardBootstrap(response, fallback);

    assert.equal(resolved.bootstrap.portfolio.value, 'database-value');
    assert.equal(resolved.bootstrap.stocks[0]?.id, 'database-stock');
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'available');
    assert.equal(resolved.isLiveData, true);
  });

  it('keeps the local fallback dashboard when the loader returns collecting fallback data', () => {
    const response: DashboardResponse = {
      meta: { source: 'fallback', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'collecting',
      error: null,
      data: databaseBootstrap,
    };

    const resolved = resolveDashboardBootstrap(response, fallback);

    assert.equal(resolved.bootstrap.portfolio.value, 'fallback-value');
    assert.equal(resolved.bootstrap.stocks[0]?.id, 'fallback-stock');
    assert.equal(resolved.source, 'fallback');
    assert.equal(resolved.availability, 'collecting');
    assert.equal(resolved.isLiveData, false);
  });

  it('does not expose stale database dashboard content as live data', () => {
    const response: DashboardResponse = {
      meta: { source: 'database', generatedAt: '2026-07-06T00:00:00.000Z' },
      availability: 'stale',
      error: null,
      data: databaseBootstrap,
    };

    const resolved = resolveDashboardBootstrap(response, fallback);

    assert.equal(resolved.bootstrap.portfolio.value, 'fallback-value');
    assert.equal(resolved.bootstrap.stocks[0]?.id, 'fallback-stock');
    assert.equal(resolved.source, 'database');
    assert.equal(resolved.availability, 'stale');
    assert.equal(resolved.isLiveData, false);
  });

  it('keeps the local fallback dashboard when the loader failed before returning a response', () => {
    const resolved = resolveDashboardBootstrap(undefined, fallback);

    assert.equal(resolved.bootstrap.portfolio.value, 'fallback-value');
    assert.equal(resolved.source, 'fallback');
    assert.equal(resolved.availability, 'collecting');
    assert.equal(resolved.isLiveData, false);
  });
});
