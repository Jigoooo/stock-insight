import { isSecEdgarAccessBlocked, SecEdgarHttpError, type SecEdgarFetcher } from './sec-edgar.ts';

const SEC_REQUEST_INTERVAL_MS = 250;

type SecFetchDependencies = {
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

export function createSecFetcher(
  userAgent: string,
  dependencies: SecFetchDependencies = {},
): SecEdgarFetcher {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies.now ?? Date.now;
  let lastRequestAt = 0;

  return {
    async fetchJson<T>(url: string): Promise<T> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const wait = Math.max(0, SEC_REQUEST_INTERVAL_MS - (now() - lastRequestAt));
          if (wait > 0) await sleep(wait);
          lastRequestAt = now();
          const response = await fetchImpl(url, {
            headers: { Accept: 'application/json', 'User-Agent': userAgent },
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new SecEdgarHttpError(response.status, url);
          return (await response.json()) as T;
        } catch (error) {
          lastError = error;
          if (isSecEdgarAccessBlocked(error)) throw error;
          if (attempt < 3) await sleep(1000 * 2 ** attempt);
        }
      }
      throw lastError;
    },
  };
}
