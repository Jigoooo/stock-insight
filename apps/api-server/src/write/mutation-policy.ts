// Ported 1:1 from apps/web/src/server/mutation-policy.ts (kept in sync manually;
// the policy is env-driven and read per-request).
type EnvSource = Record<string, string | undefined>;

function getDefaultEnv(): EnvSource {
  return process.env;
}

export function areManualPortfolioMutationsEnabled(source: EnvSource = getDefaultEnv()): boolean {
  return source.STOCK_INSIGHT_MUTATIONS_ENABLED === 'true';
}

export type ManualPortfolioMutationPolicy =
  | { enabled: true }
  | {
      enabled: false;
      status: 503;
      errorCode: 'MANUAL_PORTFOLIO_MUTATIONS_DISABLED';
    };

export function resolveManualPortfolioMutationPolicy(
  source: EnvSource = getDefaultEnv(),
): ManualPortfolioMutationPolicy {
  if (areManualPortfolioMutationsEnabled(source)) return { enabled: true };

  return {
    enabled: false,
    status: 503,
    errorCode: 'MANUAL_PORTFOLIO_MUTATIONS_DISABLED',
  };
}
