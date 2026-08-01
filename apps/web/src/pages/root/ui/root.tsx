import { Outlet } from '@tanstack/react-router';

import { LiveDataEnvironmentBanner } from '@/shared/ui/live-data-environment';
import { DeferredToastHost } from '@/shared/ui/toast';

export function RootComponent() {
  return (
    <>
      <Outlet />
      <LiveDataEnvironmentBanner />
      <DeferredToastHost />
    </>
  );
}
