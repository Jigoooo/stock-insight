import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { getCurrentSession } from '@/pages/auth/model/auth-functions';
import { InteractionMotionProvider } from '@/shared/ui/motion/interaction-motion';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const session = await getCurrentSession();
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    context.workspaceViewCache.setScopeVersion(session.user.id);
    return { session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <InteractionMotionProvider>
      <Outlet />
    </InteractionMotionProvider>
  );
}
