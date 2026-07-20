import '@tanstack/react-start/server-only';

import {
  createScopedReadOnlyDatabaseClient,
  getCalibrationScorecard,
  getFeatureSnapshots,
  getImpactSummaries,
  getLatestReports,
  getMarketConfirmations,
  getPersonalizedFeed,
  parseServerEnv,
} from '@stock-insight/api';

function context(userId: string) {
  const env = parseServerEnv();
  const userScope = { userId };
  const database = createScopedReadOnlyDatabaseClient(userId, env);
  if (database.kind === 'disabled') throw new Error('Research database is not configured');
  return { database, userScope };
}

export async function loadFeatureSnapshots(
  userId: string,
  options: { entityKey?: string; limit?: number },
) {
  const { database } = context(userId);
  return database.withReadSnapshot((executor) => getFeatureSnapshots(executor, options));
}

export async function loadImpactSummaries(
  userId: string,
  options: { entityKey?: string; limit?: number },
) {
  const { database } = context(userId);
  return database.withReadSnapshot((executor) => getImpactSummaries(executor, options));
}

export async function loadMarketConfirmations(
  userId: string,
  options: { entityKey?: string; limit?: number },
) {
  const { database } = context(userId);
  return database.withReadSnapshot((executor) => getMarketConfirmations(executor, options));
}

export async function loadPersonalizedFeed(userId: string, feedDate?: string) {
  const { database, userScope } = context(userId);
  return database.withReadSnapshot((executor) =>
    getPersonalizedFeed(executor, { userScope, ...(feedDate ? { feedDate } : {}) }),
  );
}

export async function loadCalibrationScorecard(userId: string) {
  const { database } = context(userId);
  return database.withReadSnapshot((executor) => getCalibrationScorecard(executor));
}

export async function loadLatestReports(
  userId: string,
  options: {
    reportType?: string;
    scopeKey?: string;
    limit?: number;
  },
) {
  const { database } = context(userId);
  return database.withReadSnapshot((executor) => getLatestReports(executor, options));
}
