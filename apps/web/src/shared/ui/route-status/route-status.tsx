import { useRouterState } from '@tanstack/react-router';

import styles from './route-status.module.css';

export function RouteProgress() {
  const isLoading = useRouterState({ select: (state) => state.isLoading });
  if (!isLoading) return null;

  return (
    <output className={styles.progress} aria-live="polite">
      <span aria-hidden="true" />
      <span className={styles.srOnly}>화면을 불러오는 중입니다</span>
    </output>
  );
}

export function RoutePendingScreen() {
  return (
    <main className={styles.pending} aria-busy="true">
      <output className={styles.pendingSurface} aria-live="polite">
        <span className={styles.pendingMark} aria-hidden="true" />
        <strong>Stock Insight를 준비하고 있습니다</strong>
        <p>계정과 리서치 데이터를 안전하게 확인하는 중입니다.</p>
      </output>
    </main>
  );
}
