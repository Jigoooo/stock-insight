import { motion, useReducedMotion } from 'motion/react';
import { Children, useEffect, useReducer, useSyncExternalStore, type ReactNode } from 'react';

import { WorkspaceNavigation } from './workspace-navigation';
import styles from './workspace-shell.module.css';
import { WorkspaceLogoutAction, WorkspaceTopbar } from './workspace-topbar';
import {
  createWorkspaceShellState,
  reduceWorkspaceShellState,
} from '../model/workspace-shell-state';

import type { WorkspaceNavigationItem, WorkspaceSectionId } from '@/features/workspace-navigation';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetTitle } from '@/shared/ui/sheet';

export type WorkspaceShellProps = {
  activeSection: WorkspaceSectionId | 'admin-invitations';
  children: ReactNode;
  contextualActions?: ReactNode;
  mobileModalInert?: boolean;
  navigationItems: readonly WorkspaceNavigationItem[];
  navigationMode?: 'route' | 'static';
  navigationPending: WorkspaceSectionId | null;
  onLogout?: () => void;
  onNavigate?: (section: WorkspaceSectionId) => void;
  onPrefetch?: (section: WorkspaceSectionId) => void;
  search?: ReactNode;
};

const shellTransition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
const serverViewportWidth = 1240;

function subscribeViewport(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  return () => window.removeEventListener('resize', onStoreChange);
}

function getViewportSnapshot() {
  return window.innerWidth;
}

function getServerViewportSnapshot() {
  return serverViewportWidth;
}

export function WorkspaceShell({
  activeSection,
  children,
  contextualActions,
  mobileModalInert = false,
  navigationItems,
  navigationMode = 'route',
  navigationPending,
  onLogout,
  onNavigate,
  onPrefetch,
  search,
}: WorkspaceShellProps) {
  const viewportWidth = useSyncExternalStore(
    subscribeViewport,
    getViewportSnapshot,
    getServerViewportSnapshot,
  );
  const [state, dispatch] = useReducer(
    reduceWorkspaceShellState,
    viewportWidth,
    createWorkspaceShellState,
  );
  const reducedMotion = useReducedMotion();
  const content = Children.toArray(children);
  const currentView = content[0];
  const overlays = content.slice(1);

  useEffect(() => {
    dispatch({ type: 'viewport-changed', width: viewportWidth });
  }, [viewportWidth]);

  useEffect(() => {
    dispatch({ type: 'route-committed' });
  }, [activeSection]);

  useEffect(() => {
    if (mobileModalInert) dispatch({ type: 'route-committed' });
  }, [mobileModalInert]);

  const handleNavigate = (section: WorkspaceSectionId) => {
    dispatch({ type: 'route-committed' });
    onNavigate?.(section);
  };
  const mobileOpen = state.mode === 'mobile' && state.mobileOpen && !mobileModalInert;
  const navigation = (
    <WorkspaceNavigation
      activeSection={activeSection}
      items={navigationItems}
      mode={state.mode}
      navigationMode={navigationMode}
      pending={navigationPending}
      onNavigate={handleNavigate}
      onPrefetch={onPrefetch}
    />
  );

  return (
    <Sheet open={mobileOpen} onOpenChange={(open) => dispatch({ type: 'set-mobile-open', open })}>
      <main
        className={styles.shell}
        data-navigation-mode={state.mode}
        data-testid="research-workspace-v3"
        data-workspace-shell
      >
        {state.mode === 'mobile' ? (
          <SheetContent
            id="workspace-navigation"
            className={styles.mobileSheet}
            side="left"
            showCloseButton={false}
            transition={reducedMotion ? { duration: 0 } : shellTransition}
            data-testid="workspace-sidebar"
            data-navigation-mode="mobile"
          >
            <SheetTitle className={styles.visuallyHidden}>리서치 탐색 메뉴</SheetTitle>
            <SheetDescription className={styles.visuallyHidden}>
              리서치 워크스페이스 화면을 선택합니다.
            </SheetDescription>
            <WorkspaceBrand mode="mobile" />
            {navigation}
            <SheetFooter className={styles.mobileActions} data-testid="workspace-mobile-actions">
              {contextualActions}
              {onLogout ? (
                <WorkspaceLogoutAction className={styles.mobileLogout} onLogout={onLogout} />
              ) : null}
            </SheetFooter>
          </SheetContent>
        ) : (
          <motion.aside
            id="workspace-navigation"
            className={styles.sidebar}
            data-testid="workspace-sidebar"
            data-navigation-mode={state.mode}
            animate={{ width: state.mode === 'expanded' ? 210 : 68 }}
            initial={false}
            transition={reducedMotion ? { duration: 0 } : shellTransition}
          >
            <WorkspaceBrand mode={state.mode} />
            {navigation}
          </motion.aside>
        )}

        <section
          className={styles.workspace}
          data-testid="workspace-content"
          aria-hidden={mobileOpen || mobileModalInert || undefined}
          inert={mobileOpen || mobileModalInert || undefined}
        >
          <WorkspaceTopbar
            activeSection={activeSection}
            contextualActions={contextualActions}
            mode={state.mode}
            mobileOpen={mobileOpen}
            navigationItems={navigationItems}
            navigationPending={navigationPending}
            onLogout={onLogout}
            onToggleDesktop={() => dispatch({ type: 'toggle-desktop-mode' })}
            search={search}
          />
          {currentView}
        </section>

        {overlays}
      </main>
    </Sheet>
  );
}

function WorkspaceBrand({ mode }: { mode: 'expanded' | 'compact' | 'mobile' }) {
  return (
    <div className={styles.brand} data-compact={mode === 'compact' || undefined}>
      <span className={styles.brandMark}>SI</span>
      <div>
        <strong>Stock Insight</strong>
        <span>Research workspace</span>
      </div>
    </div>
  );
}
