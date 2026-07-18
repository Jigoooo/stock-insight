import { Controller, Get, Query } from '@nestjs/common';

import {
  getCalibrationScorecard,
  getFeatureSnapshots,
  getImpactSummaries,
  getLatestReports,
  getMarketConfirmations,
  normalizeProductLimitParam,
  normalizeProductTextParam,
} from '@stock-insight/api';

import { unscopedRowQuery } from './read-context.ts';

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
