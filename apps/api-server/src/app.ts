import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.ts';
import { NoStoreInterceptor } from './common/no-store.interceptor.ts';

export { AppModule } from './app.module.ts';
export { parseApiServerEnv, type ApiServerEnv } from './config/env.ts';
export { API_SERVER_DB, API_SERVER_ENV } from './config/tokens.ts';
export { ZodValidationPipe } from './common/zod-validation.pipe.ts';
export type { DbProbeResult, DbService } from './db/db-service.ts';
export type { HealthResponse } from './health/health.controller.ts';
export type { MetaResponse } from './meta/meta.controller.ts';
export {
  handlePositionClose,
  handlePositionUpsert,
  handleWatchlistRemove,
  handleWatchlistUpsert,
  type ManualPortfolioDeps,
  type MutationHttpResult,
} from './write/manual-portfolio.service.ts';
export {
  areManualPortfolioMutationsEnabled,
  resolveManualPortfolioMutationPolicy,
  type ManualPortfolioMutationPolicy,
} from './write/mutation-policy.ts';

export async function createApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ maxParamLength: 32_768 });

  // Legacy parity: apps/web parseJsonBody() swallows malformed/empty JSON and
  // hands `undefined` to schema validation (→ 400 MANUAL_PORTFOLIO_BAD_REQUEST
  // envelope). Fastify's default parser would answer its own 400 before the
  // controller runs. Remove the default, then register through the adapter's
  // useBodyParser so Nest marks parsers as registered and skips re-adding its
  // own JSON parser during init (which would throw FST_ERR_CTP_ALREADY_PRESENT).
  adapter.getInstance().removeContentTypeParser('application/json');
  adapter.useBodyParser(
    'application/json',
    false,
    {},
    (_req: unknown, body: Buffer, done: (error: null, result: unknown) => void) => {
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch {
        done(null, undefined);
      }
    },
  );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Legacy parity: record keys are validated in-handler (≤320 decoded chars);
    // find-my-way's maxParamLength gates on the DECODED segment (measured), and
    // any router-level cap below node's ~16KB header limit creates a 414-vs-400
    // divergence for degenerate keys (legacy always answers 400 from the handler).
    // 32768 > maxHeaderSize means node itself rejects first on BOTH servers,
    // so every reachable request gets handler-level (legacy-identical) validation.
    adapter,
    {
      logger: ['warn', 'error'],
    },
  );
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.useGlobalInterceptors(new NoStoreInterceptor());
  app.enableShutdownHooks();

  return app;
}
