import '@tanstack/react-start/server-only';

import {
  createReadOnlyDatabaseClient,
  getCalibrationScorecard,
  getFeatureSnapshots,
  getImpactSummaries,
  getLatestReports,
  getMarketConfirmations,
  getPersonalizedFeed,
  parseServerEnv,
  requireUserScope,
} from '@stock-insight/api';

function context() {
  const env = parseServerEnv();
  const userScope = requireUserScope(env);
  const database = createReadOnlyDatabaseClient(env);
  if (database.kind === 'disabled') throw new Error('Research database is not configured');
  return { database, userScope };
}

export async function loadFeatureSnapshots(options: { entityKey?: string; limit?: number }) {
  const { database } = context();
  return database.withReadSnapshot((executor) => getFeatureSnapshots(executor, options));
}

export async function loadImpactSummaries(options: { entityKey?: string; limit?: number }) {
  const { database } = context();
  return database.withReadSnapshot((executor) => getImpactSummaries(executor, options));
}

export async function loadMarketConfirmations(options: { entityKey?: string; limit?: number }) {
  const { database } = context();
  return database.withReadSnapshot((executor) => getMarketConfirmations(executor, options));
}

export async function loadPersonalizedFeed(feedDate?: string) {
  const { database, userScope } = context();
  return database.withReadSnapshot((executor) =>
    getPersonalizedFeed(executor, { userScope, ...(feedDate ? { feedDate } : {}) }),
  );
}

export async function loadCalibrationScorecard() {
  const { database } = context();
  return database.withReadSnapshot((executor) => getCalibrationScorecard(executor));
}

export async function loadLatestReports(options: {
  reportType?: string;
  scopeKey?: string;
  limit?: number;
}) {
  const { database } = context();
  return database.withReadSnapshot((executor) => getLatestReports(executor, options));
}
