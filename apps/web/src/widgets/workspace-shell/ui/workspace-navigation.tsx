import { Link } from '@tanstack/react-router';

import styles from './workspace-shell.module.css';

import type {
  WorkspaceNavigationItem,
  WorkspaceNavigationMode,
  WorkspaceSectionId,
} from '@/features/workspace-navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/animate-ui/components/radix/tooltip';

type WorkspaceNavigationProps = {
  activeSection: WorkspaceSectionId | 'admin-invitations';
  items: readonly WorkspaceNavigationItem[];
  mode: WorkspaceNavigationMode;
  pending: WorkspaceSectionId | null;
  onNavigate?: (section: WorkspaceSectionId) => void;
  onPrefetch?: (section: WorkspaceSectionId) => void;
};

export function WorkspaceNavigation({
  activeSection,
  items,
  mode,
  onNavigate,
  onPrefetch,
  pending,
}: WorkspaceNavigationProps) {
  return (
    <nav className={styles.navigation} aria-label="리서치 워크스페이스">
      {items.map((item) => {
        const Icon = item.icon;
        const link = (
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
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
            {item.count !== undefined ? <small>{item.count}</small> : null}
          </Link>
        );

        if (mode !== 'compact') return link;

        return (
          <Tooltip key={item.id} delayDuration={120}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
