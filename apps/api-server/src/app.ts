import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { readFile } from 'node:fs/promises';

import { AppModule } from './app.module.ts';
import { NoStoreInterceptor } from './common/no-store.interceptor.ts';
import { parseApiServerEnv } from './config/env.ts';
import { createInternalContextInterceptor } from './read/internal-context.interceptor.ts';

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
  resolvePersonalizationMutationPolicy,
  resolveManualPortfolioMutationPolicy,
  type ManualPortfolioMutationPolicy,
  type PersonalizationMutationPolicy,
} from './write/mutation-policy.ts';
export {
  handleThesisAppend,
  type PersonalizationMutationDeps,
  type PersonalizationMutationHttpResult,
} from './personalization/personalization.service.ts';

export type CreateAppOptions = Readonly<{
  // Test/override hook: supply the internal-context signing secret directly
  // instead of reading it from the mounted secret file.
  internalContextSecret?: string;
}>;

export async function createApp(options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
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

  // Internal-context enforcement: every data route requires a fresh HMAC-signed
  // per-request scope minted by the web/BFF. The api-server is never browser
  // reachable, so a missing/invalid context fails closed with 401. The signing
  // secret is mounted as a file; without it the server refuses to start rather
  // than silently accepting unauthenticated internal traffic.
  let secret = options.internalContextSecret?.trim();
  if (!secret) {
    const env = parseApiServerEnv();
    if (!env.internalContextSecretFile) {
      throw new Error('STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE is required');
    }
    secret = (await readFile(env.internalContextSecretFile, 'utf8')).trim();
  }
  if (secret.length < 32) {
    throw new Error('Internal context secret must be at least 32 characters');
  }
  app.useGlobalInterceptors(
    createInternalContextInterceptor({
      secret: Buffer.from(secret, 'utf8'),
      // Liveness endpoints are unauthenticated: /health (no prefix) and /v1/meta.
      publicPaths: ['/health', '/v1/meta'],
    }),
  );
  app.enableShutdownHooks();

  return app;
}
