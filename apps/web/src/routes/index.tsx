import { createFileRoute, redirect } from '@tanstack/react-router';

import { getCurrentSession } from '@/pages/auth/model/auth-functions';

export const Route = createFileRoute('/')({
  // An anonymous visit used to cost two extra origin round trips: this route
  // redirected to /workspace unconditionally, _authenticated then resolved the
  // session and bounced to /login. On this deployment every hop is a
  // trans-Pacific round trip (~600ms), so resolving the session here and
  // sending the visitor straight to the final URL removes one of them.
  //
  // The anonymous destination string is unchanged (/login?redirect=%2Fworkspace)
  // and authenticated visitors still land on /workspace, so both entry contracts
  // hold. Anonymous visitors pay nothing for the extra call: readBoundSession
  // returns early when there is no session cookie, without touching the brain.
  beforeLoad: async () => {
    let session;
    try {
      session = await getCurrentSession();
    } catch {
      // The brain is unreachable. Fall back to the previous behaviour and let
      // the workspace error boundary own it — the site root must not start
      // failing just because it now asks about the session. The redirect throws
      // sit OUTSIDE this try on purpose: the router signals redirects as
      // exceptions, so throwing one inside would be caught right here.
      throw redirect({ to: '/workspace' });
    }

    if (!session) throw redirect({ to: '/login', search: { redirect: '/workspace' } });
    throw redirect({ to: '/workspace' });
  },
});
