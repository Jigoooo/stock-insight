import {
  Activity,
  BarChart3,
  Bitcoin,
  BookOpen,
  Database,
  History,
  LayoutDashboard,
  Network,
  type LucideIcon,
} from 'lucide-react';

export const workspaceSectionIds = [
  'today',
  'radar',
  'stocks',
  'crypto',
  'themes',
  'research',
  'history',
  'status',
] as const;

export type WorkspaceSectionId = (typeof workspaceSectionIds)[number];

export type WorkspaceNavigationMode = 'expanded' | 'compact' | 'mobile';

export type WorkspaceNavigationItem = {
  id: WorkspaceSectionId;
  label: string;
  icon: LucideIcon;
  href: `/workspace/${WorkspaceSectionId}`;
  count?: number;
};

export const workspaceSections: readonly WorkspaceNavigationItem[] = [
  { id: 'today', label: '오늘', icon: LayoutDashboard, href: '/workspace/today' },
  { id: 'radar', label: '세계 레이더', icon: Activity, href: '/workspace/radar' },
  { id: 'stocks', label: '종목', icon: BarChart3, href: '/workspace/stocks' },
  { id: 'crypto', label: '크립토', icon: Bitcoin, href: '/workspace/crypto' },
  { id: 'themes', label: '테마·관계', icon: Network, href: '/workspace/themes' },
  { id: 'research', label: '내 리서치', icon: BookOpen, href: '/workspace/research' },
  { id: 'history', label: '판단 이력', icon: History, href: '/workspace/history' },
  { id: 'status', label: '데이터 상태', icon: Database, href: '/workspace/status' },
] as const;
