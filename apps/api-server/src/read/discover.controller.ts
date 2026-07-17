import { Controller, Get, Query } from '@nestjs/common';

import { scopedRowQuery } from './read-context.ts';
import { firstParam } from '../common/http.ts';

import { createPostgresDiscoverStocksReadModel, getDiscoverStocks } from '@stock-insight/api';
import { discoverStocksQuerySchema } from '@stock-insight/contracts';

@Controller('discover')
export class DiscoverController {
  @Get('stocks')
  async getStocks(
    @Query('market') market?: string | string[],
    @Query('reason') reason?: string | string[],
  ) {
    const query = discoverStocksQuerySchema.parse({
      market: firstParam(market) ?? undefined,
      reason: firstParam(reason) ?? undefined,
    });
    const ctx = scopedRowQuery();
    const readModel = ctx
      ? createPostgresDiscoverStocksReadModel(ctx.queryRows, ctx.userScope)
      : undefined;
    return getDiscoverStocks({ query, readModel });
  }
}
