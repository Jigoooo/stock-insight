import { Outlet, createFileRoute } from '@tanstack/react-router';

import { validateWorkspaceSearch } from '@/pages/research-workspace/model/workspace-search';
import boundaryStyles from '@/pages/research-workspace/ui/workspace-route-boundary.module.css';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';

// Layout route for the workspace. Each tab is a child route under
// routes/_authenticated/workspace/, so the tab is now part of the PATH
// (/workspace/stocks) rather than a search param (?view=stocks). This route owns
// nothing but the shared boundary: the shell chrome is rendered by the child,
// which already receives the full payload it needs.
//
// `lane`, `record` and `cursor` remain search params on purpose — they are
// filter/position state within a tab, not separate screens, and they must not
// force a route change.
export const Route = createFileRoute('/_authenticated/workspace')({
  validateSearch: validateWorkspaceSearch,
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
      { title: '리서치 워크스페이스 | Stock Insight' },
      {
        name: 'description',
        content: '근거와 관계 경로를 함께 보는 개인 투자 리서치 워크스페이스',
      },
    ],
  }),
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  return <Outlet />;
}

function WorkspaceRouteError() {
  return (
    <main className={boundaryStyles.boundary}>
      <ErrorState className={boundaryStyles.surface} testId="workspace-route-error">
        <h1>워크스페이스를 불러오지 못했습니다</h1>
        <p>데이터 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <Button motion="pressable" type="button" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </ErrorState>
    </main>
  );
}
