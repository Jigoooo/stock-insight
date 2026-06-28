import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';

import { prefersReducedMotion } from '@/shared/motion/preferences';
import { motionTokens } from '@/shared/theme/tokens';

gsap.registerPlugin(useGSAP);

export function useDashboardReveal(scopeRef: RefObject<HTMLElement | null>, key: unknown) {
  useGSAP(
    () => {
      const root = scopeRef.current;
      if (!root) return;

      const targets = root.querySelectorAll<HTMLElement>(
        '[data-reveal]:not([data-reveal="progress"])',
      );
      if (prefersReducedMotion()) {
        gsap.set(targets, { y: 0 });
        return;
      }

      gsap.fromTo(
        targets,
        { y: 5 },
        {
          y: 0,
          clearProps: 'transform',
          duration: motionTokens.base,
          ease: motionTokens.panelEase,
          force3D: true,
          overwrite: 'auto',
          stagger: { each: 0.018, from: 'start' },
        },
      );
    },
    { scope: scopeRef, dependencies: [key] },
  );
}
