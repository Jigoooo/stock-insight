import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import type { RefObject } from 'react';

import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';

gsap.registerPlugin(useGSAP);

export function useWorkspaceRelationCrossfade({
  scopeRef,
  stateKey,
}: {
  scopeRef: RefObject<HTMLElement | null>;
  stateKey: string;
}) {
  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = reducedMotion || forcedColors;

  useGSAP(
    () => {
      const container = scopeRef.current;
      if (!container) return;
      gsap.killTweensOf(container);
      if (normalizeMotion) {
        gsap.set(container, { clearProps: 'opacity' });
        return;
      }
      gsap.fromTo(
        container,
        { opacity: 0 },
        {
          clearProps: 'opacity',
          duration: 0.16,
          ease: 'power1.out',
          opacity: 1,
          overwrite: 'auto',
        },
      );
      return () => {
        gsap.killTweensOf(container);
        gsap.set(container, { clearProps: 'opacity' });
      };
    },
    {
      dependencies: [normalizeMotion, stateKey],
      revertOnUpdate: true,
      scope: scopeRef,
    },
  );
}
