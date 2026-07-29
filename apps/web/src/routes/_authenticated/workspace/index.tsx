import { createFileRoute, redirect } from '@tanstack/react-router';

// /workspace itself renders nothing: it exists only to send the user to the
// default tab. Keeping the redirect in its own index route (rather than a
// conditional inside the layout) means the URL is always canonical — there is no
// state in which the address bar says /workspace while a tab is showing.
export const Route = createFileRoute('/_authenticated/workspace/')({
  beforeLoad: () => {
    throw redirect({ to: '/workspace/today', replace: true });
  },
});
