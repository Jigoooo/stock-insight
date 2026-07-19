import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import type { ReactNode } from 'react';

import {
  installDelegatedInteractionMotion,
  type DelegatedMotionElement,
  type MotionMediaQuery,
  type MotionRoot,
  type MotionTweenVars,
} from './interaction-motion-controller';
import { isMotionTargetUnavailable, resolveDelegatedMotionTarget } from './motion-contract';
import {
  readProfileMotionNumber,
  readProfileMotionSeconds,
  readProfileMotionValue,
} from './profile-motion';
import './motion-system.css';

gsap.registerPlugin(useGSAP);

export function InteractionMotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  useGSAP((_context, contextSafe) => {
    if (!contextSafe) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const runTween = contextSafe((element: DelegatedMotionElement, vars: MotionTweenVars) => {
      gsap.to(element, vars);
    });

    return installDelegatedInteractionMotion({
      finePointer: finePointer as MotionMediaQuery,
      isUnavailable: (element) => isMotionTargetUnavailable(element as HTMLElement),
      motion: {
        killTweensOf: (element) => gsap.killTweensOf(element),
        set: (element, vars) => {
          gsap.set(element, vars);
        },
        to: runTween,
      },
      motionPreference: motionPreference as MotionMediaQuery,
      readNumber: readProfileMotionNumber,
      readSeconds: readProfileMotionSeconds,
      readValue: readProfileMotionValue,
      resolveTarget: resolveDelegatedMotionTarget,
      root: document as MotionRoot,
    });
  }, []);

  return children;
}
