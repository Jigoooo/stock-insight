import { animate, stagger } from 'motion/react';
import { useEffect, useRef, type RefObject } from 'react';

import { selectWorkspaceAppendedKeys } from '../model/workspace-append-reveal';

import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';

type AppendRevealBaseline = {
  keys: readonly string[];
  resetKey: string;
};

export function useWorkspaceAppendReveal({
  keys,
  resetKey = 'default',
  scopeRef,
}: {
  keys: readonly string[];
  resetKey?: string;
  scopeRef: RefObject<HTMLElement | null>;
}) {
  const previousRef = useRef<AppendRevealBaseline | null>(null);
  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = reducedMotion || forcedColors;
  const keysSignature = JSON.stringify(keys);

  useEffect(() => {
    const currentKeys = JSON.parse(keysSignature) as string[];
    const previous = previousRef.current;
    previousRef.current = { keys: currentKeys, resetKey };
    if (!previous || previous.resetKey !== resetKey) return;

    const appendedKeys = selectWorkspaceAppendedKeys(previous.keys, currentKeys, 5);
    if (appendedKeys.length === 0) return;
    const appended = Array.from(
      scopeRef.current?.querySelectorAll<HTMLElement>('[data-append-key]') ?? [],
    ).filter((element) => appendedKeys.includes(element.dataset.appendKey ?? ''));
    if (appended.length === 0) return;

    const clearMotionStyles = () => {
      for (const element of appended) {
        element.style.removeProperty('opacity');
        element.style.removeProperty('transform');
      }
    };
    if (normalizeMotion) {
      clearMotionStyles();
      return;
    }

    const controls = animate(
      appended,
      { opacity: [0, 1], y: [6, 0] },
      {
        delay: stagger(0.025),
        duration: 0.18,
        ease: 'easeOut',
      },
    );
    void controls.finished.then(clearMotionStyles, () => undefined);

    return () => {
      controls.stop();
      clearMotionStyles();
    };
  }, [keysSignature, normalizeMotion, resetKey, scopeRef]);
}
