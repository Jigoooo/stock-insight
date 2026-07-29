import '@tanstack/react-start/server-only';

import { BrainRequestError, brainRequest, type BrainQuery } from './brain-client.ts';
import { jsonResponse } from './http.ts';
import {
  RequestScopeError,
  resolveRequestUserId,
  unauthorizedScopeResponse,
} from './request-scope.ts';

// Shared adapter for the /api/* read routes. Each one used to open its own
// PostgreSQL client; they are now thin proxies onto the brain that preserve the
// exact status codes and JSON envelopes clients already depend on.

export type BrainProxyOptions = Readonly<{
  // Maps the incoming request's search params onto the brain query. Return
  // undefined to reject the request with a 400 before any network call.
  query?: (params: URLSearchParams) => BrainQuery | undefined;
  // Body returned when `query` rejects; defaults to the legacy invalid-query shape.
  invalidQueryBody?: unknown;
  extraHeaders?: Record<string, string>;
}>;

/**
 * Builds a GET handler that forwards to `brainPath` under the caller's verified
 * user scope. Auth failures answer 401 without leaking user existence, and brain
 * errors are passed through with their original status + body so error codes
 * such as `geo_snapshot_mismatch` survive the hop.
 */
export function brainProxyGet(
  brainPath: string | ((params: URLSearchParams) => string),
  options: BrainProxyOptions = {},
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const params = new URL(request.url).searchParams;

    let query: BrainQuery | undefined;
    if (options.query) {
      query = options.query(params);
      if (query === undefined) {
        return jsonResponse(options.invalidQueryBody ?? { error: 'invalid_query' }, {
          status: 400,
        });
      }
    }

    let userId: string;
    try {
      userId = await resolveRequestUserId(request);
    } catch (error) {
      if (error instanceof RequestScopeError) return unauthorizedScopeResponse();
      throw error;
    }

    const path = typeof brainPath === 'string' ? brainPath : brainPath(params);
    try {
      const data = await brainRequest(path, {
        scope: { kind: 'user', userId },
        ...(query === undefined ? {} : { query }),
      });
      return jsonResponse(data, options.extraHeaders ? { headers: options.extraHeaders } : {});
    } catch (error) {
      if (error instanceof BrainRequestError && error.body !== undefined) {
        return jsonResponse(error.body, { status: error.status });
      }
      throw error;
    }
  };
}

/** Narrows a repeated search param to its first value, matching legacy `get()`. */
export function firstParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value.trim() === '' ? undefined : value;
}
