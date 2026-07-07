import { createApiClient, type ApiClientOptions } from '@stock-insight/api-client';

type EnvSource = Record<string, string | undefined>;
type ProcessLike = { env?: EnvSource };

function getServerApiBaseUrl(): string {
  if (typeof window !== 'undefined') return '';

  const maybeProcess = (globalThis as typeof globalThis & { process?: ProcessLike }).process;
  const env = maybeProcess?.env ?? {};
  const explicitBaseUrl =
    env.STOCK_INSIGHT_API_BASE_URL ?? env.PUBLIC_APP_URL ?? env.APP_ORIGIN ?? env.URL;
  if (explicitBaseUrl?.trim()) return explicitBaseUrl.trim().replace(/\/$/, '');

  const port = env.PORT?.trim() || '3000';
  const rawHost = env.HOST?.trim() || '127.0.0.1';
  const host = rawHost === '0.0.0.0' || rawHost === '::' ? '127.0.0.1' : rawHost;
  const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

  return `http://${normalizedHost}:${port}`;
}

export function createDashboardApiClient(fetcher: typeof fetch = globalThis.fetch) {
  return createApiClient({
    fetcher,
    baseUrl: getServerApiBaseUrl(),
  } satisfies ApiClientOptions);
}
