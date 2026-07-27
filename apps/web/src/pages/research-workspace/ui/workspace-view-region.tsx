import { useLayoutEffect, useRef, type ReactNode } from 'react';

import styles from './workspace-view-region.module.css';

type WorkspaceViewRegionProps = {
  children: ReactNode;
  className?: string;
  navigationSequence: number;
  pending: boolean;
  viewKey: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function WorkspaceViewRegion({
  children,
  className,
  navigationSequence,
  pending,
  viewKey,
}: Readonly<WorkspaceViewRegionProps>) {
  const currentRef = useRef<HTMLDivElement>(null);
  const previousViewKeyRef = useRef(viewKey);
  const navigationFocusOwnerRef = useRef<Element | null>(null);

  useLayoutEffect(() => {
    if (pending && navigationSequence > 0) {
      const activeFocus = document.activeElement;
      const navigationOwner = activeFocus?.closest('[data-testid^="workspace-nav-"]');
      navigationFocusOwnerRef.current =
        navigationOwner ?? (currentRef.current?.contains(activeFocus) ? activeFocus : null);
    }
  }, [navigationSequence, pending]);

  useLayoutEffect(() => {
    if (previousViewKeyRef.current === viewKey) return;
    previousViewKeyRef.current = viewKey;
    const current = currentRef.current;
    if (!current) return;
    const owner = navigationFocusOwnerRef.current;
    const activeFocus = document.activeElement;
    const focusStillOwned =
      document.activeElement === navigationFocusOwnerRef.current ||
      (owner === null && (activeFocus === document.body || current.contains(activeFocus))) ||
      (activeFocus === document.body && owner !== null && !owner.isConnected);
    navigationFocusOwnerRef.current = null;
    if (!focusStillOwned) return;
    const focusTarget = current.querySelector<HTMLElement>('[data-workspace-view-heading]');
    (focusTarget ?? current).focus({ preventScroll: true });
  }, [viewKey]);

  return (
    <div
      className={classNames(styles.region, className)}
      data-workspace-view-region
      aria-busy={pending || undefined}
    >
      <div
        ref={currentRef}
        className={styles.layer}
        data-workspace-view-layer="current"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
