import { Controller, Get, Query } from '@nestjs/common';

import { unscopedRowQuery } from './read-context.ts';
import { firstParam } from '../common/http.ts';

import { createPostgresMarketNewsReadModel, getMarketNews } from '@stock-insight/api';
import { marketNewsQuerySchema } from '@stock-insight/contracts';

@Controller('market-news')
export class MarketNewsController {
  @Get()
  async getNews(
    @Query('market') market?: string | string[],
    @Query('type') type?: string | string[],
  ) {
    // Nitro route: schema.parse — invalid input throws. Status parity (500) is
    // preserved; the 5xx BODY differs from Nitro's (NestJS default error shape).
    // Accepted: 5xx bodies are not part of the read-parity contract.
    const query = marketNewsQuerySchema.parse({
      market: firstParam(market) ?? undefined,
      type: firstParam(type) ?? undefined,
    });
    const ctx = unscopedRowQuery();
    const readModel = ctx ? createPostgresMarketNewsReadModel(ctx.queryRows) : undefined;
    return getMarketNews({ query, readModel });
  }
}
