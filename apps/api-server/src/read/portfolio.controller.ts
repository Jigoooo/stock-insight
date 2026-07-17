import { Controller, Get, Query } from '@nestjs/common';

import { scopedRowQuery } from './read-context.ts';
import { firstParam } from '../common/http.ts';

import { createPostgresPortfolioDigestReadModel, getPortfolioDigest } from '@stock-insight/api';

@Controller('portfolio')
export class PortfolioController {
  @Get('digest')
  async getDigest(@Query('userId') _userId?: string | string[]) {
    void firstParam(_userId); // Nitro ignores unknown params; keep signature documentation-only.
    const ctx = scopedRowQuery();
    const readModel = ctx
      ? createPostgresPortfolioDigestReadModel(ctx.queryRows, ctx.userScope)
      : undefined;
    return getPortfolioDigest({ readModel });
  }
}
