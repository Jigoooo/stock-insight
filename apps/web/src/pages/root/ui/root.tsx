import { Outlet } from '@tanstack/react-router';

import { InteractionMotionProvider } from '@/shared/ui/motion/interaction-motion';
import { AppToaster } from '@/shared/ui/toast';

export function RootComponent() {
  return (
    <InteractionMotionProvider>
      <Outlet />
      <AppToaster />
    </InteractionMotionProvider>
  );
}
