import { Controller, Get, Param, Query } from '@nestjs/common';

import { researchContext } from './read-context.ts';
import { apiError, firstParam } from '../common/http.ts';

import {
  getDecisionHistory,
  getEntityRelations,
  getMyResearchOverview,
  getRadarSignals,
  getResearchFeedPage,
  getResearchRecordDetail,
  getSystemStatus,
  getThemeResearchList,
  getWorkspaceToday,
  type PublicationSnapshotIdentity,
} from '@stock-insight/api';

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

function parseSnapshot(
  analysisRunIdRaw: string | string[] | undefined,
  analysisRevisionRaw: string | string[] | undefined,
): PublicationSnapshotIdentity | undefined {
  const analysisRunId = firstParam(analysisRunIdRaw);
  const rawRevision = firstParam(analysisRevisionRaw);
  if ((analysisRunId === undefined) !== (rawRevision === undefined)) {
    throw apiError('invalid_snapshot_query', 400);
  }
  if (analysisRunId === undefined || rawRevision === undefined) return undefined;
  const analysisRevision = Number(rawRevision);
  if (
    analysisRunId.trim().length < 1 ||
    analysisRunId.length > 128 ||
    rawRevision.trim().length < 1 ||
    !Number.isInteger(analysisRevision) ||
    analysisRevision < 0
  ) {
    throw apiError('invalid_snapshot_query', 400);
  }
  return { analysisRunId, analysisRevision };
}

@Controller()
export class ResearchWorkspaceController {
  @Get('workspace')
  async getWorkspace() {
    const { withSnapshot, userScope } = researchContext();
    return withSnapshot((executor) => getWorkspaceToday(executor, { userScope }));
  }

  @Get('status')
  async getStatus() {
    const { withSnapshot } = researchContext();
    return withSnapshot((executor) => getSystemStatus(executor));
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
  async getRecord(
    @Param('recordKey') recordKey: string,
    @Query('analysisRunId') analysisRunIdRaw?: string | string[],
    @Query('analysisRevision') analysisRevisionRaw?: string | string[],
  ) {
    if (!recordKey.trim() || recordKey.length > 320) {
      throw apiError('invalid_record_key', 400);
    }
    const snapshot = parseSnapshot(analysisRunIdRaw, analysisRevisionRaw);
    const { withSnapshot, userScope } = researchContext();
    const detail = await withSnapshot((executor) =>
      getResearchRecordDetail(executor, { userScope, recordKey, snapshot }),
    );
    if (!detail) throw apiError('record_not_found', 404);
    return detail;
  }

  @Get('entities/:entityKey/relations')
  async getRelations(
    @Param('entityKey') entityKey: string,
    @Query('depth') depthRaw?: string | string[],
    @Query('analysisRunId') analysisRunIdRaw?: string | string[],
    @Query('analysisRevision') analysisRevisionRaw?: string | string[],
  ) {
    const depth = Number(firstParam(depthRaw) ?? '1');
    if (!entityKeyPattern.test(entityKey) || !Number.isInteger(depth) || depth < 1 || depth > 2) {
      throw apiError('invalid_relation_query', 400);
    }
    const snapshot = parseSnapshot(analysisRunIdRaw, analysisRevisionRaw);
    const { withSnapshot, userScope } = researchContext();
    const graph = await withSnapshot((executor) =>
      getEntityRelations(executor, { userScope, entityKey, depth, snapshot }),
    );
    if (!graph) throw apiError('entity_not_found', 404);
    return graph;
  }
}
