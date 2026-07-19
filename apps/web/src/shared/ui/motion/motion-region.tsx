import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useCallback, useRef, type HTMLAttributes, type ReactNode } from 'react';

import {
  createMotionTransitionController,
  useMotionPreferences,
  type MotionTransitionRecipe,
} from './use-motion-preferences';

gsap.registerPlugin(useGSAP);

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

  useGSAP(
    () => {
      const element = elementRef.current;
      if (!element) return;
      const controller = createMotionTransitionController({
        fromTo: (target, from, to) => {
          gsap.fromTo(target, from, to);
        },
        killTweensOf: (target) => gsap.killTweensOf(target),
        set: (target, to) => {
          gsap.set(target, to);
        },
        to: (target, to) => {
          gsap.to(target, to);
        },
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
    },
    {
      dependencies: [
        forcedColors,
        onEnterComplete,
        onExitComplete,
        present,
        recipe,
        reducedMotion,
        stateKey,
      ],
      revertOnUpdate: true,
      scope: elementRef,
    },
  );

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
