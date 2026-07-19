import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useRef, type RefObject } from 'react';

import { selectWorkspaceAppendedKeys } from '../model/workspace-append-reveal';

import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';

gsap.registerPlugin(useGSAP);

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
  const keysSignature = keys.join('\u0000');

  useGSAP(
    () => {
      const previous = previousRef.current;
      previousRef.current = { keys, resetKey };
      if (!previous || previous.resetKey !== resetKey) return;

      const appendedKeys = selectWorkspaceAppendedKeys(previous.keys, keys, 5);
      if (appendedKeys.length === 0) return;
      const appended = Array.from(
        scopeRef.current?.querySelectorAll<HTMLElement>('[data-append-key]') ?? [],
      ).filter((element) => appendedKeys.includes(element.dataset.appendKey ?? ''));
      if (appended.length === 0) return;

      gsap.killTweensOf(appended);
      if (normalizeMotion) {
        gsap.set(appended, { clearProps: 'opacity,transform' });
        return;
      }
      gsap.fromTo(
        appended,
        { opacity: 0, y: 6 },
        {
          clearProps: 'opacity,transform',
          duration: 0.18,
          ease: 'power2.out',
          opacity: 1,
          overwrite: 'auto',
          stagger: 0.025,
          y: 0,
        },
      );
      return () => {
        gsap.killTweensOf(appended);
        gsap.set(appended, { clearProps: 'opacity,transform' });
      };
    },
    {
      dependencies: [keysSignature, normalizeMotion, resetKey],
      revertOnUpdate: true,
      scope: scopeRef,
    },
  );
}
