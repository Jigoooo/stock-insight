import { Controller, Get, Param, Query } from '@nestjs/common';

import { scopedRowQuery, unscopedRowQuery } from './read-context.ts';
import { firstParam } from '../common/http.ts';

import {
  createPostgresPriceSeriesReadModel,
  createPostgresStockReadModel,
  getPriceSeries,
  getStockDetail,
  getStockList,
  withNamedReadQuery,
  type ReadQueryId,
  type PriceSeriesDatabaseRow,
} from '@stock-insight/api';
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

function createRouteStockReadModel(queryId: ReadQueryId) {
  const ctx = scopedRowQuery();
  return ctx
    ? createPostgresStockReadModel(
        withNamedReadQuery({ queryRows: ctx.queryRows }, queryId).queryRows,
        ctx.userScope,
      )
    : undefined;
}

function createRoutePriceSeriesReadModel() {
  const ctx = unscopedRowQuery();
  return ctx
    ? createPostgresPriceSeriesReadModel((sql, params) =>
        ctx.queryRows<PriceSeriesDatabaseRow & Record<string, unknown>>(sql, params),
      )
    : undefined;
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
      readModel: createRouteStockReadModel('stocks.list'),
    });
  }

  @Get(':entityKey')
  async getDetail(@Param('entityKey') entityKey: string) {
    return getStockDetail(entityKey, { readModel: createRouteStockReadModel('stocks.detail') });
  }

  @Get(':entityKey/prices')
  async getPrices(
    @Param('entityKey') entityKey: string,
    @Query('range') rangeRaw?: string | string[],
  ) {
    const range = firstParam(rangeRaw) ?? undefined;
    return getPriceSeries(entityKey, {
      ...(range === undefined ? {} : { range }),
      readModel: createRoutePriceSeriesReadModel(),
    });
  }
}
