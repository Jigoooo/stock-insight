import { Controller, Get } from '@nestjs/common';

import { scopedRowQuery } from './read-context.ts';

import { createPostgresMeBootstrapReadModel, getMeBootstrap } from '@stock-insight/api';

@Controller('me')
export class MeController {
  @Get('bootstrap')
  async getBootstrap() {
    const ctx = scopedRowQuery();
    const readModel = ctx
      ? createPostgresMeBootstrapReadModel(ctx.queryRows, ctx.userScope)
      : undefined;
    return getMeBootstrap({ readModel });
  }
}
