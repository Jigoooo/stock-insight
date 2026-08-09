import {
  Activity,
  BarChart3,
  BookOpen,
  Database,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

export const workspaceSectionIds = ['today', 'radar', 'stocks', 'history', 'status'] as const;

export type WorkspaceSectionId = (typeof workspaceSectionIds)[number];

export type WorkspaceNavigationMode = 'expanded' | 'compact' | 'mobile';
export type WorkspaceNavigationGroup = 'primary' | 'utility';

export type WorkspaceNavigationItem = {
  id: WorkspaceSectionId;
  label: string;
  icon: LucideIcon;
  href: `/workspace/${WorkspaceSectionId}`;
  navigationGroup: WorkspaceNavigationGroup;
  count?: number;
};

export const workspaceSections: readonly WorkspaceNavigationItem[] = [
  {
    id: 'today',
    label: '오늘',
    icon: LayoutDashboard,
    href: '/workspace/today',
    navigationGroup: 'primary',
  },
  {
    id: 'stocks',
    label: '내 종목',
    icon: BarChart3,
    href: '/workspace/stocks',
    navigationGroup: 'primary',
  },
  {
    id: 'radar',
    label: '시장 연결',
    icon: Activity,
    href: '/workspace/radar',
    navigationGroup: 'primary',
  },
  {
    id: 'history',
    label: '복기',
    icon: BookOpen,
    href: '/workspace/history',
    navigationGroup: 'primary',
  },
  {
    id: 'status',
    label: '데이터 신뢰도',
    icon: Database,
    href: '/workspace/status',
    navigationGroup: 'utility',
  },
] as const;
