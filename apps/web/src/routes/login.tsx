import { createFileRoute } from '@tanstack/react-router';

import { LoginScreen } from '@/pages/auth/login-screen';
import { sanitizeLoginRedirect } from '@/server/auth/login-redirect';

export const Route = createFileRoute('/login')({
  // Emitting `redirect` unconditionally made the validated search differ from a
  // bare /login URL, so the router rewrote it to /login?redirect=%2F — one extra
  // origin round trip for anyone who typed the URL or used a bookmark. Leaving
  // the key absent when the caller did not supply one keeps the URL as-is; the
  // component applies the same default the sanitizer would have.
  validateSearch: (search: Record<string, unknown>) =>
    search.redirect === undefined ? {} : { redirect: sanitizeLoginRedirect(search.redirect) },
  head: () => ({
    meta: [
      { title: '로그인 | Stock Insight' },
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
  // Keep the bare URL stable while sending a successful login straight to the
  // default workspace view. This avoids routing through both `/` and the
  // `/workspace` index before the real data loader can start.
  return <LoginScreen redirectTo={sanitizeLoginRedirect(redirect)} />;
}
