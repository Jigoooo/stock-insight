import type { MeBootstrapReadModel } from './read-model';
import {
  meBootstrapResponseSchema,
  type MeBootstrap,
  type MeBootstrapResponse,
} from '@stock-insight/contracts';

export type { ManualPortfolioWriteModel } from './manual-input';

const emptyMeBootstrap: MeBootstrap = {
  user: { id: 'default', label: '기본 사용자' },
  watchlist: [],
  positions: [],
  preferences: { defaultMarket: 'KR', defaultScope: 'watchlist' },
};

export type ManualPortfolioMutationOptions = {
  mutation: () => unknown | Promise<unknown>;
  now?: Date;
  readModel: MeBootstrapReadModel;
  failureMode?: 'fallback' | 'throw';
};

export async function getManualPortfolioBootstrapAfterMutation({
  mutation,
  now,
  readModel,
  failureMode = 'fallback',
}: ManualPortfolioMutationOptions): Promise<MeBootstrapResponse> {
  const generatedAt = (now ?? new Date()).toISOString();

  try {
    await mutation();
    const data = await readModel.loadMeBootstrap();

    return meBootstrapResponseSchema.parse({
      data,
      availability: 'available',
      error: null,
      meta: {
        source: 'database',
        generatedAt,
      },
    });
  } catch (error) {
    if (failureMode === 'throw') throw error;
    return meBootstrapResponseSchema.parse({
      data: emptyMeBootstrap,
      availability: 'error',
      error: {
        code: 'MANUAL_PORTFOLIO_WRITE_FAILED',
        message: '수동 포트폴리오 입력을 저장하는 중 오류가 발생했습니다.',
      },
      meta: {
        source: 'fallback',
        generatedAt,
      },
    });
  }
}
