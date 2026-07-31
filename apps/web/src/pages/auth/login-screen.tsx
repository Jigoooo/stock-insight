import { useState } from 'react';

import { LoginPage, type LoginCredentials } from './login-page';
import { login } from './model/auth-functions';

const invalidLoginMessage = '아이디 또는 비밀번호를 확인해 주세요.';

export function LoginScreen({ redirectTo }: { redirectTo: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(credentials: LoginCredentials) {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const result = await login({ data: credentials });
      if (!result.ok) {
        setError(invalidLoginMessage);
        return;
      }
      window.location.assign(redirectTo);
    } catch {
      setError(invalidLoginMessage);
    } finally {
      setPending(false);
    }
  }

  return <LoginPage onSubmit={handleSubmit} pending={pending} error={error} />;
}
