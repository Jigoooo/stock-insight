import { useLayoutEffect, useRef, type ReactNode } from 'react';

import styles from './workspace-view-region.module.css';

import {
  isWorkspaceFocusStillOwned,
  resolveWorkspaceViewFocus,
} from '../model/workspace-lazy-recovery';

type WorkspaceViewRegionProps = {
  children: ReactNode;
  className?: string;
  navigationSequence: number;
  pending: boolean;
  resolvedViewKey: string | null;
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
  resolvedViewKey,
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
    const resolution = resolveWorkspaceViewFocus(
      previousViewKeyRef.current,
      viewKey,
      resolvedViewKey,
    );
    if (!resolution.shouldFocus) return;
    previousViewKeyRef.current = resolution.focusedViewKey;
    const current = currentRef.current;
    if (!current) return;
    const owner = navigationFocusOwnerRef.current;
    const activeFocus = document.activeElement;
    const focusStillOwned = isWorkspaceFocusStillOwned({
      activeFocus,
      currentContainsActiveFocus: current.contains(activeFocus),
      focusOwner: owner,
      focusOwnerConnected: owner?.isConnected ?? false,
      isBodyFocused: activeFocus === document.body,
    });
    navigationFocusOwnerRef.current = null;
    if (!focusStillOwned) return;
    const focusTarget = current.querySelector<HTMLElement>('[data-workspace-view-heading]');
    (focusTarget ?? current).focus({ preventScroll: true });
  }, [resolvedViewKey, viewKey]);

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
