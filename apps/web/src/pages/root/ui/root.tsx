import { Outlet } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';

import { LiveDataEnvironmentBanner } from '@/shared/ui/live-data-environment';
import { DeferredToastHost } from '@/shared/ui/toast';

export function RootComponent() {
  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
      <LiveDataEnvironmentBanner />
      <DeferredToastHost />
    </MotionConfig>
  );
}
