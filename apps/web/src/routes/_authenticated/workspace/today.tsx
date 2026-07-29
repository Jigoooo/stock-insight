import { createFileRoute } from '@tanstack/react-router';

import { loadWorkspaceView } from '@/pages/research-workspace/model/workspace-route-loader';
import { WorkspaceViewRoute } from '@/pages/research-workspace/ui/workspace-view-route';

export const Route = createFileRoute('/_authenticated/workspace/today')({
  // `lane` is deliberately NOT a loader dep. The brain's /v1/workspace response
  // always carries all three lanes (the contract pins lanes to exactly 3), and
  // loadResearchWorkspace() does not even accept a lane argument — it returns
  // byte-identical data whichever lane is selected. Keying the loader on it made
  // every lane click re-run the loader and round-trip the server for data the
  // client already had, which is what made an in-tab filter feel like a reload.
  // `cursor` stays, because it genuinely pages the feed server-side.
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: ({ abortController, context, deps }) =>
    loadWorkspaceView('today', {
      cache: context.workspaceViewCache,
      cursor: deps.cursor,
      signal: abortController.signal,
      userId: context.session.user.id,
    }),
  pendingMs: Number.POSITIVE_INFINITY,
  component: WorkspaceView,
});

function WorkspaceView() {
  return <WorkspaceViewRoute loaderData={Route.useLoaderData()} />;
}
