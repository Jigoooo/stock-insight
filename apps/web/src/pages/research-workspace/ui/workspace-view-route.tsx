import { useNavigate, useRouteContext, useSearch } from '@tanstack/react-router';

import { workspaceSections } from '@/features/workspace-navigation';
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
  const { authenticatedSessionCache, session, workspaceViewCache } = useRouteContext({
    from: '/_authenticated',
  });

  return (
    <ResearchWorkspacePage
      canManageInvitations={session.capabilities.canManageInvitations}
      data={loaderData.data}
      onLogout={async () => {
        const result = await logout();
        if (!result.ok) return false;
        authenticatedSessionCache.clear();
        workspaceViewCache.clear();
        return true;
      }}
      onNavigateSection={async (section, next) => {
        const target = workspaceSections.find((item) => item.id === section);
        if (!target) return;
        await navigate({
          to: target.href,
          search: (previous) => ({ ...previous, ...next }),
        });
      }}
      onPrefetchSection={(view) => {
        void workspaceViewCache.prefetch(
          workspaceCacheKey(session.user.id, view),
          () => loadResearchWorkspaceView({ data: { view } }),
          { priority: 'intent' },
        );
      }}
      viewLoadError={loaderData.viewLoadError}
      viewLoadFailureKind={loaderData.viewLoadFailureKind}
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
