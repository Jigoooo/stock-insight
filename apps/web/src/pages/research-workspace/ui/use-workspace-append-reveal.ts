import { animate, stagger } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { selectWorkspaceAppendedKeys } from '../model/workspace-append-reveal';

import { useMotionPreferences } from '@/shared/ui/motion';

type AppendRevealBaseline = {
  keys: readonly string[];
  resetKey: string;
};

const useBeforePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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

  useBeforePaintEffect(() => {
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

    for (const element of appended) {
      element.style.opacity = '0';
      element.style.transform = 'translateY(6px)';
    }
    const controls = animate(
      appended,
      { opacity: 1, y: 0 },
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
