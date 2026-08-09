import { Link } from '@tanstack/react-router';
import type { MouseEvent } from 'react';

import styles from './workspace-shell.module.css';
import { isPlainWorkspaceNavigationActivation } from '../model/workspace-navigation-activation';

import type {
  WorkspaceNavigationItem,
  WorkspaceNavigationMode,
  WorkspaceSectionId,
} from '@/features/workspace-navigation';
import { SideList, SideListItem, type SideListVariant } from '@/shared/ui/side-list';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

const sideListVariantByMode: Record<WorkspaceNavigationMode, SideListVariant> = {
  expanded: 'quiet-rows',
  mobile: 'soft-surface',
  compact: 'compact-rail',
};

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
    <SideList
      aria-label="리서치 워크스페이스"
      className={styles.navigation}
      value={activeSection}
      variant={sideListVariantByMode[mode]}
    >
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
            <SideListItem
              key={item.id}
              className={styles.navigationLink}
              data-navigation-group={item.navigationGroup}
              disabled
              static
              value={item.id}
            >
              <span
                aria-disabled="true"
                aria-label={mode === 'compact' ? item.label : undefined}
                data-testid={`workspace-nav-${item.id}`}
              >
                {content}
              </span>
            </SideListItem>
          ) : (
            <SideListItem
              key={item.id}
              className={styles.navigationLink}
              data-navigation-group={item.navigationGroup}
              pending={pending === item.id}
              value={item.id}
            >
              <Link
                aria-label={mode === 'compact' ? item.label : undefined}
                data-testid={`workspace-nav-${item.id}`}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  if (isPlainWorkspaceNavigationActivation(event)) onNavigate?.(item.id);
                }}
                onFocus={() => onPrefetch?.(item.id)}
                onPointerEnter={() => onPrefetch?.(item.id)}
                preload="intent"
                to={item.href}
              >
                {content}
              </Link>
            </SideListItem>
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
    </SideList>
  );
}
