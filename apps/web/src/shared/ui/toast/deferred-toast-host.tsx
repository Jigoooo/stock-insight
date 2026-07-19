import { lazy, Suspense, useEffect, useState } from 'react';

const LazyAppToaster = lazy(() =>
  import('./motion-toast').then(({ AppToaster }) => ({ default: AppToaster })),
);

export function DeferredToastHost() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const activate = () => setActive(true);
    if (window.__stockInsightToastActivated) activate();
    window.addEventListener('app-toast-activate', activate, { once: true });
    return () => window.removeEventListener('app-toast-activate', activate);
  }, []);

  return active ? (
    <Suspense fallback={null}>
      <LazyAppToaster />
    </Suspense>
  ) : null;
}

declare global {
  interface Window {
    __stockInsightToastActivated?: boolean;
  }
}
