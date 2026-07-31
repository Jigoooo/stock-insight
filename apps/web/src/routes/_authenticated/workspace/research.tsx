import { createFileRoute } from '@tanstack/react-router';

import { loadWorkspaceView } from '@/pages/research-workspace/model/workspace-route-loader';
import { WorkspaceViewRoute } from '@/pages/research-workspace/ui/workspace-view-route';

export const Route = createFileRoute('/_authenticated/workspace/research')({
  loader: ({ abortController, context }) =>
    loadWorkspaceView('research', {
      cache: context.workspaceViewCache,
      signal: abortController.signal,
      userId: context.session.user.id,
    }),
  head: () => ({ meta: [{ title: '내 리서치 | Stock Insight' }] }),
  pendingMs: Number.POSITIVE_INFINITY,
  component: WorkspaceView,
});

function WorkspaceView() {
  return <WorkspaceViewRoute loaderData={Route.useLoaderData()} />;
}
