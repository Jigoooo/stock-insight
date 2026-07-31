import { animate } from 'motion/react';
import { useEffect, useLayoutEffect, type RefObject } from 'react';

import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';

const useBeforePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useWorkspaceRelationCrossfade({
  scopeRef,
  stateKey,
}: {
  scopeRef: RefObject<HTMLElement | null>;
  stateKey: string;
}) {
  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = reducedMotion || forcedColors;

  useBeforePaintEffect(() => {
    const container = scopeRef.current;
    if (!container) return;

    const clearMotionStyle = () => container.style.removeProperty('opacity');
    if (normalizeMotion) {
      clearMotionStyle();
      return;
    }

    container.style.opacity = '0';
    const controls = animate(container, { opacity: 1 }, { duration: 0.16, ease: 'easeOut' });
    void controls.finished.then(clearMotionStyle, () => undefined);

    return () => {
      controls.stop();
      clearMotionStyle();
    };
  }, [normalizeMotion, scopeRef, stateKey]);
}
