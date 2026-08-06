import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { getCurrentSession } from '@/pages/auth/model/auth-functions';
import boundaryStyles from '@/pages/research-workspace/ui/workspace-route-boundary.module.css';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';
import { InteractionMotionProvider } from '@/shared/ui/motion';

export const Route = createFileRoute('/_authenticated')({
  // Private screens have no SEO requirement. Rendering their auth/data gates
  // on the client lets the root document paint immediately instead of holding
  // a blank response open while the remote account binding is verified.
  ssr: false,
  // Every private server function still verifies the credential-bound session.
  // Keep this parent match fresh so child-tab navigation can retain the shell
  // and limit loading feedback to the workspace content region.
  staleTime: Number.POSITIVE_INFINITY,
  beforeLoad: async ({ context, location }) => {
    const session = await context.authenticatedSessionCache.load(getCurrentSession);
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    context.workspaceViewCache.setScopeVersion(session.user.id);
    return { session };
  },
  errorComponent: AuthenticatedRouteError,
  component: AuthenticatedLayout,
});

function AuthenticatedRouteError() {
  return (
    <main className={boundaryStyles.boundary}>
      <ErrorState className={boundaryStyles.surface} testId="authenticated-route-error">
        <h1>계정과 데이터 연결을 확인하지 못했습니다</h1>
        <p>로그인 정보 확인이나 데이터 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.</p>
        <Button motion="pressable" type="button" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </ErrorState>
    </main>
  );
}

function AuthenticatedLayout() {
  return (
    <InteractionMotionProvider>
      <Outlet />
    </InteractionMotionProvider>
  );
}
