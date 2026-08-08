import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/workspace/research')({
  beforeLoad: () => {
    throw redirect({ to: '/workspace/history', replace: true });
  },
});
