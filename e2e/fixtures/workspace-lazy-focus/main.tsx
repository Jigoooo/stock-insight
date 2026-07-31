import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { WorkspaceViewReady } from '../../../apps/web/src/pages/research-workspace/ui/workspace-view-boundary';
import { WorkspaceViewRegion } from '../../../apps/web/src/pages/research-workspace/ui/workspace-view-region';

declare global {
  interface Window {
    __resolveWorkspaceLazyView: () => void;
  }
}

function createDeferred() {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

const lazyViewGate = createDeferred();

function DeferredWorkspaceView() {
  const [focusCount, setFocusCount] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    const countFocus = () => setFocusCount((current) => current + 1);
    heading.addEventListener('focus', countFocus);
    return () => heading.removeEventListener('focus', countFocus);
  }, []);

  return (
    <section>
      <h1
        data-testid="workspace-deferred-heading"
        data-workspace-view-heading
        ref={headingRef}
        tabIndex={-1}
      >
        지연 로드 화면
      </h1>
      <output data-testid="workspace-heading-focus-count">{focusCount}</output>
    </section>
  );
}

const LazyWorkspaceView = lazy(() =>
  lazyViewGate.promise.then(() => ({ default: DeferredWorkspaceView })),
);

function InitialWorkspaceView() {
  return (
    <h1 data-workspace-view-heading tabIndex={-1}>
      초기 화면
    </h1>
  );
}

function WorkspaceLazyFocusHarness() {
  const [viewKey, setViewKey] = useState('initial');
  const [resolvedViewKey, setResolvedViewKey] = useState<string | null>(null);
  const [navigationSequence, setNavigationSequence] = useState(0);
  const [pending, setPending] = useState(false);
  const [, setRenderVersion] = useState(0);
  const markViewReady = useCallback((readyViewKey: string) => {
    setResolvedViewKey(readyViewKey);
  }, []);

  const navigateToDeferredView = () => {
    setPending(true);
    setNavigationSequence((current) => current + 1);
    window.setTimeout(() => {
      setViewKey('deferred');
      setPending(false);
    }, 0);
  };

  return (
    <main>
      <nav aria-label="Fixture navigation">
        <button data-testid="workspace-nav-deferred" onClick={navigateToDeferredView} type="button">
          지연 화면 열기
        </button>
      </nav>
      <button data-testid="workspace-external-focus" type="button">
        외부 포커스 대상
      </button>
      <button
        data-testid="workspace-rerender-control"
        hidden
        onClick={() => setRenderVersion((current) => current + 1)}
        type="button"
      >
        하네스 다시 렌더링
      </button>
      <WorkspaceViewRegion
        navigationSequence={navigationSequence}
        pending={pending}
        resolvedViewKey={resolvedViewKey}
        viewKey={viewKey}
      >
        <Suspense fallback={<p data-testid="workspace-lazy-loading">화면 로딩 중</p>}>
          <WorkspaceViewReady onReady={markViewReady} viewKey={viewKey}>
            {viewKey === 'deferred' ? <LazyWorkspaceView /> : <InitialWorkspaceView />}
          </WorkspaceViewReady>
        </Suspense>
      </WorkspaceViewRegion>
    </main>
  );
}

window.__resolveWorkspaceLazyView = () => lazyViewGate.resolve();

const root = document.getElementById('root');
if (!root) throw new Error('workspace lazy focus fixture root is missing');
createRoot(root).render(<WorkspaceLazyFocusHarness />);
