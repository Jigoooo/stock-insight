import '@tanstack/react-start/server-only';

import { BrainRequestError, brainRequest } from './brain-client.ts';
import { jsonResponse } from './http.ts';
import {
  resolveManualPortfolioMutationPolicy,
  routeManualPortfolioMutation,
  type ManualPortfolioMutationPolicy,
} from './mutation-policy.ts';
import { RequestScopeError, resolveRequestUserId } from './request-scope.ts';

import {
  manualPositionInputSchema,
  manualWatchlistInputSchema,
  type ManualPositionInput,
  type ManualWatchlistInput,
  type MeBootstrapResponse,
} from '@stock-insight/contracts';

// Writes now go to the brain, which owns the transaction, the idempotency ledger
// and the post-mutation bootstrap read. This module keeps the legacy HTTP
// envelope so the client contract is unchanged.

const emptyManualPortfolioResponse: MeBootstrapResponse = {
  data: {
    user: { id: 'default', label: '기본 사용자' },
    watchlist: [],
    positions: [],
    preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
  },
  availability: 'error',
  error: {
    code: 'MANUAL_PORTFOLIO_WRITE_FAILED',
    message: '수동 포트폴리오 입력을 저장하는 중 오류가 발생했습니다.',
  },
  meta: {
    source: 'fallback',
    generatedAt: new Date().toISOString(),
  },
};

const idempotencyKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mutationDisabledResponse(
  policy: Extract<ManualPortfolioMutationPolicy, { enabled: false }>,
) {
  return jsonResponse(
    {
      ...emptyManualPortfolioResponse,
      error: {
        code: policy.errorCode,
        message: '원격 테스트 배포에서는 포트폴리오 변경 기능이 비활성화되어 있습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt: new Date().toISOString(),
      },
    },
    { status: policy.status },
  );
}

function badRequestResponse(message = '수동 입력 형식이 올바르지 않습니다.') {
  return jsonResponse(
    {
      ...emptyManualPortfolioResponse,
      error: {
        code: 'MANUAL_PORTFOLIO_BAD_REQUEST',
        message,
      },
      meta: {
        source: 'fallback',
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 400 },
  );
}

function idempotencyRequiredResponse() {
  return jsonResponse(
    { error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key UUID가 필요합니다.' } },
    { status: 428 },
  );
}

function unauthorizedResponse() {
  return jsonResponse(
    { error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' } },
    { status: 401 },
  );
}

function mutationFailedResponse() {
  return jsonResponse(emptyManualPortfolioResponse, { status: 500 });
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function handleWatchlistUpsert(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = manualWatchlistInputSchema.safeParse(body);
  if (!parsed.success) return badRequestResponse();
  return forwardMutation(request, 'POST', '/v1/watchlist', parsed.data);
}

export async function handleWatchlistRemove(
  request: Request,
  entityKey: string,
): Promise<Response> {
  if (!entityKey.trim()) return badRequestResponse('entityKey가 필요합니다.');
  return forwardMutation(
    request,
    'DELETE',
    `/v1/watchlist/${encodeURIComponent(entityKey)}`,
    undefined,
  );
}

export async function handlePositionUpsert(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = manualPositionInputSchema.safeParse(body);
  if (!parsed.success) return badRequestResponse();
  return forwardMutation(request, 'POST', '/v1/positions', parsed.data);
}

export async function handlePositionClose(request: Request, entityKey: string): Promise<Response> {
  if (!entityKey.trim()) return badRequestResponse('entityKey가 필요합니다.');
  return forwardMutation(
    request,
    'DELETE',
    `/v1/positions/${encodeURIComponent(entityKey)}`,
    undefined,
  );
}

async function forwardMutation(
  request: Request,
  method: 'POST' | 'DELETE',
  path: string,
  body: unknown,
): Promise<Response> {
  const policy = resolveManualPortfolioMutationPolicy();
  return routeManualPortfolioMutation(policy, {
    disabled: mutationDisabledResponse,
    enabled: async () => {
      // Idempotency is validated here as well as in the brain so a malformed key
      // never consumes a network round-trip, matching the legacy ordering where
      // 428/400 preceded any database work.
      const idempotencyKey = request.headers.get('idempotency-key')?.trim();
      if (!idempotencyKey) return idempotencyRequiredResponse();
      if (!idempotencyKeyPattern.test(idempotencyKey)) {
        return badRequestResponse('Idempotency-Key 형식이 올바르지 않습니다.');
      }
      let userId: string;
      try {
        userId = await resolveRequestUserId(request);
      } catch (error) {
        if (error instanceof RequestScopeError) return unauthorizedResponse();
        throw error;
      }

      try {
        const response = await brainRequest(path, {
          scope: { kind: 'user', userId },
          method,
          headers: { 'idempotency-key': idempotencyKey },
          ...(body === undefined ? {} : { body }),
        });
        return jsonResponse(response);
      } catch (error) {
        // The brain already speaks the legacy envelope for every expected
        // failure (409 conflict, 503 unavailable, 400 validation); pass those
        // through verbatim and only synthesize a 500 for genuine transport loss.
        if (error instanceof BrainRequestError && error.body !== undefined) {
          return jsonResponse(error.body, { status: error.status });
        }
        return mutationFailedResponse();
      }
    },
  });
}

export type { ManualPositionInput, ManualWatchlistInput };
