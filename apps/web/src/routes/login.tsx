import { createFileRoute } from '@tanstack/react-router';

import { LoginScreen } from '@/pages/auth/login-screen';
import { sanitizeLoginRedirect } from '@/server/auth/login-redirect';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeLoginRedirect(search.redirect),
  }),
  head: () => ({
    meta: [
      { title: '로그인 | Futur Insight' },
      {
        name: 'description',
        content: '개인 투자 리서치 워크스페이스 로그인',
      },
    ],
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <LoginScreen redirectTo={redirect} />;
}
