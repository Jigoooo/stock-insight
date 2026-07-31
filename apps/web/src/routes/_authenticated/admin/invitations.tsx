import { createFileRoute, redirect } from '@tanstack/react-router';

import { loadAdminInvitationConsole } from '@/pages/admin-invitations/model/admin-invitation-functions';
import { AdminInvitationPage } from '@/pages/admin-invitations/ui/admin-invitation-page';

export const Route = createFileRoute('/_authenticated/admin/invitations')({
  loader: async () => {
    const data = await loadAdminInvitationConsole();
    if (!data.authorized) throw redirect({ to: '/workspace' });
    return data;
  },
  head: () => ({
    meta: [
      { title: '가입 코드 관리 | Stock Insight' },
      { name: 'description', content: '관리자 전용 가입 코드 발급 및 폐기 화면' },
    ],
  }),
  component: AdminInvitationRoute,
});

function AdminInvitationRoute() {
  const data = Route.useLoaderData();
  return <AdminInvitationPage initialInvitations={data.invitations} role={data.role} />;
}
