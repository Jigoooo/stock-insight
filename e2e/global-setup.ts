import {
  acquireAuthenticatedE2eFixtureLease,
  applyAuthenticatedE2eFixtures,
  cleanupAuthenticatedE2eFixtures,
  releaseAuthenticatedE2eFixtureLease,
} from '../apps/api/src/testing/e2e-fixtures.ts';

export default async function globalSetup() {
  if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
    throw new Error('PLAYWRIGHT_STORAGE_STATE is required for authenticated E2E');
  }
  const lease = await acquireAuthenticatedE2eFixtureLease();
  try {
    const result = await applyAuthenticatedE2eFixtures(lease);
    console.log(
      `Authenticated E2E fixtures ready: feed=${result.feedRows}, history=${result.historyRows}`,
    );
  } catch (error) {
    await releaseAuthenticatedE2eFixtureLease(lease);
    throw error;
  }

  return async () => {
    try {
      await cleanupAuthenticatedE2eFixtures(lease);
      console.log('Authenticated E2E fixtures cleaned');
    } finally {
      await releaseAuthenticatedE2eFixtureLease(lease);
    }
  };
}
