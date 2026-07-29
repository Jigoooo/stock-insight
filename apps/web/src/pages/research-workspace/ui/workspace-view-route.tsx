import { useNavigate, useRouteContext, useSearch } from '@tanstack/react-router';

import { logout } from '@/pages/auth/model/auth-functions';
import { loadResearchWorkspaceView } from '@/pages/research-workspace/model/load-research-workspace';
import {
  workspaceCacheKey,
  type WorkspaceRouteLoaderResult,
} from '@/pages/research-workspace/model/workspace-route-loader';
import { ResearchWorkspacePage } from '@/pages/research-workspace/ui/research-workspace-page';

// Shared body for every workspace tab route. The tab identity now comes from the
// route itself, so this component no longer has to derive it from a search param.
export function WorkspaceViewRoute({ loaderData }: { loaderData: WorkspaceRouteLoaderResult }) {
  const search = useSearch({ from: '/_authenticated/workspace' });
  const navigate = useNavigate();
  const { session, workspaceViewCache } = useRouteContext({ from: '/_authenticated' });

  return (
    <ResearchWorkspacePage
      canManageInvitations={session.capabilities.canManageInvitations}
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
          () =>
            loadResearchWorkspaceView({
              data: { ...(view === 'today' ? { lane } : {}), view },
            }),
          { priority: 'intent' },
        );
      }}
      viewLoadError={loaderData.viewLoadError}
      urlState={search}
      onUrlStateChange={async (next) => {
        await navigate({
          to: '.',
          search: (previous) => ({ ...previous, ...next }),
          replace: true,
        });
      }}
    />
  );
}
