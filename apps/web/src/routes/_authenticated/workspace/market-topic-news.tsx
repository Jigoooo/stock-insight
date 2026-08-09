import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/workspace/market-topic-news')({
  beforeLoad: () => {
    throw redirect({ to: '/workspace/today', replace: true });
  },
});
