import { Link } from '@tanstack/react-router';

import styles from './workspace-shell.module.css';

import type {
  WorkspaceNavigationItem,
  WorkspaceNavigationMode,
  WorkspaceSectionId,
} from '@/features/workspace-navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

type WorkspaceNavigationProps = {
  activeSection: WorkspaceSectionId | 'admin-invitations';
  items: readonly WorkspaceNavigationItem[];
  mode: WorkspaceNavigationMode;
  navigationMode?: 'route' | 'static';
  pending: WorkspaceSectionId | null;
  onNavigate?: (section: WorkspaceSectionId) => void;
  onPrefetch?: (section: WorkspaceSectionId) => void;
};

export function WorkspaceNavigation({
  activeSection,
  items,
  mode,
  navigationMode = 'route',
  onNavigate,
  onPrefetch,
  pending,
}: WorkspaceNavigationProps) {
  return (
    <nav className={styles.navigation} aria-label="리서치 워크스페이스">
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <>
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
            {item.count !== undefined ? <small>{item.count}</small> : null}
          </>
        );
        const navigationItem =
          navigationMode === 'static' ? (
            <span
              key={item.id}
              className={styles.navigationLink}
              data-static="true"
              data-testid={`workspace-nav-${item.id}`}
              aria-current={activeSection === item.id ? 'page' : undefined}
              aria-disabled="true"
              aria-label={mode === 'compact' ? item.label : undefined}
            >
              {content}
            </span>
          ) : (
            <Link
              key={item.id}
              className={styles.navigationLink}
              to={item.href}
              preload="intent"
              data-testid={`workspace-nav-${item.id}`}
              data-pending={pending === item.id || undefined}
              aria-busy={pending === item.id || undefined}
              aria-current={activeSection === item.id ? 'page' : undefined}
              aria-label={mode === 'compact' ? item.label : undefined}
              onFocus={() => onPrefetch?.(item.id)}
              onPointerEnter={() => onPrefetch?.(item.id)}
              onClick={() => onNavigate?.(item.id)}
            >
              {content}
            </Link>
          );

        if (mode !== 'compact') return navigationItem;

        return (
          <Tooltip key={item.id} delayDuration={120}>
            <TooltipTrigger asChild>{navigationItem}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
