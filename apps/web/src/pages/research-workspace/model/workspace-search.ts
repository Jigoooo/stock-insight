import type { ResearchWorkspaceUrlState, SectionId } from '../ui/research-workspace-page';
import type { ResearchFeedLaneId } from '@stock-insight/contracts/research-workspace';

const allowedViews = new Set<SectionId>([
  'today',
  'radar',
  'stocks',
  'crypto',
  'themes',
  'research',
  'history',
  'status',
]);
const allowedLanes = new Set<ResearchFeedLaneId>(['must_know', 'for_you', 'explore']);

export function validateWorkspaceSearch(
  search: Record<string, unknown>,
): ResearchWorkspaceUrlState {
  const view =
    typeof search.view === 'string' && allowedViews.has(search.view as SectionId)
      ? (search.view as SectionId)
      : undefined;
  const lane =
    typeof search.lane === 'string' && allowedLanes.has(search.lane as ResearchFeedLaneId)
      ? (search.lane as ResearchFeedLaneId)
      : undefined;
  const record =
    typeof search.record === 'string' &&
    search.record.trim().length > 0 &&
    search.record.length <= 320
      ? search.record
      : undefined;
  const cursor =
    typeof search.cursor === 'string' &&
    search.cursor.trim().length > 0 &&
    search.cursor.length <= 1_024
      ? search.cursor
      : undefined;
  return {
    ...(view ? { view } : {}),
    ...(lane ? { lane } : {}),
    ...(record ? { record } : {}),
    ...(cursor ? { cursor } : {}),
  };
}
