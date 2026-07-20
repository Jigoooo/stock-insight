import '@tanstack/react-start/server-only';

import { jsonResponse } from './http.ts';
import {
  resolveManualPortfolioMutationPolicy,
  routeManualPortfolioMutation,
  type ManualPortfolioMutationPolicy,
} from './mutation-policy.ts';
import { RequestScopeError, resolveRequestUserId } from './request-scope.ts';

import {
  claimMutation,
  completeMutation,
  createScopedDatabaseClient,
  createPostgresManualPortfolioWriteModel,
  createPostgresMeBootstrapReadModel,
  getManualPortfolioBootstrapAfterMutation,
  parseServerEnv,
  type ManualPortfolioWriteExecutor,
  type ManualPortfolioWriteModel,
  type MeBootstrapRowQueryExecutor,
} from '@stock-insight/api';
import {
  manualPositionInputSchema,
  manualWatchlistInputSchema,
  type ManualPositionInput,
  type ManualWatchlistInput,
  type MeBootstrapResponse,
} from '@stock-insight/contracts';

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

type RouteDatabase = {
  database: Extract<ReturnType<typeof createScopedDatabaseClient>, { kind: 'configured' }>;
  userScope: { userId: string };
};

function createRouteDatabase(userId: string): RouteDatabase | undefined {
  const env = parseServerEnv();
  const database = createScopedDatabaseClient(userId, env);
  return database.kind === 'disabled' ? undefined : { database, userScope: { userId } };
}

function unavailableResponse() {
  return jsonResponse(
    {
      ...emptyManualPortfolioResponse,
      error: {
        code: 'DATABASE_WRITE_URL_NOT_CONFIGURED',
        message: '쓰기 전용 데이터베이스 연결이 설정되지 않았습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 503 },
  );
}

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

function idempotencyConflictResponse() {
  return jsonResponse(
    {
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: '이미 처리 중이거나 다른 요청에 사용된 키입니다.',
      },
    },
    { status: 409 },
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

  return mutateManualPortfolio(request, 'watchlist.upsert', parsed.data, (writeModel) =>
    writeModel.upsertWatchlist(parsed.data),
  );
}

export async function handleWatchlistRemove(
  request: Request,
  entityKey: string,
): Promise<Response> {
  if (!entityKey.trim()) return badRequestResponse('entityKey가 필요합니다.');

  return mutateManualPortfolio(request, 'watchlist.remove', { entityKey }, (writeModel) =>
    writeModel.removeWatchlist(entityKey),
  );
}

export async function handlePositionUpsert(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = manualPositionInputSchema.safeParse(body);
  if (!parsed.success) return badRequestResponse();

  return mutateManualPortfolio(request, 'position.upsert', parsed.data, (writeModel) =>
    writeModel.upsertPosition(parsed.data),
  );
}

export async function handlePositionClose(request: Request, entityKey: string): Promise<Response> {
  if (!entityKey.trim()) return badRequestResponse('entityKey가 필요합니다.');

  return mutateManualPortfolio(request, 'position.close', { entityKey }, (writeModel) =>
    writeModel.closePosition(entityKey),
  );
}

async function mutateManualPortfolio(
  request: Request,
  operation: string,
  payload: unknown,
  mutation: (writeModel: ManualPortfolioWriteModel) => unknown | Promise<unknown>,
): Promise<Response> {
  const policy = resolveManualPortfolioMutationPolicy();
  return routeManualPortfolioMutation(policy, {
    disabled: mutationDisabledResponse,
    enabled: async () => {
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
      const routeDatabase = createRouteDatabase(userId);
      if (!routeDatabase) return unavailableResponse();

      let result;
      try {
        result = await routeDatabase.database.withTransaction(async (executor) => {
          const writeExecutor: ManualPortfolioWriteExecutor = async (sql, params) =>
            (await executor.queryRows(sql, params)) as Awaited<
              ReturnType<ManualPortfolioWriteExecutor>
            >;
          const readExecutor: MeBootstrapRowQueryExecutor = async (sql, params) =>
            (await executor.queryRows(sql, params)) as Awaited<
              ReturnType<MeBootstrapRowQueryExecutor>
            >;
          const writeModel = createPostgresManualPortfolioWriteModel(
            writeExecutor,
            routeDatabase.userScope,
          );
          const readModel = createPostgresMeBootstrapReadModel(
            readExecutor,
            routeDatabase.userScope,
          );
          const claim = await claimMutation(executor, {
            userScope: routeDatabase.userScope,
            idempotencyKey,
            operation,
            payload,
          });
          if (claim.kind !== 'execute') return claim;

          const response = await getManualPortfolioBootstrapAfterMutation({
            mutation: () => mutation(writeModel),
            readModel,
            failureMode: 'throw',
          });
          await completeMutation(executor, claim, response);
          return { kind: 'completed' as const, response };
        });
      } catch {
        return mutationFailedResponse();
      }

      if (result.kind === 'replay') {
        return jsonResponse(result.response, { headers: { 'Idempotency-Replayed': 'true' } });
      }
      if (result.kind === 'conflict') return idempotencyConflictResponse();
      return jsonResponse(result.response);
    },
  });
}

export type { ManualPositionInput, ManualWatchlistInput };
