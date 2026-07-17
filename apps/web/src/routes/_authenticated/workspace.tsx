import { createFileRoute } from '@tanstack/react-router';

import { loadResearchWorkspaceInitial } from '@/pages/research-workspace/model/load-research-workspace';
import { validateWorkspaceSearch } from '@/pages/research-workspace/model/workspace-search';
import { ResearchWorkspacePage } from '@/pages/research-workspace/ui/research-workspace-page';
import boundaryStyles from '@/pages/research-workspace/ui/workspace-route-boundary.module.css';
import { ErrorState, Skeleton, SkeletonLines } from '@/shared/ui/primitives';

export const Route = createFileRoute('/_authenticated/workspace')({
  validateSearch: validateWorkspaceSearch,
  loader: () => loadResearchWorkspaceInitial(),
  pendingMs: 150,
  pendingMinMs: 300,
  pendingComponent: WorkspaceRoutePending,
  errorComponent: WorkspaceRouteError,
  head: () => ({
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

function WorkspaceRoutePending() {
  return (
    <main className={boundaryStyles.boundary} aria-busy="true" aria-label="워크스페이스 준비 중">
      <section className={boundaryStyles.surface} aria-live="polite" aria-atomic="true">
        <h1>리서치 워크스페이스를 준비하고 있습니다</h1>
        <p>기준 시점과 연결된 근거를 확인하는 중입니다.</p>
        <div className={boundaryStyles.skeletons} aria-hidden="true">
          <Skeleton height={44} />
          <SkeletonLines count={3} />
        </div>
      </section>
    </main>
  );
}

function WorkspaceRouteError() {
  return (
    <main className={boundaryStyles.boundary}>
      <ErrorState className={boundaryStyles.surface} testId="workspace-route-error">
        <h1>워크스페이스를 불러오지 못했습니다</h1>
        <p>데이터 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <button type="button" onClick={() => window.location.reload()}>
          다시 시도
        </button>
      </ErrorState>
    </main>
  );
}

function ResearchWorkspaceRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ResearchWorkspacePage
      data={Route.useLoaderData()}
      urlState={search}
      onUrlStateChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })
      }
    />
  );
}
