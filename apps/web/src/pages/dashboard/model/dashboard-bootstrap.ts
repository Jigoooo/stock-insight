import { insights } from '@/entities/insight';
import { portfolioSnapshot } from '@/entities/portfolio';
import { stocks } from '@/entities/stock';
import { themes } from '@/entities/theme';
import { dashboardBootstrapSchema, type DashboardBootstrap } from '@stock-insight/contracts';

export const dashboardBootstrap: DashboardBootstrap = dashboardBootstrapSchema.parse({
  portfolio: portfolioSnapshot,
  insights,
  stocks,
  themes,
});
