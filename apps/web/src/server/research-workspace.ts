import '@tanstack/react-start/server-only';

import { brainRequest, brainRequestBinary } from './brain-client.ts';
import {
  orchestrateResearchWorkspaceView,
  type ResearchWorkspaceLoaders,
} from './research-workspace-orchestrator.ts';
import { createWorkspaceShellSummaryLoader } from './workspace-shell-summary-loader.ts';
import type {
  ResearchWorkspaceShellSummary,
  ResearchWorkspaceViewOptions,
} from '@/pages/research-workspace/model/workspace-view-payload';
import type {
  MyResearchOverview,
  RadarSignalPage,
} from '@stock-insight/contracts/research-workspace';

// Every read here used to open its own PostgreSQL connection. They now go over
// HTTP to the brain, so this process holds no database credentials.

function scopeFor(userId: string) {
  return { kind: 'user' as const, userId };
}

function isoOrUndefined(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export async function loadResearchWorkspace(userId: string) {
  return brainRequest('/v1/workspace', { scope: scopeFor(userId) });
}

const loadResearchWorkspaceShellCached = createWorkspaceShellSummaryLoader(async (userId) => {
  return brainRequest<ResearchWorkspaceShellSummary>('/v1/workspace/shell', {
    scope: scopeFor(userId),
  });
});

export async function loadResearchWorkspaceShell(userId: string) {
  return loadResearchWorkspaceShellCached(userId);
}

export async function loadCryptoResearchWorkspace(
  userId: string,
  options: { knownAt?: Date; limit?: number } = {},
) {
  return brainRequest('/v1/crypto/workspace', {
    scope: scopeFor(userId),
    query: {
      knownAt: isoOrUndefined(options.knownAt),
      limit: options.limit,
    },
  });
}

export async function loadResearchFeedPage(
  userId: string,
  options: {
    lane: 'must_know' | 'for_you' | 'explore';
    cursor?: string;
    limit?: number;
  },
) {
  return brainRequest('/v1/feed', {
    scope: scopeFor(userId),
    query: { lane: options.lane, cursor: options.cursor, limit: options.limit },
  });
}

export async function loadResearchRecord(userId: string, recordKey: string) {
  return brainRequest(`/v1/records/${encodeURIComponent(recordKey)}`, {
    scope: scopeFor(userId),
  });
}

export async function loadResearchStatus(userId: string) {
  return brainRequest('/v1/status', { scope: scopeFor(userId) });
}

export async function loadMarketTopicNews(userId: string) {
  return brainRequest('/v1/market-topic-news', { scope: scopeFor(userId) });
}

export async function loadDecisionHistoryPage(
  userId: string,
  options: { cursor?: string; limit?: number },
) {
  return brainRequest('/v1/history', {
    scope: scopeFor(userId),
    query: { cursor: options.cursor, limit: options.limit },
  });
}

export async function loadMyResearchOverview(userId: string) {
  return brainRequest<MyResearchOverview>('/v1/my-research', { scope: scopeFor(userId) });
}

export async function loadRadarSignalPage(
  userId: string,
  options: { cursor?: string; limit?: number },
) {
  return brainRequest<RadarSignalPage>('/v1/radar', {
    scope: scopeFor(userId),
    query: { cursor: options.cursor, limit: options.limit },
  });
}

export async function loadThemeResearch(userId: string) {
  return brainRequest('/v1/themes', { scope: scopeFor(userId) });
}

export async function loadEntityRelationGraph(
  userId: string,
  entityKey: string,
  depth: number,
  options: { knownAt?: Date } = {},
) {
  return brainRequest(`/v1/entities/${encodeURIComponent(entityKey)}/relations`, {
    scope: scopeFor(userId),
    query: { depth, knownAt: isoOrUndefined(options.knownAt) },
  });
}

export async function loadGeoSnapshot(
  userId: string,
  options: { knownAt?: Date; validAt?: Date } = {},
) {
  const requestNow = new Date();
  const knownAt = options.knownAt ?? requestNow;
  const validAt = options.validAt ?? options.knownAt ?? requestNow;
  return brainRequest('/v1/geo/snapshot', {
    scope: scopeFor(userId),
    query: { knownAt: knownAt.toISOString(), validAt: validAt.toISOString() },
  });
}

export async function loadGeoMvtTile(
  userId: string,
  options: {
    z: number;
    x: number;
    y: number;
    knownAt: Date;
    validAt: Date;
    snapshotId: string;
  },
): Promise<Uint8Array> {
  return brainRequestBinary(`/v1/geo/tiles/${options.z}/${options.x}/${options.y}`, {
    scope: scopeFor(userId),
    query: {
      snapshot: options.snapshotId,
      knownAt: options.knownAt.toISOString(),
      validAt: options.validAt.toISOString(),
    },
  });
}

export async function loadPersonalizationPortfolioSnapshot(userId: string) {
  return brainRequest('/v1/personalization/portfolio-snapshot', { scope: scopeFor(userId) });
}

export async function loadPersonalizationPortfolioImpact(userId: string, knownAt?: Date) {
  return brainRequest('/v1/personalization/portfolio-impact', {
    scope: scopeFor(userId),
    query: { knownAt: isoOrUndefined(knownAt) },
  });
}

export async function loadPersonalizationDecisionSupport(userId: string, entityKey: string) {
  return brainRequest(`/v1/personalization/decision-support/${encodeURIComponent(entityKey)}`, {
    scope: scopeFor(userId),
  });
}

export async function loadPersonalizationDecisionHistory(
  userId: string,
  entityKey: string,
  limit = 20,
) {
  return brainRequest(`/v1/personalization/decision-history/${encodeURIComponent(entityKey)}`, {
    scope: scopeFor(userId),
    query: { limit },
  });
}

export async function loadPersonalizationThesis(userId: string, entityKey: string) {
  return brainRequest(`/v1/personalization/thesis/${encodeURIComponent(entityKey)}`, {
    scope: scopeFor(userId),
  });
}

export async function loadStockList(userId: string) {
  return brainRequest('/v1/stocks', { scope: scopeFor(userId) });
}

// Composite view. Previously one PostgreSQL read-snapshot spanned every query in
// a view; that transactional boundary now lives inside the brain per endpoint,
// so a view assembled from several endpoints is no longer a single point-in-time
// snapshot. Each slice is still internally consistent.
export async function loadResearchWorkspaceView(
  userId: string,
  options: ResearchWorkspaceViewOptions,
) {
  const loaders = {
    loadCrypto: loadCryptoResearchWorkspace,
    loadDecision: loadPersonalizationDecisionSupport,
    loadDecisionHistory: loadPersonalizationDecisionHistory,
    loadGeo: loadGeoSnapshot,
    loadHistory: loadDecisionHistoryPage,
    loadImpact: loadPersonalizationPortfolioImpact,
    loadMarketTopicNews,
    loadPortfolio: loadPersonalizationPortfolioSnapshot,
    loadRadar: loadRadarSignalPage,
    loadRecord: loadResearchRecord,
    loadRelation: loadEntityRelationGraph,
    loadResearch: loadMyResearchOverview,
    loadShell: loadResearchWorkspaceShell,
    loadStatus: loadResearchStatus,
    loadStocks: loadStockList,
    loadThemes: loadThemeResearch,
    loadThesis: loadPersonalizationThesis,
    loadToday: loadResearchWorkspace,
  } as unknown as ResearchWorkspaceLoaders;
  return orchestrateResearchWorkspaceView(loaders, userId, options);
}
