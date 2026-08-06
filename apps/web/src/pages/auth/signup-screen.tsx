import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { SignupPage, type SignupAvailability, type SignupCredentials } from './signup-page';
import { enrollAccount, getEnrollmentStatus } from '@/pages/auth/model/auth-functions';

const fallbackEnrollmentError =
  '계정을 설정하지 못했습니다. 가입 코드와 입력 내용을 확인해 주세요.';

export function SignupScreen() {
  const router = useRouter();
  const navigate = useNavigate();
  const [availability, setAvailability] = useState<SignupAvailability>('checking');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getEnrollmentStatus()
      .then((status: { available: boolean }) => {
        if (active) setAvailability(status.available ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (active) {
          setAvailability('error');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function retryAvailability() {
    setAvailability('checking');
    setError(null);
    try {
      const status = await getEnrollmentStatus();
      setAvailability(status.available ? 'available' : 'unavailable');
    } catch {
      setAvailability('error');
    }
  }

  async function handleSubmit({ username, password, enrollmentCode }: SignupCredentials) {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const result = await enrollAccount({ data: { username, password, enrollmentCode } });
      if (!result.ok) {
        const message = result.error || fallbackEnrollmentError;
        setError(message);
        setPending(false);
        return;
      }

      // Same client transition as login-screen — see the comment there for why
      // invalidate() runs first and why `pending` is held through navigate().
      router.options.context.authenticatedSessionCache.clear();
      await router.invalidate();
      await navigate({ to: '/workspace' });
    } catch {
      setError(fallbackEnrollmentError);
      setPending(false);
    }
  }

  return (
    <SignupPage
      availability={availability}
      onRetryAvailability={retryAvailability}
      onSubmit={handleSubmit}
      pending={pending}
      error={error}
    />
  );
}
