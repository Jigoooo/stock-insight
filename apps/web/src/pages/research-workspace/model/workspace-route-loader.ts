import { loadResearchWorkspaceView } from './load-research-workspace';
import type { WorkspaceViewCache, WorkspaceViewCacheKey } from './workspace-view-cache';
import type {
  ResearchWorkspaceViewId,
  ResearchWorkspaceViewPayload,
} from './workspace-view-payload';

// Each tab is its own route, so each route loads only its own view. Previously a
// single loader keyed on `search.view` served all eight tabs, which meant the
// router re-ran the whole thing on every tab change and no route could be code
// split. The per-view loader body is identical apart from the view id, so it
// lives here once instead of being copy-pasted into eight route files.
//
// The cache is typed with the real WorkspaceViewCache class rather than a
// hand-rolled structural shape, so a signature change there fails here instead
// of silently diverging.

export type WorkspaceRouteLoaderResult = {
  data: ResearchWorkspaceViewPayload;
  viewLoadError: ResearchWorkspaceViewId | undefined;
};

export function workspaceCacheKey(
  scopeVersion: string,
  view: ResearchWorkspaceViewId,
  cursor?: string,
): WorkspaceViewCacheKey {
  return {
    cursor: cursor ?? null,
    // Never lane-scoped. The today payload contains all three lanes, so keying
    // by lane would store three identical copies and make a lane switch look
    // like a cache miss — the exact round-trip this split removed.
    lane: null,
    scopeVersion,
    view,
  };
}

export async function loadWorkspaceView(
  view: ResearchWorkspaceViewId,
  options: {
    signal: AbortSignal;
    cache: WorkspaceViewCache<ResearchWorkspaceViewPayload>;
    userId: string;
    cursor?: string;
  },
): Promise<WorkspaceRouteLoaderResult> {
  const { cache, signal, userId } = options;
  const activeLoadToken = cache.beginActiveLoad();
  try {
    const data = await cache.load(
      workspaceCacheKey(userId, view, options.cursor),
      ({ signal: loadSignal }) => {
        if (loadSignal.aborted) return Promise.reject(loadSignal.reason);
        return loadResearchWorkspaceView({
          data: {
            ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
            view,
          },
        });
      },
      { signal },
    );
    if (signal.aborted) {
      throw signal.reason ?? createRouteAbortError();
    }
    if (!cache.commitActive(data, activeLoadToken)) {
      throw createRouteAbortError();
    }
    return { data, viewLoadError: undefined };
  } catch (error) {
    // A redirect is control flow, not a failure — never swallow it into the
    // stale-data fallback below.
    if (isRedirect(error)) throw error;
    if (signal.aborted || isAbortError(error) || !cache.isActiveLoad(activeLoadToken)) {
      throw error;
    }
    // Keep the last good payload on screen and surface a per-view error badge
    // instead of blanking the workspace.
    const data = cache.getActive();
    if (!data) throw error;
    return { data, viewLoadError: view };
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function isRedirect(error: unknown) {
  return typeof error === 'object' && error !== null && 'isRedirect' in error;
}

function createRouteAbortError() {
  const error = new Error('Workspace route load was superseded');
  error.name = 'AbortError';
  return error;
}
