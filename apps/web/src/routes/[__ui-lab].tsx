import { createFileRoute, notFound } from '@tanstack/react-router';

import { UiLabPage } from '@/pages/ui-lab/ui/ui-lab-page';
import { isDevSurfaceEnabled } from '@/shared/config/dev-surface-gate';

export const Route = createFileRoute('/__ui-lab')({
  beforeLoad: () => {
    if (!isDevSurfaceEnabled(import.meta.env.DEV, import.meta.env.VITE_ENABLE_UI_LAB)) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'UI Lab | Stock Insight' }] }),
  component: UiLabPage,
});
