import { insights } from '@/entities/insight';
import { portfolioSnapshot } from '@/entities/portfolio';
import { stocks } from '@/entities/stock';
import { themes } from '@/entities/theme';
import { DashboardShell } from '@/widgets/dashboard-shell';

export function DashboardPage() {
  return (
    <DashboardShell
      insights={insights}
      portfolio={portfolioSnapshot}
      stocks={stocks}
      themes={themes}
    />
  );
}
