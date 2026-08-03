import { createFileRoute, notFound } from '@tanstack/react-router';

import { DevPreviewPage } from '@/pages/dev-preview/ui/dev-preview-page';
import { isDevSurfaceEnabled } from '@/shared/config/dev-surface-gate';

export const Route = createFileRoute('/__dev-preview')({
  validateSearch: (search: Record<string, unknown>) => ({
    surface: search.surface === 'admin-invitations' ? ('admin-invitations' as const) : undefined,
  }),
  beforeLoad: () => {
    if (!isDevSurfaceEnabled(import.meta.env.DEV, import.meta.env.VITE_ENABLE_DEV_PREVIEW)) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Development Preview | Stock Insight' }] }),
  component: DevPreviewRoute,
});

function DevPreviewRoute() {
  const { surface } = Route.useSearch();
  return <DevPreviewPage surface={surface ?? 'workspace'} />;
}
