import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/workspace/themes')({
  beforeLoad: () => {
    throw redirect({ to: '/workspace/radar', replace: true });
  },
});
