import { Outlet } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';

import { DepthModeProvider } from '@/shared/depth';
import { LiveDataEnvironmentBanner } from '@/shared/ui/live-data-environment';
import { RouteProgress } from '@/shared/ui/route-status';
import { DeferredToastHost } from '@/shared/ui/toast';

export function RootComponent() {
  return (
    <MotionConfig reducedMotion="user">
      {/* 깊이 모드는 전역 토글이라 라우트 트리 최상단에 산다(IA §9 결정 2). */}
      <DepthModeProvider>
        <Outlet />
        <RouteProgress />
        <LiveDataEnvironmentBanner />
        <DeferredToastHost />
      </DepthModeProvider>
    </MotionConfig>
  );
}
