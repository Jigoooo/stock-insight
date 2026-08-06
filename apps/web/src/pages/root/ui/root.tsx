import { Outlet } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';

import { LiveDataEnvironmentBanner } from '@/shared/ui/live-data-environment';
import { RouteProgress } from '@/shared/ui/route-status';
import { DeferredToastHost } from '@/shared/ui/toast';

export function RootComponent() {
  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
      <RouteProgress />
      <LiveDataEnvironmentBanner />
      <DeferredToastHost />
    </MotionConfig>
  );
}
