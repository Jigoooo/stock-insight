import { createFileRoute } from '@tanstack/react-router';

import { logout } from '@/pages/auth/model/auth-functions';
import { loadResearchWorkspaceView } from '@/pages/research-workspace/model/load-research-workspace';
import { validateWorkspaceSearch } from '@/pages/research-workspace/model/workspace-search';
import type { WorkspaceViewCacheKey } from '@/pages/research-workspace/model/workspace-view-cache';
import {
  ResearchWorkspacePage,
  type SectionId,
} from '@/pages/research-workspace/ui/research-workspace-page';
import boundaryStyles from '@/pages/research-workspace/ui/workspace-route-boundary.module.css';
import { Button } from '@/shared/ui/primitives/button';

export const Route = createFileRoute('/_authenticated/workspace')({
  validateSearch: validateWorkspaceSearch,
  loaderDeps: ({ search }) => ({
    cursor: search.cursor,
    lane: search.lane ?? 'must_know',
    view: search.view ?? 'today',
  }),
  loader: async ({ abortController, context, deps }) => {
    const activeLoadToken = context.workspaceViewCache.beginActiveLoad();
    try {
      const data = await context.workspaceViewCache.load(
        workspaceCacheKey(context.session.user.id, deps.view, deps.lane, deps.cursor),
        ({ signal }) => {
          if (signal.aborted) return Promise.reject(signal.reason);
          return loadResearchWorkspaceView({
            data: {
              cursor: deps.cursor,
              lane: deps.lane,
              view: deps.view,
            },
          });
        },
        { signal: abortController.signal },
      );
      if (abortController.signal.aborted) {
        throw abortController.signal.reason ?? createRouteAbortError();
      }
      if (!context.workspaceViewCache.commitActive(data, activeLoadToken)) {
        throw createRouteAbortError();
      }
      return { data, viewLoadError: undefined };
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(error) ||
        !context.workspaceViewCache.isActiveLoad(activeLoadToken)
      ) {
        throw error;
      }
      const data = context.workspaceViewCache.getActive();
      if (!data) throw error;
      return { data, viewLoadError: deps.view };
    }
  },
  pendingMs: Number.POSITIVE_INFINITY,
  errorComponent: WorkspaceRouteError,
  head: () => ({
    links: [
      {
        rel: 'preload',
        href: '/fonts/WantedSansVariable.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'preload', href: '/styles/wanted-font.css', as: 'style' },
      { rel: 'stylesheet', href: '/styles/wanted-font.css' },
    ],
    meta: [
      { title: '리서치 워크스페이스 | Futur Insight' },
      {
        name: 'description',
        content: '근거와 관계 경로를 함께 보는 개인 투자 리서치 워크스페이스',
      },
    ],
  }),
  component: ResearchWorkspaceRoute,
});

function WorkspaceRouteError() {
  return (
    <main className={boundaryStyles.boundary}>
      <section className={boundaryStyles.surface} data-testid="workspace-route-error">
        <h1>워크스페이스를 불러오지 못했습니다</h1>
        <p>데이터 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <Button motion="pressable" type="button" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </section>
    </main>
  );
}

function ResearchWorkspaceRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const { session, workspaceViewCache } = Route.useRouteContext();
  workspaceViewCache.seedActive(loaderData.data);
  return (
    <ResearchWorkspacePage
      data={loaderData.data}
      onLogout={async () => {
        const result = await logout();
        if (!result.ok) return false;
        workspaceViewCache.clear();
        return true;
      }}
      onPrefetchSection={(view) => {
        const lane = search.lane ?? 'must_know';
        void workspaceViewCache.prefetch(
          workspaceCacheKey(session.user.id, view, lane),
          () => loadResearchWorkspaceView({ data: { lane, view } }),
          { priority: 'intent' },
        );
      }}
      viewLoadError={loaderData.viewLoadError}
      urlState={search}
      onUrlStateChange={(next) =>
        navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })
      }
    />
  );
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function createRouteAbortError() {
  const error = new Error('Workspace route load was superseded');
  error.name = 'AbortError';
  return error;
}

function workspaceCacheKey(
  scopeVersion: string,
  view: SectionId,
  lane: WorkspaceViewCacheKey['lane'],
  cursor?: string,
): WorkspaceViewCacheKey {
  return {
    cursor: cursor ?? null,
    lane: view === 'today' ? lane : null,
    scopeVersion,
    view,
  };
}
