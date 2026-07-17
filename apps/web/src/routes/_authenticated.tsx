import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { getCurrentSession } from '@/pages/auth/model/auth-functions';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    if (!(await getCurrentSession())) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
