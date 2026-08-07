import { createFileRoute, notFound } from '@tanstack/react-router';

import { resolveDevPreviewRequest } from '@/pages/dev-preview/model/dev-preview-request';
import { DevPreviewPage } from '@/pages/dev-preview/ui/dev-preview-page';
import { isDevSurfaceEnabled } from '@/shared/config/dev-surface-gate';

export const Route = createFileRoute('/__dev-preview')({
  validateSearch: resolveDevPreviewRequest,
  beforeLoad: () => {
    if (!isDevSurfaceEnabled(import.meta.env.DEV, import.meta.env.VITE_ENABLE_DEV_PREVIEW)) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Development Preview | Stock Insight' }] }),
  component: DevPreviewRoute,
});

function DevPreviewRoute() {
  const previewRequest = Route.useSearch();
  return <DevPreviewPage {...previewRequest} />;
}
