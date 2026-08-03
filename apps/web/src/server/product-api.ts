import '@tanstack/react-start/server-only';

import { brainRequest } from './brain-client.ts';

// Product surfaces (features / impact / confirmation / calibration / reports /
// personalized feed). These used to open a scoped read-only PostgreSQL client
// per call; they now go over HTTP to the brain.

function scopeFor(userId: string) {
  return { kind: 'user' as const, userId };
}

export async function loadFeatureSnapshots(
  userId: string,
  options: { entityKey?: string; limit?: number },
) {
  return brainRequest('/v1/features', {
    scope: scopeFor(userId),
    query: { entityKey: options.entityKey, limit: options.limit },
  });
}

export async function loadImpactSummaries(
  userId: string,
  options: { entityKey?: string; limit?: number },
) {
  return brainRequest('/v1/impact', {
    scope: scopeFor(userId),
    query: { entityKey: options.entityKey, limit: options.limit },
  });
}

// Serves the v2 impact plane through impact_brief content packs. Unlike
// loadImpactSummaries above, entityKey is required: a pack belongs to one holding
// and carries the digest that makes a rendered claim traceable.
export async function loadImpactBrief(userId: string, entityKey: string) {
  return brainRequest('/v1/impact/brief', {
    scope: scopeFor(userId),
    query: { entityKey },
  });
}

export async function loadMarketConfirmations(
  userId: string,
  options: { entityKey?: string; limit?: number },
) {
  return brainRequest('/v1/confirmation', {
    scope: scopeFor(userId),
    query: { entityKey: options.entityKey, limit: options.limit },
  });
}

export async function loadPersonalizedFeed(userId: string, feedDate?: string) {
  return brainRequest('/v1/personal/feed', {
    scope: scopeFor(userId),
    query: { date: feedDate },
  });
}

export async function loadCalibrationScorecard(userId: string) {
  return brainRequest('/v1/calibration/scorecard', { scope: scopeFor(userId) });
}

export async function loadLatestReports(
  userId: string,
  options: {
    reportType?: string;
    scopeKey?: string;
    limit?: number;
  },
) {
  return brainRequest('/v1/reports/latest', {
    scope: scopeFor(userId),
    query: { type: options.reportType, scope: options.scopeKey, limit: options.limit },
  });
}
