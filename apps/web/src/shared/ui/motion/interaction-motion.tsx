import { useEffect, type ReactNode } from 'react';

import { createMotionDomAdapter } from './dom-motion-adapter';
import {
  installDelegatedInteractionMotion,
  type InteractionMotionAdapter,
  type MotionMediaQuery,
  type MotionRoot,
} from './interaction-motion-controller';
import { isMotionTargetUnavailable, resolveDelegatedMotionTarget } from './motion-contract';
import {
  readProfileMotionNumber,
  readProfileMotionSeconds,
  readProfileMotionValue,
} from './profile-motion';
import './motion-system.css';

export function InteractionMotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const domMotion = createMotionDomAdapter();
    const adapter: InteractionMotionAdapter = {
      killTweensOf: (element) => domMotion.killTweensOf(element as HTMLElement),
      set: (element, vars) => domMotion.set(element as HTMLElement, vars),
      to: (element, vars) => domMotion.to(element as HTMLElement, vars),
    };

    return installDelegatedInteractionMotion({
      finePointer: finePointer as MotionMediaQuery,
      isUnavailable: (element) => isMotionTargetUnavailable(element as HTMLElement),
      motion: adapter,
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
