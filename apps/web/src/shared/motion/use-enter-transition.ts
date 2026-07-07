import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';

import { prefersReducedMotion } from '@/shared/motion/preferences';
import { motionTokens } from '@/shared/theme/tokens';

gsap.registerPlugin(useGSAP);

export function useEnterTransition(ref: RefObject<HTMLElement | null>, key: unknown) {
  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;

      if (prefersReducedMotion()) {
        gsap.set(element, { autoAlpha: 1, y: 0 });
        return;
      }

      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: motionTokens.base, ease: motionTokens.panelEase },
      );
    },
    { scope: ref, dependencies: [key] },
  );
}
