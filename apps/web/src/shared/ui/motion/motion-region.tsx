import { useCallback, useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

import { createMotionDomAdapter } from './dom-motion-adapter';
import {
  createMotionTransitionController,
  useMotionPreferences,
  type MotionTransitionRecipe,
} from './use-motion-preferences';

type MotionRegionElement = 'article' | 'div' | 'section' | 'span';

type MotionRegionProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  as?: MotionRegionElement;
  children?: ReactNode;
  onEnterComplete?: () => void;
  onExitComplete?: () => void;
  present?: boolean;
  recipe: MotionTransitionRecipe;
  stateKey?: string | number;
};

export function MotionRegion({
  as = 'div',
  children,
  onEnterComplete,
  onExitComplete,
  present = true,
  recipe,
  stateKey,
  ...props
}: MotionRegionProps) {
  const elementRef = useRef<HTMLElement>(null);
  const setElementRef = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);
  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = reducedMotion || forcedColors;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const domMotion = createMotionDomAdapter();
    const controller = createMotionTransitionController({
      fromTo: (target, from, to) => domMotion.fromTo(target as HTMLElement, from, to),
      killTweensOf: (target) => domMotion.killTweensOf(target as HTMLElement),
      set: (target, to) => domMotion.set(target as HTMLElement, to),
      to: (target, to) => domMotion.to(target as HTMLElement, to),
    });

    if (recipe === 'skeleton' || recipe === 'spinner') {
      controller.loop({ element, recipe, reducedMotion: normalizeMotion });
    } else if (present) {
      controller.enter({
        element,
        onComplete: onEnterComplete,
        recipe,
        reducedMotion: normalizeMotion,
      });
    } else {
      controller.exit({
        element,
        onComplete: onExitComplete,
        recipe,
        reducedMotion: normalizeMotion,
      });
    }

    return () => controller.cleanup(element);
  }, [
    forcedColors,
    normalizeMotion,
    onEnterComplete,
    onExitComplete,
    present,
    recipe,
    reducedMotion,
    stateKey,
  ]);

  const regionProps = {
    ...props,
    'aria-hidden': present ? props['aria-hidden'] : true,
    'data-motion-recipe': recipe,
    'data-motion-region': '',
  };
  if (as === 'span') {
    return (
      <span ref={setElementRef} {...regionProps}>
        {children}
      </span>
    );
  }
  if (as === 'article') {
    return (
      <article ref={setElementRef} {...regionProps}>
        {children}
      </article>
    );
  }
  if (as === 'section') {
    return (
      <section ref={setElementRef} {...regionProps}>
        {children}
      </section>
    );
  }
  return (
    <div ref={setElementRef} {...regionProps}>
      {children}
    </div>
  );
}
