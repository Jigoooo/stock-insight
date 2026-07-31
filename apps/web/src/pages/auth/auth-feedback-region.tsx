import { useReducedMotion } from 'motion/react';

import styles from './auth-page.module.css';
import { PresenceRegion } from '@/shared/ui/motion';

export type AuthFeedbackState =
  | { key: 'idle' }
  | { key: 'pending'; message: string }
  | { key: 'error'; id: string; message: string };

export type AuthFeedbackRegionProps = {
  state: AuthFeedbackState;
};

export function AuthFeedbackRegion({ state }: AuthFeedbackRegionProps) {
  const reducedMotion = useReducedMotion();
  const message = state.key === 'idle' ? '' : state.message;
  const role = state.key === 'pending' ? 'status' : state.key === 'error' ? 'alert' : undefined;
  const live = state.key === 'pending' ? 'polite' : state.key === 'error' ? 'assertive' : undefined;

  return (
    <div className={styles.feedbackSlot}>
      <div
        id={state.key === 'error' ? state.id : undefined}
        className={styles.feedbackAnnouncement}
        data-auth-feedback-announcement="true"
        role={role}
        aria-live={live}
        aria-atomic="true"
      >
        {message}
      </div>
      <PresenceRegion
        className={`${styles.feedbackVisual} ${
          state.key === 'error' ? styles.feedbackError : styles.feedbackPending
        }`}
        mode="sync"
        presenceKey={state.key}
        present
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        aria-hidden="true"
        data-auth-feedback-visual="true"
      >
        {message}
      </PresenceRegion>
    </div>
  );
}
