import { createFileRoute, notFound } from '@tanstack/react-router';

import { DevPreviewPage } from '@/pages/dev-preview/ui/dev-preview-page';
import { isDevSurfaceEnabled } from '@/shared/config/dev-surface-gate';

export const Route = createFileRoute('/__dev-preview')({
  validateSearch: (search: Record<string, unknown>) => {
    const surface =
      search.surface === 'admin-invitations'
        ? ('admin-invitations' as const)
        : search.surface === 'today'
          ? ('today' as const)
          : search.surface === 'stocks'
            ? ('stocks' as const)
            : search.surface === 'market-connections'
              ? ('market-connections' as const)
              : undefined;
    const scenario =
      surface === 'stocks' || surface === undefined
        ? search.scenario === 'no-holdings'
          ? ('no-holdings' as const)
          : search.scenario === 'empty'
            ? ('empty' as const)
            : search.scenario === 'detail-error'
              ? ('detail-error' as const)
              : search.scenario === 'default'
                ? ('default' as const)
                : undefined
        : surface === 'market-connections'
          ? search.scenario === 'no-personalized'
            ? ('no-personalized' as const)
            : search.scenario === 'partial'
              ? ('partial' as const)
              : search.scenario === 'empty'
                ? ('empty' as const)
                : search.scenario === 'detail-error'
                  ? ('detail-error' as const)
                  : search.scenario === 'default'
                    ? ('default' as const)
                    : undefined
          : undefined;
    return { scenario, surface };
  },
  beforeLoad: () => {
    if (!isDevSurfaceEnabled(import.meta.env.DEV, import.meta.env.VITE_ENABLE_DEV_PREVIEW)) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Development Preview | Stock Insight' }] }),
  component: DevPreviewRoute,
});

function DevPreviewRoute() {
  const { scenario, surface } = Route.useSearch();
  return <DevPreviewPage surface={surface ?? 'workspace'} scenario={scenario} />;
}
