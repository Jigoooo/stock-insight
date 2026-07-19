import { Outlet } from '@tanstack/react-router';

import { DeferredToastHost } from '@/shared/ui/toast';

export function RootComponent() {
  return (
    <>
      <Outlet />
      <DeferredToastHost />
    </>
  );
}
