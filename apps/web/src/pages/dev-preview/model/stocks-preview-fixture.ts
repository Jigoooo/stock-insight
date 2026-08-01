import type { ResearchWorkspaceViewPayload } from '@/pages/research-workspace/model/workspace-view-payload';

type StocksPreviewPayload = Extract<ResearchWorkspaceViewPayload, { view: 'stocks' }>;

export const stocksPreviewFixture = {
  view: 'stocks',
  shell: {
    radarScopeTotal: 18,
    watchlistCount: 4,
  },
  stocks: {
    availability: 'available',
    data: [
      {
        entityKey: 'KR:005930',
        ticker: '005930',
        market: 'KR',
        name: '삼성전자',
        displayName: '삼성전자',
        isWatched: true,
        isHolding: true,
        latestPrice: 81200,
        currency: 'KRW',
        changePct: 1.24,
        primaryThesis: '반도체 업황과 메모리 가격 흐름을 함께 확인하는 개발용 예시입니다.',
        confidence: 'medium',
        analysisStatus: 'cached',
        lastAnalyzedAt: '2026-08-02T00:00:00.000Z',
      },
      {
        entityKey: 'US:NVDA',
        ticker: 'NVDA',
        market: 'US',
        name: 'NVIDIA',
        displayName: 'NVIDIA',
        isWatched: true,
        isHolding: false,
        latestPrice: 176.42,
        currency: 'USD',
        changePct: -0.68,
        analysisStatus: 'stale',
        lastAnalyzedAt: '2026-08-01T10:30:00.000Z',
      },
      {
        entityKey: 'KR:035420',
        ticker: '035420',
        market: 'KR',
        name: 'NAVER',
        displayName: 'NAVER',
        isWatched: false,
        isHolding: false,
        analysisStatus: 'queued',
      },
    ],
    error: null,
    meta: {
      source: 'mock',
      generatedAt: '2026-08-02T00:00:00.000Z',
    },
  },
} satisfies StocksPreviewPayload;
