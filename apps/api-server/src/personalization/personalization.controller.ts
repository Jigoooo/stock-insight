import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';

import {
  handleThesisAppend,
  type PersonalizationMutationHttpResult,
} from './personalization.service.ts';
import { apiError, firstParam } from '../common/http.ts';
import { researchContext } from '../read/read-context.ts';

import {
  getPersonalizationDecisionHistory,
  getPersonalizationDecisionSupport,
  getPersonalizationPortfolioImpact,
  getPersonalizationPortfolioSnapshot,
  getPersonalizationThesis,
} from '@stock-insight/api';

const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReplyLike = {
  status: (code: number) => unknown;
  header: (name: string, value: string) => unknown;
};

function send(reply: ReplyLike, result: PersonalizationMutationHttpResult): unknown {
  reply.status(result.status);
  for (const [name, value] of Object.entries(result.headers ?? {})) reply.header(name, value);
  return result.body;
}

function requireEntityKey(value: string): void {
  if (!entityKeyPattern.test(value)) throw apiError('invalid_personalization_entity_key', 400);
}

function parseKnownAt(value: string | string[] | undefined): Date {
  const text = firstParam(value);
  const date = text === undefined ? new Date() : new Date(text);
  if (!Number.isFinite(date.getTime())) throw apiError('invalid_personalization_known_at', 400);
  return date;
}

@Controller('personalization')
export class PersonalizationController {
  @Get('portfolio-snapshot')
  async portfolioSnapshot(@Query('snapshotId') snapshotIdRaw?: string | string[]) {
    const snapshotId = firstParam(snapshotIdRaw) ?? null;
    if (snapshotId !== null && !uuidPattern.test(snapshotId)) {
      throw apiError('invalid_portfolio_snapshot_id', 400);
    }
    const { withSnapshot, userScope } = researchContext();
    const result = await withSnapshot((executor) =>
      getPersonalizationPortfolioSnapshot(executor, { userScope, snapshotId }),
    );
    if (!result) throw apiError('portfolio_snapshot_not_found', 404);
    return result;
  }

  @Get('portfolio-impact')
  async portfolioImpact(
    @Query('eventId') eventIdRaw?: string | string[],
    @Query('scenarioId') scenarioIdRaw?: string | string[],
    @Query('horizon') horizonRaw?: string | string[],
    @Query('knownAt') knownAtRaw?: string | string[],
  ) {
    const { withSnapshot, userScope } = researchContext();
    const result = await withSnapshot((executor) =>
      getPersonalizationPortfolioImpact(executor, {
        userScope,
        eventId: firstParam(eventIdRaw) ?? null,
        scenarioId: firstParam(scenarioIdRaw) ?? null,
        horizon: firstParam(horizonRaw) ?? null,
        knownAt: parseKnownAt(knownAtRaw),
      }),
    );
    if (!result) throw apiError('portfolio_impact_not_found', 404);
    return result;
  }

  @Get('decision-support/:securityKey')
  async decisionSupport(@Param('securityKey') securityKey: string) {
    requireEntityKey(securityKey);
    const { withSnapshot, userScope } = researchContext();
    const result = await withSnapshot((executor) =>
      getPersonalizationDecisionSupport(executor, {
        userScope,
        entityKey: securityKey,
      }),
    );
    if (!result) throw apiError('decision_support_not_found', 404);
    return result;
  }

  @Get('decision-history/:securityKey')
  async decisionHistory(
    @Param('securityKey') securityKey: string,
    @Query('limit') limitRaw?: string | string[],
  ) {
    requireEntityKey(securityKey);
    const limit = Number(firstParam(limitRaw) ?? '50');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw apiError('invalid_decision_history_limit', 400);
    }
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) =>
      getPersonalizationDecisionHistory(executor, {
        userScope,
        entityKey: securityKey,
        limit,
      }),
    );
  }

  @Get('thesis/:securityKey')
  async thesis(@Param('securityKey') securityKey: string) {
    requireEntityKey(securityKey);
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) =>
      getPersonalizationThesis(executor, { userScope, entityKey: securityKey }),
    );
  }

  @Post('thesis/:securityKey')
  async appendThesis(
    @Param('securityKey') securityKey: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: ReplyLike,
  ) {
    return send(reply, await handleThesisAppend(idempotencyKey, securityKey, body));
  }
}
