import {
  Activity,
  BarChart3,
  Bitcoin,
  BookOpen,
  Database,
  History,
  LayoutDashboard,
  Network,
  Newspaper,
  type LucideIcon,
} from 'lucide-react';

export const workspaceSectionIds = [
  'today',
  'radar',
  'market-topic-news',
  'stocks',
  'crypto',
  'themes',
  'research',
  'history',
  'status',
] as const;

export type WorkspaceSectionId = (typeof workspaceSectionIds)[number];

export type WorkspaceNavigationMode = 'expanded' | 'compact' | 'mobile';
export type WorkspaceNavigationGroup = 'primary' | 'utility' | 'hidden';

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
    id: 'research',
    label: '복기',
    icon: BookOpen,
    href: '/workspace/research',
    navigationGroup: 'primary',
  },
  {
    id: 'market-topic-news',
    label: '시장 전반',
    icon: Newspaper,
    href: '/workspace/market-topic-news',
    navigationGroup: 'hidden',
  },
  {
    id: 'crypto',
    label: '크립토',
    icon: Bitcoin,
    href: '/workspace/crypto',
    navigationGroup: 'hidden',
  },
  {
    id: 'themes',
    label: '테마·관계',
    icon: Network,
    href: '/workspace/themes',
    navigationGroup: 'hidden',
  },
  {
    id: 'history',
    label: '판단 이력',
    icon: History,
    href: '/workspace/history',
    navigationGroup: 'hidden',
  },
  {
    id: 'status',
    label: '데이터 신뢰도',
    icon: Database,
    href: '/workspace/status',
    navigationGroup: 'utility',
  },
] as const;
