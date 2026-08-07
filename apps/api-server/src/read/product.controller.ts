import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { unscopedRowQuery } from './read-context.ts';

import {
  getCalibrationScorecard,
  getFeatureSnapshots,
  getImpactBrief,
  getImpactSummaries,
  getLatestReports,
  getMarketConfirmations,
  normalizeProductLimitParam,
  normalizeProductTextParam,
} from '@stock-insight/api';

function unscopedExecutor() {
  const context = unscopedRowQuery();
  if (!context) throw new Error('Research database is not configured');
  return { queryRows: context.queryRows };
}

@Controller()
export class ProductController {
  @Get('features')
  async features(
    @Query('entityKey') entityKeyRaw?: string | string[],
    @Query('limit') limitRaw?: string | string[],
  ) {
    return getFeatureSnapshots(unscopedExecutor(), {
      entityKey: normalizeProductTextParam(entityKeyRaw),
      limit: normalizeProductLimitParam(limitRaw),
    });
  }

  @Get('impact')
  async impact(
    @Query('entityKey') entityKeyRaw?: string | string[],
    @Query('limit') limitRaw?: string | string[],
  ) {
    return getImpactSummaries(unscopedExecutor(), {
      entityKey: normalizeProductTextParam(entityKeyRaw),
      limit: normalizeProductLimitParam(limitRaw),
    });
  }

  // The v2 impact plane. `/impact` above reads serving.impact_summary_v1, which is
  // permanently empty by construction — see docs/architecture/operations/impact-plane-v1-v2.md.
  // entityKey is required here: a content pack is built for one holding, and its
  // digest is what makes a rendered claim traceable.
  @Get('impact/brief')
  async impactBrief(@Query('entityKey') entityKeyRaw?: string | string[]) {
    const entityKey = normalizeProductTextParam(entityKeyRaw);
    if (entityKey === undefined) throw new BadRequestException({ error: 'invalid_query' });
    return getImpactBrief(unscopedExecutor(), { entityKey });
  }

  @Get('confirmation')
  async confirmation(
    @Query('entityKey') entityKeyRaw?: string | string[],
    @Query('limit') limitRaw?: string | string[],
  ) {
    return getMarketConfirmations(unscopedExecutor(), {
      entityKey: normalizeProductTextParam(entityKeyRaw),
      limit: normalizeProductLimitParam(limitRaw),
    });
  }

  @Get('calibration/scorecard')
  async calibrationScorecard() {
    return getCalibrationScorecard(unscopedExecutor());
  }

  @Get('reports/latest')
  async latestReports(
    @Query('type') typeRaw?: string | string[],
    @Query('scope') scopeRaw?: string | string[],
    @Query('limit') limitRaw?: string | string[],
  ) {
    return getLatestReports(unscopedExecutor(), {
      reportType: normalizeProductTextParam(typeRaw),
      scopeKey: normalizeProductTextParam(scopeRaw),
      limit: normalizeProductLimitParam(limitRaw),
    });
  }
}
