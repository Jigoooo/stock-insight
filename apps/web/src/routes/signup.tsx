import { createFileRoute } from '@tanstack/react-router';

import { SignupScreen } from '@/pages/auth/signup-screen';

export const Route = createFileRoute('/signup')({
  head: () => ({
    meta: [
      { title: '계정 만들기 | Futur Insight' },
      {
        name: 'description',
        content: '개인 투자 리서치 워크스페이스 일회성 계정 설정',
      },
    ],
  }),
  component: SignupRoute,
});

function SignupRoute() {
  return <SignupScreen />;
}
