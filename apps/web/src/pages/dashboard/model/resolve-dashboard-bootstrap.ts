import type {
  DataAvailability,
  DashboardBootstrap,
  DashboardResponse,
} from '@stock-insight/contracts';

export type ResolvedDashboardBootstrap = {
  bootstrap: DashboardBootstrap;
  source: DashboardResponse['meta']['source'];
  availability: DataAvailability;
  isLiveData: boolean;
};

export function resolveDashboardBootstrap(
  response: DashboardResponse | undefined,
  fallback: DashboardBootstrap,
): ResolvedDashboardBootstrap {
  if (response?.availability === 'available' && response.meta.source === 'database') {
    return {
      bootstrap: response.data,
      source: response.meta.source,
      availability: response.availability,
      isLiveData: true,
    };
  }

  return {
    bootstrap: fallback,
    source: response?.meta.source ?? 'fallback',
    availability: response?.availability ?? 'collecting',
    isLiveData: false,
  };
}
