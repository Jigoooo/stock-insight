import '@tanstack/react-start/server-only';

import { jsonResponse } from '@/server/http';

import {
  createDatabaseClient,
  createPostgresManualPortfolioWriteModel,
  createPostgresMeBootstrapReadModel,
  getManualPortfolioBootstrapAfterMutation,
  type ManualPortfolioWriteModel,
  type MeBootstrapReadModel,
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

type RouteModels = {
  readModel: MeBootstrapReadModel;
  writeModel: ManualPortfolioWriteModel;
};

function createRouteModels(): RouteModels | undefined {
  const db = createDatabaseClient();
  if (db.kind === 'disabled') return undefined;

  const executor = (sql: string, params: readonly unknown[]) => db.queryRows(sql, params);
  return {
    readModel: createPostgresMeBootstrapReadModel(executor),
    writeModel: createPostgresManualPortfolioWriteModel(executor),
  };
}

function unavailableResponse() {
  return jsonResponse(
    {
      ...emptyManualPortfolioResponse,
      error: {
        code: 'DATABASE_URL_NOT_CONFIGURED',
        message: '데이터베이스 연결이 설정되지 않았습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 503 },
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

  return mutateManualPortfolio((writeModel) => writeModel.upsertWatchlist(parsed.data));
}

export async function handleWatchlistRemove(entityKey: string): Promise<Response> {
  if (!entityKey.trim()) return badRequestResponse('entityKey가 필요합니다.');

  return mutateManualPortfolio((writeModel) => writeModel.removeWatchlist(entityKey));
}

export async function handlePositionUpsert(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = manualPositionInputSchema.safeParse(body);
  if (!parsed.success) return badRequestResponse();

  return mutateManualPortfolio((writeModel) => writeModel.upsertPosition(parsed.data));
}

export async function handlePositionClose(entityKey: string): Promise<Response> {
  if (!entityKey.trim()) return badRequestResponse('entityKey가 필요합니다.');

  return mutateManualPortfolio((writeModel) => writeModel.closePosition(entityKey));
}

async function mutateManualPortfolio(
  mutation: (writeModel: ManualPortfolioWriteModel) => unknown | Promise<unknown>,
): Promise<Response> {
  const models = createRouteModels();
  if (!models) return unavailableResponse();

  return jsonResponse(
    await getManualPortfolioBootstrapAfterMutation({
      mutation: () => mutation(models.writeModel),
      readModel: models.readModel,
    }),
  );
}

export type { ManualPositionInput, ManualWatchlistInput };
