import { Controller, Get, Query } from '@nestjs/common';

import { researchContext } from './read-context.ts';
import { apiError } from '../common/http.ts';

import {
  getCryptoResearchWorkspace,
  getPersonalizedFeed,
  normalizeProductTextParam,
} from '@stock-insight/api';
import { cryptoResearchQuerySchema } from '@stock-insight/contracts/crypto-research';

const CRYPTO_QUERY_KEYS = new Set(['knownAt', 'limit']);

// Mirrors apps/web parseCryptoWorkspaceQuery exactly: unknown keys, repeated
// params and out-of-range limits are rejected with 400 { error: 'invalid_query' }
// BEFORE any database work. The legacy envelope is a bare `error` string, not the
// nested `{ error: { code } }` shape the other routes use — keep it byte-identical.
function parseCryptoQuery(query: Record<string, string | string[] | undefined>): {
  knownAt: Date;
  limit: number;
} {
  if (Object.keys(query).some((key) => !CRYPTO_QUERY_KEYS.has(key))) {
    throw apiError('invalid_query', 400);
  }
  const knownAtRaw = query.knownAt;
  const limitRaw = query.limit;
  if (Array.isArray(knownAtRaw) || Array.isArray(limitRaw)) throw apiError('invalid_query', 400);
  if (limitRaw !== undefined && !/^(?:[1-9]|[1-9]\d|100)$/.test(limitRaw)) {
    throw apiError('invalid_query', 400);
  }
  const parsed = cryptoResearchQuerySchema.safeParse({
    knownAt: knownAtRaw,
    limit: limitRaw === undefined ? undefined : Number(limitRaw),
  });
  if (!parsed.success) throw apiError('invalid_query', 400);
  return {
    knownAt: parsed.data.knownAt === undefined ? new Date() : new Date(parsed.data.knownAt),
    limit: parsed.data.limit ?? 40,
  };
}

@Controller()
export class ResearchProductController {
  @Get('crypto/workspace')
  async cryptoWorkspace(@Query() query: Record<string, string | string[] | undefined>) {
    const { knownAt, limit } = parseCryptoQuery(query ?? {});
    const { withSnapshot } = researchContext();
    return withSnapshot((executor) => getCryptoResearchWorkspace(executor, { knownAt, limit }));
  }

  @Get('personal/feed')
  async personalFeed(@Query('date') dateRaw?: string | string[]) {
    // Legacy parity: apps/web reads searchParams.getAll('date') through
    // normalizeProductTextParam, which takes the FIRST value and trims it.
    const feedDate = normalizeProductTextParam(dateRaw);
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) =>
      getPersonalizedFeed(executor, {
        userScope,
        ...(feedDate === undefined ? {} : { feedDate }),
      }),
    );
  }
}
