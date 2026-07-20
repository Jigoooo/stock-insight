// Ported 1:1 from apps/web/src/server/manual-portfolio.ts.
// Framework-free: returns { status, body, headers? } so the controller stays a
// thin adapter and tests can exercise every branch without HTTP.
import {
  resolveManualPortfolioMutationPolicy,
  type ManualPortfolioMutationPolicy,
} from './mutation-policy.ts';
import { requireRequestUserScope } from '../read/internal-context-store.ts';

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
  type MeBootstrapResponse,
} from '@stock-insight/contracts';

export type MutationHttpResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

// Legacy quirk preserved: this envelope (incl. generatedAt) is built once at
// module load in the web server and reused for the bare 500 body.
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

function createRouteDatabase(): RouteDatabase | undefined {
  const userScope = requireRequestUserScope();
  const database = createScopedDatabaseClient(userScope.userId, parseServerEnv());
  return database.kind === 'disabled' ? undefined : { database, userScope };
}

function unavailableResult(): MutationHttpResult {
  return {
    status: 503,
    body: {
      ...emptyManualPortfolioResponse,
      error: {
        code: 'DATABASE_WRITE_URL_NOT_CONFIGURED',
        message: '쓰기 전용 데이터베이스 연결이 설정되지 않았습니다.',
      },
      meta: { source: 'fallback', generatedAt: new Date().toISOString() },
    },
  };
}

function mutationDisabledResult(
  policy: Extract<ManualPortfolioMutationPolicy, { enabled: false }>,
): MutationHttpResult {
  return {
    status: policy.status,
    body: {
      ...emptyManualPortfolioResponse,
      error: {
        code: policy.errorCode,
        message: '원격 테스트 배포에서는 포트폴리오 변경 기능이 비활성화되어 있습니다.',
      },
      meta: { source: 'fallback', generatedAt: new Date().toISOString() },
    },
  };
}

function badRequestResult(message = '수동 입력 형식이 올바르지 않습니다.'): MutationHttpResult {
  return {
    status: 400,
    body: {
      ...emptyManualPortfolioResponse,
      error: { code: 'MANUAL_PORTFOLIO_BAD_REQUEST', message },
      meta: { source: 'fallback', generatedAt: new Date().toISOString() },
    },
  };
}

function idempotencyRequiredResult(): MutationHttpResult {
  return {
    status: 428,
    body: {
      error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key UUID가 필요합니다.' },
    },
  };
}

function idempotencyConflictResult(): MutationHttpResult {
  return {
    status: 409,
    body: {
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: '이미 처리 중이거나 다른 요청에 사용된 키입니다.',
      },
    },
  };
}

function mutationFailedResult(): MutationHttpResult {
  return { status: 500, body: emptyManualPortfolioResponse };
}

export type ManualPortfolioDeps = {
  resolvePolicy: () => ManualPortfolioMutationPolicy;
  routeDatabase: () => RouteDatabase | undefined;
};

const defaultDeps: ManualPortfolioDeps = {
  resolvePolicy: () => resolveManualPortfolioMutationPolicy(),
  routeDatabase: createRouteDatabase,
};

async function mutateManualPortfolio(
  idempotencyKeyRaw: string | undefined,
  operation: string,
  payload: unknown,
  mutation: (writeModel: ManualPortfolioWriteModel) => unknown | Promise<unknown>,
  deps: ManualPortfolioDeps,
): Promise<MutationHttpResult> {
  const policy = deps.resolvePolicy();
  if (!policy.enabled) return mutationDisabledResult(policy);

  const idempotencyKey = idempotencyKeyRaw?.trim();
  if (!idempotencyKey) return idempotencyRequiredResult();
  if (!idempotencyKeyPattern.test(idempotencyKey)) {
    return badRequestResult('Idempotency-Key 형식이 올바르지 않습니다.');
  }
  const routeDatabase = deps.routeDatabase();
  if (!routeDatabase) return unavailableResult();

  let result;
  try {
    result = await routeDatabase.database.withTransaction(async (executor) => {
      const writeExecutor: ManualPortfolioWriteExecutor = async (sql, params) =>
        (await executor.queryRows(sql, params)) as Awaited<
          ReturnType<ManualPortfolioWriteExecutor>
        >;
      const readExecutor: MeBootstrapRowQueryExecutor = async (sql, params) =>
        (await executor.queryRows(sql, params)) as Awaited<ReturnType<MeBootstrapRowQueryExecutor>>;
      const writeModel = createPostgresManualPortfolioWriteModel(
        writeExecutor,
        routeDatabase.userScope,
      );
      const readModel = createPostgresMeBootstrapReadModel(readExecutor, routeDatabase.userScope);
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
    return mutationFailedResult();
  }

  if (result.kind === 'replay') {
    return { status: 200, body: result.response, headers: { 'Idempotency-Replayed': 'true' } };
  }
  if (result.kind === 'conflict') return idempotencyConflictResult();
  return { status: 200, body: result.response };
}

export async function handleWatchlistUpsert(
  idempotencyKey: string | undefined,
  body: unknown,
  deps: ManualPortfolioDeps = defaultDeps,
): Promise<MutationHttpResult> {
  const parsed = manualWatchlistInputSchema.safeParse(body);
  if (!parsed.success) return badRequestResult();

  return mutateManualPortfolio(
    idempotencyKey,
    'watchlist.upsert',
    parsed.data,
    (writeModel) => writeModel.upsertWatchlist(parsed.data),
    deps,
  );
}

export async function handleWatchlistRemove(
  idempotencyKey: string | undefined,
  entityKey: string,
  deps: ManualPortfolioDeps = defaultDeps,
): Promise<MutationHttpResult> {
  if (!entityKey.trim()) return badRequestResult('entityKey가 필요합니다.');

  return mutateManualPortfolio(
    idempotencyKey,
    'watchlist.remove',
    { entityKey },
    (writeModel) => writeModel.removeWatchlist(entityKey),
    deps,
  );
}

export async function handlePositionUpsert(
  idempotencyKey: string | undefined,
  body: unknown,
  deps: ManualPortfolioDeps = defaultDeps,
): Promise<MutationHttpResult> {
  const parsed = manualPositionInputSchema.safeParse(body);
  if (!parsed.success) return badRequestResult();

  return mutateManualPortfolio(
    idempotencyKey,
    'position.upsert',
    parsed.data,
    (writeModel) => writeModel.upsertPosition(parsed.data),
    deps,
  );
}

export async function handlePositionClose(
  idempotencyKey: string | undefined,
  entityKey: string,
  deps: ManualPortfolioDeps = defaultDeps,
): Promise<MutationHttpResult> {
  if (!entityKey.trim()) return badRequestResult('entityKey가 필요합니다.');

  return mutateManualPortfolio(
    idempotencyKey,
    'position.close',
    { entityKey },
    (writeModel) => writeModel.closePosition(entityKey),
    deps,
  );
}
