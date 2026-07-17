import { Body, Controller, Delete, Headers, Param, Post, Res } from '@nestjs/common';

import {
  handlePositionClose,
  handlePositionUpsert,
  handleWatchlistRemove,
  handleWatchlistUpsert,
  type MutationHttpResult,
} from './manual-portfolio.service.ts';

// Structural reply type: avoids importing fastify types directly (transitive dep).
type ReplyLike = {
  status: (code: number) => unknown;
  header: (name: string, value: string) => unknown;
};

function send(reply: ReplyLike, result: MutationHttpResult): unknown {
  reply.status(result.status);
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    reply.header(name, value);
  }
  return result.body;
}

@Controller()
export class ManualPortfolioController {
  @Post('watchlist')
  async watchlistUpsert(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: ReplyLike,
  ) {
    return send(reply, await handleWatchlistUpsert(idempotencyKey, body));
  }

  @Delete('watchlist/:entityKey')
  async watchlistRemove(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('entityKey') entityKey: string,
    @Res({ passthrough: true }) reply: ReplyLike,
  ) {
    return send(reply, await handleWatchlistRemove(idempotencyKey, entityKey));
  }

  @Post('positions')
  async positionUpsert(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: ReplyLike,
  ) {
    return send(reply, await handlePositionUpsert(idempotencyKey, body));
  }

  @Delete('positions/:entityKey')
  async positionClose(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('entityKey') entityKey: string,
    @Res({ passthrough: true }) reply: ReplyLike,
  ) {
    return send(reply, await handlePositionClose(idempotencyKey, entityKey));
  }
}
