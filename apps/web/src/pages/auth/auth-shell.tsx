import type { ReactNode } from 'react';

import styles from './auth-page.module.css';

import { Effect } from '@/shared/ui/motion';

type AuthShellProps = {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  headingId: string;
  title?: string;
};

export function AuthShell({ children, description, footer, headingId, title }: AuthShellProps) {
  return (
    <div className={styles.page} data-auth-shell>
      <div className={styles.authGlow} aria-hidden="true" />
      <div className={styles.authGrid} aria-hidden="true" />
      <main className={styles.authMain} aria-labelledby={headingId}>
        <Effect
          as="section"
          className={styles.authCard}
          data-auth-card
          fade={{ initialOpacity: 0.76 }}
        >
          <div className={styles.wordmark}>Stock Insight</div>
          {title ? (
            <header className={styles.formHeader}>
              <h1 id={headingId}>{title}</h1>
              {description ? <p>{description}</p> : null}
            </header>
          ) : null}
          {children}
          {footer}
        </Effect>
      </main>
    </div>
  );
}
