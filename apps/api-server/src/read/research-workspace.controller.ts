import { Controller, Get, Param, Query } from '@nestjs/common';

import { researchContext } from './read-context.ts';
import { apiError, firstParam } from '../common/http.ts';

import {
  getDecisionHistory,
  getEntityRelationsWithV2Preference,
  getMarketTopicNews,
  getMyResearchOverview,
  getRadarSignals,
  getResearchFeedPage,
  getResearchRecordDetail,
  getSystemStatus,
  getThemeResearchList,
  getWorkspaceViewBundleV2,
  getWorkspaceShellSummary,
  getWorkspaceToday,
  parseWorkspaceViewBundleQuery,
} from '@stock-insight/api';
import { workspaceReadViewSchema } from '@stock-insight/contracts/workspace-read-v2';

// Mirrors apps/web/src/routes/api/entities/$entityKey/relations.ts
const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

function parsePagination(
  cursorRaw: string | string[] | undefined,
  limitRaw: string | string[] | undefined,
  defaultLimit: number,
): { cursor?: string; limit: number } | undefined {
  const cursor = firstParam(cursorRaw) ?? undefined;
  const limitText = firstParam(limitRaw);
  const limit = limitText === undefined ? defaultLimit : Number(limitText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor?.length ?? 0) > 1_024) {
    return undefined;
  }
  return cursor === undefined ? { limit } : { cursor, limit };
}

@Controller()
export class ResearchWorkspaceController {
  @Get('workspace/views/:view')
  async getWorkspaceView(
    @Param('view') viewRaw: string,
    @Query() queryRaw: Record<string, string | string[] | undefined>,
  ) {
    const parsedView = workspaceReadViewSchema.safeParse(viewRaw);
    if (!parsedView.success) throw apiError('invalid_workspace_view', 400);

    let query: ReturnType<typeof parseWorkspaceViewBundleQuery>;
    try {
      query = parseWorkspaceViewBundleQuery(
        parsedView.data,
        Object.fromEntries(
          Object.entries(queryRaw).map(([key, value]) => [key, firstParam(value)]),
        ),
      );
    } catch {
      throw apiError('invalid_workspace_view_query', 400);
    }

    try {
      const { withSnapshot, userScope } = researchContext();
      const bundle = await withSnapshot((executor) =>
        getWorkspaceViewBundleV2(executor, {
          userScope,
          view: parsedView.data,
          query,
        }),
      );
      if (bundle.view === 'today' && query.record && bundle.defaultRecord === null) {
        throw apiError('record_not_found', 404);
      }
      return bundle;
    } catch (error) {
      if (error instanceof Error && error.message === 'Radar cursor is invalid') {
        throw apiError('invalid_radar_cursor', 400);
      }
      if (error instanceof Error && error.message === 'History cursor is invalid') {
        throw apiError('invalid_history_cursor', 400);
      }
      throw error;
    }
  }

  @Get('workspace')
  async getWorkspace() {
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) => getWorkspaceToday(executor, { userScope }));
  }

  @Get('workspace/shell')
  async getWorkspaceShell() {
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) => getWorkspaceShellSummary(executor, { userScope }));
  }

  @Get('status')
  async getStatus() {
    const { withSnapshot } = researchContext();
    return withSnapshot((executor) => getSystemStatus(executor));
  }

  // Unscoped by nature: these events attach to no company, so there is nothing
  // for a user scope to filter. It still runs through withSnapshot so the read
  // stays inside the same READ ONLY transaction as every other surface.
  @Get('market-topic-news')
  async getMarketTopicNewsPage() {
    const { withSnapshot } = researchContext();
    return withSnapshot((executor) => getMarketTopicNews(executor));
  }

  @Get('themes')
  async getThemes() {
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) => getThemeResearchList(executor, { userScope }));
  }

  @Get('my-research')
  async getMyResearch() {
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) => getMyResearchOverview(executor, { userScope }));
  }

  @Get('feed')
  async getFeed(
    @Query('lane') laneRaw?: string | string[],
    @Query('limit') limitRaw?: string | string[],
    @Query('cursor') cursorRaw?: string | string[],
  ) {
    const lane = firstParam(laneRaw) ?? 'for_you';
    const cursor = firstParam(cursorRaw) ?? undefined;
    const limit = Number(firstParam(limitRaw) ?? '24');
    if (
      (lane !== 'must_know' && lane !== 'for_you' && lane !== 'explore') ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (cursor !== undefined && cursor.length > 1_024)
    ) {
      throw apiError('invalid_feed_query', 400);
    }
    try {
      const { withSnapshot, userScope } = researchContext();
      return await withSnapshot((executor) =>
        getResearchFeedPage(executor, {
          userScope,
          lane,
          limit,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('cursor')) {
        throw apiError('invalid_feed_cursor', 400);
      }
      throw error;
    }
  }

  @Get('radar')
  async getRadar(
    @Query('cursor') cursorRaw?: string | string[],
    @Query('limit') limitRaw?: string | string[],
  ) {
    const page = parsePagination(cursorRaw, limitRaw, 20);
    if (!page) throw apiError('invalid_radar_query', 400);
    try {
      const { withSnapshot, userScope } = researchContext();
      return await withSnapshot((executor) => getRadarSignals(executor, { userScope, ...page }));
    } catch (error) {
      if (error instanceof Error && error.message === 'Radar cursor is invalid') {
        throw apiError('invalid_radar_cursor', 400);
      }
      throw error;
    }
  }

  @Get('history')
  async getHistory(
    @Query('cursor') cursorRaw?: string | string[],
    @Query('limit') limitRaw?: string | string[],
  ) {
    const page = parsePagination(cursorRaw, limitRaw, 20);
    if (!page) throw apiError('invalid_history_query', 400);
    try {
      const { withSnapshot, userScope } = researchContext();
      return await withSnapshot((executor) => getDecisionHistory(executor, { userScope, ...page }));
    } catch (error) {
      if (error instanceof Error && error.message === 'History cursor is invalid') {
        throw apiError('invalid_history_cursor', 400);
      }
      throw error;
    }
  }

  @Get('records/:recordKey')
  async getRecord(@Param('recordKey') recordKey: string) {
    if (!recordKey.trim() || recordKey.length > 320) {
      throw apiError('invalid_record_key', 400);
    }
    const { withSnapshot, userScope } = researchContext();
    const detail = await withSnapshot((executor) =>
      getResearchRecordDetail(executor, { userScope, recordKey }),
    );
    if (!detail) throw apiError('record_not_found', 404);
    return detail;
  }

  @Get('entities/:entityKey/relations')
  async getRelations(
    @Param('entityKey') entityKey: string,
    @Query('depth') depthRaw?: string | string[],
  ) {
    const depth = Number(firstParam(depthRaw) ?? '1');
    if (!entityKeyPattern.test(entityKey) || !Number.isInteger(depth) || depth < 1 || depth > 2) {
      throw apiError('invalid_relation_query', 400);
    }
    const { withSnapshot, userScope } = researchContext();
    const result = await withSnapshot((executor) =>
      getEntityRelationsWithV2Preference(executor, {
        entityKey,
        depth,
        userId: userScope.userId,
        now: new Date(),
      }),
    );
    if (!result.graph) throw apiError('entity_not_found', 404);
    return result.graph;
  }
}
