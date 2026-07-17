import { Controller, Get, Param, Query } from '@nestjs/common';

import { scopedRowQuery } from './read-context.ts';
import { firstParam } from '../common/http.ts';

import { createPostgresStockReadModel, getStockDetail, getStockList } from '@stock-insight/api';
import type { StockListQuery } from '@stock-insight/contracts';

// Mirrors apps/web parseStockListQuery: invalid values are silently dropped (no 400).
function parseStockListQuery(query: {
  market?: string | string[];
  scope?: string | string[];
  q?: string | string[];
}): StockListQuery {
  const parsed: StockListQuery = {};

  const market = firstParam(query.market);
  if (market === 'KR' || market === 'US') parsed.market = market;

  const scope = firstParam(query.scope);
  if (scope === 'watchlist' || scope === 'holding' || scope === 'discover' || scope === 'all') {
    parsed.scope = scope;
  }

  const q = firstParam(query.q)?.trim();
  if (q) parsed.q = q;

  return parsed;
}

function createRouteStockReadModel() {
  const ctx = scopedRowQuery();
  return ctx ? createPostgresStockReadModel(ctx.queryRows, ctx.userScope) : undefined;
}

@Controller('stocks')
export class StocksController {
  @Get()
  async getList(
    @Query('market') market?: string | string[],
    @Query('scope') scope?: string | string[],
    @Query('q') q?: string | string[],
  ) {
    const parsed: { market?: string | string[]; scope?: string | string[]; q?: string | string[] } =
      {};
    if (market !== undefined) parsed.market = market;
    if (scope !== undefined) parsed.scope = scope;
    if (q !== undefined) parsed.q = q;
    return getStockList({
      query: parseStockListQuery(parsed),
      readModel: createRouteStockReadModel(),
    });
  }

  @Get(':entityKey')
  async getDetail(@Param('entityKey') entityKey: string) {
    return getStockDetail(entityKey, { readModel: createRouteStockReadModel() });
  }
}
