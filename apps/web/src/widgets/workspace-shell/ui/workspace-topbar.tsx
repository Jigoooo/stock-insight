import {
  ChevronRight,
  LoaderCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './workspace-shell.module.css';

import type {
  WorkspaceNavigationItem,
  WorkspaceNavigationMode,
  WorkspaceSectionId,
} from '@/features/workspace-navigation';
import { Button, IconButton } from '@/shared/ui/primitives';

type WorkspaceTopbarProps = {
  activeSection: WorkspaceSectionId | 'admin-invitations';
  contextualActions?: ReactNode;
  mode: WorkspaceNavigationMode;
  mobileOpen: boolean;
  navigationItems: readonly WorkspaceNavigationItem[];
  navigationPending: WorkspaceSectionId | null;
  onLogout?: () => void;
  onOpenMobile: () => void;
  onToggleDesktop: () => void;
  search?: ReactNode;
};

export function WorkspaceTopbar({
  activeSection,
  contextualActions,
  mode,
  mobileOpen,
  navigationItems,
  navigationPending,
  onLogout,
  onOpenMobile,
  onToggleDesktop,
  search,
}: WorkspaceTopbarProps) {
  const sectionLabel =
    activeSection === 'admin-invitations'
      ? '가입 코드 관리'
      : (navigationItems.find((item) => item.id === activeSection)?.label ?? '오늘');
  const pendingLabel = navigationItems.find((item) => item.id === navigationPending)?.label;

  return (
    <header className={styles.topbar}>
      {mode === 'mobile' ? (
        <IconButton
          className={styles.navigationToggle}
          type="button"
          motion="quiet"
          aria-label="메뉴 열기"
          aria-controls="workspace-navigation"
          aria-expanded={mobileOpen}
          onClick={onOpenMobile}
        >
          <Menu aria-hidden="true" />
        </IconButton>
      ) : (
        <IconButton
          className={styles.navigationToggle}
          type="button"
          motion="quiet"
          aria-label={mode === 'expanded' ? '사이드바 축소' : '사이드바 펼치기'}
          aria-controls="workspace-navigation"
          aria-expanded={mode === 'expanded'}
          onClick={onToggleDesktop}
        >
          {mode === 'expanded' ? (
            <PanelLeftClose aria-hidden="true" />
          ) : (
            <PanelLeftOpen aria-hidden="true" />
          )}
        </IconButton>
      )}

      <div className={styles.crumbs}>
        <strong>{sectionLabel}</strong>
        <ChevronRight aria-hidden="true" />
        <span>리서치 워크스페이스</span>
      </div>

      <output
        className={styles.navigationStatus}
        data-visible={Boolean(navigationPending) || undefined}
        data-testid="workspace-navigation-status"
        aria-live="polite"
      >
        {navigationPending ? <LoaderCircle aria-hidden="true" /> : null}
        {navigationPending ? `${pendingLabel ?? '선택한 화면'} 여는 중` : ''}
      </output>

      <div className={styles.search}>{search}</div>
      <div className={styles.contextualActions}>
        {contextualActions}
        {onLogout ? (
          <Button type="button" motion="quiet" variant="ghost" onClick={onLogout}>
            <LogOut aria-hidden="true" />
            <span className={styles.actionLabel}>로그아웃</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
