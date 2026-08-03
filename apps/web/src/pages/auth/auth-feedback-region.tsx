import styles from './auth-page.module.css';
import { InlineFeedbackRegion } from '@/shared/ui/feedback';

export type AuthFeedbackState =
  | { key: 'idle' }
  | { key: 'pending'; message: string }
  | { key: 'error'; id: string; message: string };

export type AuthFeedbackRegionProps = {
  state: AuthFeedbackState;
};

export function AuthFeedbackRegion({ state }: AuthFeedbackRegionProps) {
  return (
    <InlineFeedbackRegion
      className={styles.authFeedback}
      density="compact"
      reserveSpace
      state={state}
    />
  );
}
