import {
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  Network,
  Newspaper,
  Settings,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

export type DashboardSectionId = 'today' | 'news' | 'stocks' | 'theme' | 'portfolio' | 'settings';

export type DashboardSection = {
  id: DashboardSectionId;
  label: string;
  shortLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const dashboardSections: DashboardSection[] = [
  { id: 'today', label: '오늘 브리핑', shortLabel: '오늘', icon: LayoutDashboard },
  { id: 'news', label: '뉴스', shortLabel: '뉴스', icon: Newspaper },
  { id: 'stocks', label: '종목 분석', shortLabel: '종목', icon: Building2 },
  { id: 'theme', label: '테마 지도', shortLabel: '테마', icon: Network },
  { id: 'portfolio', label: '포트폴리오', shortLabel: '자산', icon: BriefcaseBusiness },
  { id: 'settings', label: '설정', shortLabel: '설정', icon: Settings },
];
