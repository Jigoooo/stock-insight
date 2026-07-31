'use client';

// Upstream: https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/effects/auto-height/index.tsx
// Registry item: @animate-ui/primitives-effects-auto-height
// Revision: efeb96ffd7a3b7a4868667e4ac3c346620fb3044

import * as React from 'react';
import {
  motion,
  type HTMLMotionProps,
  type LegacyAnimationControls,
  type TargetAndTransition,
  type Transition,
} from 'motion/react';

import { useAutoHeight } from '@/shared/lib/use-auto-height';
import {
  Slot,
  type WithAsChild,
} from '@/shared/ui/animate-ui/primitives/animate/slot';

type AutoHeightProps = WithAsChild<
  {
    children: React.ReactNode;
    deps?: React.DependencyList;
    animate?: TargetAndTransition | LegacyAnimationControls;
    transition?: Transition;
  } & Omit<HTMLMotionProps<'div'>, 'animate'>
>;

function AutoHeight({
  children,
  deps = [],
  transition = {
    type: 'spring',
    stiffness: 300,
    damping: 30,
    bounce: 0,
    restDelta: 0.01,
  },
  style,
  animate,
  asChild = false,
  ...props
}: AutoHeightProps) {
  const { ref, height } = useAutoHeight<HTMLDivElement>(deps);

  const Comp = asChild ? Slot : motion.div;

  return (
    <Comp
      style={{ overflow: 'hidden', ...style }}
      animate={{ height, ...animate }}
      transition={transition}
      {...props}
    >
      <div ref={ref}>{children}</div>
    </Comp>
  );
}

export { AutoHeight, type AutoHeightProps };
