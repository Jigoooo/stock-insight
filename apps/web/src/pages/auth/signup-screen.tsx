import { useEffect, useState } from 'react';

import { SignupPage, type SignupAvailability, type SignupCredentials } from './signup-page';
import { enrollAccount, getEnrollmentStatus } from '@/pages/auth/model/auth-functions';
import { notify } from '@/shared/ui/toast';

const fallbackEnrollmentError =
  '계정을 설정하지 못했습니다. 가입 코드와 입력 내용을 확인해 주세요.';

export function SignupScreen() {
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
          notify.error('가입 상태를 확인하지 못했습니다.');
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
      notify.error('가입 상태를 확인하지 못했습니다.');
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
        notify.error('계정을 설정하지 못했습니다.', { description: message });
        return;
      }
      window.location.assign('/workspace');
    } catch {
      setError(fallbackEnrollmentError);
      notify.error('계정을 설정하지 못했습니다.', { description: fallbackEnrollmentError });
    } finally {
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
