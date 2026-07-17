import { Controller, Get } from '@nestjs/common';

import { scopedRowQuery } from './read-context.ts';

import { createPostgresDashboardReadModel, getDashboardBootstrap } from '@stock-insight/api';

@Controller('dashboard')
export class DashboardController {
  @Get('today')
  async getToday() {
    const ctx = scopedRowQuery();
    const readModel = ctx
      ? createPostgresDashboardReadModel(ctx.queryRows, ctx.userScope)
      : undefined;
    return getDashboardBootstrap({ readModel });
  }
}
