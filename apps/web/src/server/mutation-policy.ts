type EnvSource = Record<string, string | undefined>;

function getDefaultEnv(): EnvSource {
  const maybeGlobalProcess = globalThis as typeof globalThis & {
    process?: { env?: EnvSource };
  };

  return maybeGlobalProcess.process?.env ?? {};
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

export function routeManualPortfolioMutation<TDisabled, TEnabled>(
  policy: ManualPortfolioMutationPolicy,
  branches: {
    disabled: (policy: Extract<ManualPortfolioMutationPolicy, { enabled: false }>) => TDisabled;
    enabled: () => TEnabled;
  },
): TDisabled | TEnabled {
  return policy.enabled ? branches.enabled() : branches.disabled(policy);
}
