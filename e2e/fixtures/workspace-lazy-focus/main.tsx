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

function DeferredWorkspaceView({ onHeadingFocus }: Readonly<{ onHeadingFocus: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    heading.addEventListener('focus', onHeadingFocus);
    return () => heading.removeEventListener('focus', onHeadingFocus);
  }, [onHeadingFocus]);

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
  const [readyMountVersion, setReadyMountVersion] = useState(0);
  const [deferredReadyCount, setDeferredReadyCount] = useState(0);
  const [headingFocusCount, setHeadingFocusCount] = useState(0);
  const markViewReady = useCallback((readyViewKey: string) => {
    if (readyViewKey === 'deferred') {
      setDeferredReadyCount((current) => current + 1);
    }
    setResolvedViewKey(readyViewKey);
  }, []);
  const countHeadingFocus = useCallback(() => {
    setHeadingFocusCount((current) => current + 1);
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
        onClick={() => setReadyMountVersion((current) => current + 1)}
        type="button"
      >
        준비 신호 컴포넌트 다시 마운트
      </button>
      <output data-testid="workspace-deferred-ready-count">{deferredReadyCount}</output>
      <output data-testid="workspace-heading-focus-count">{headingFocusCount}</output>
      <WorkspaceViewRegion
        navigationSequence={navigationSequence}
        pending={pending}
        resolvedViewKey={resolvedViewKey}
        viewKey={viewKey}
      >
        <Suspense fallback={<p data-testid="workspace-lazy-loading">화면 로딩 중</p>}>
          <WorkspaceViewReady key={readyMountVersion} onReady={markViewReady} viewKey={viewKey}>
            {viewKey === 'deferred' ? (
              <LazyWorkspaceView onHeadingFocus={countHeadingFocus} />
            ) : (
              <InitialWorkspaceView />
            )}
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
