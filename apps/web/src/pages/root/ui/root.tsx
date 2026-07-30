import { Outlet } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';

import { DeferredToastHost } from '@/shared/ui/toast';

export function RootComponent() {
  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
      <DeferredToastHost />
    </MotionConfig>
  );
}
