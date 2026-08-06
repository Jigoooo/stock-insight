import { useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { LoginPage, type LoginCredentials } from './login-page';
import { login } from './model/auth-functions';
import { holdLoginFailureFeedback } from './model/login-attempt-timing';

const invalidLoginMessage = '아이디 또는 비밀번호를 확인해 주세요.';

export function LoginScreen({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(credentials: LoginCredentials) {
    if (pending) return;
    const startedAt = performance.now();
    setPending(true);
    setError(null);

    try {
      const result = await login({ data: credentials });
      if (!result.ok) {
        await holdLoginFailureFeedback(startedAt);
        setError(invalidLoginMessage);
        setPending(false);
        return;
      }

      // A client transition instead of a full document reload. The bundle is
      // already parsed and hydrated here, and on this deployment every document
      // fetch is a trans-Pacific round trip.
      //
      // The login response carries the verified user and fail-closed
      // capabilities that the authenticated route needs. Adopt it directly so
      // the fresh cookie is not immediately resolved through another remote
      // account lookup before the workspace can start loading.
      //
      // `pending` is deliberately NOT cleared on success. navigate() settles
      // only after the workspace loader does, and this screen stays mounted
      // until then — clearing it would flash an idle login form over a
      // workspace that is still loading. The workspace owns its own pending
      // state from there (navigationIntent in research-workspace-page).
      router.options.context.authenticatedSessionCache.set(result.session);
      // `href` rather than `to`: redirectTo is a runtime string, not a literal
      // route id.
      await navigate({ href: redirectTo });
    } catch {
      await holdLoginFailureFeedback(startedAt);
      setError(invalidLoginMessage);
      setPending(false);
    }
  }

  return <LoginPage onSubmit={handleSubmit} pending={pending} error={error} />;
}
