import { gsap } from 'gsap';
import { useEffect, type ReactNode } from 'react';

import {
  readProfileMotionNumber,
  readProfileMotionSeconds,
  readProfileMotionValue,
} from './profile-motion';
import './motion-system.css';

const pressableSelector = [
  '[data-motion="pressable"]',
  '[data-motion="toggle"]',
  '[data-motion="switch"]',
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
].join(',');

function closestElement(target: EventTarget | null, selector: string) {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function resolvePressable(target: EventTarget | null) {
  const pressable = closestElement(target, pressableSelector);
  return pressable?.dataset.motion === 'none' ? null : pressable;
}

function isUnavailable(element: HTMLElement) {
  return (
    element.matches(':disabled') ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.hasAttribute('inert')
  );
}

function shouldReduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function InteractionMotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    const root = document.documentElement;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    root.dataset.motion = 'ready';

    const restorePressable = (element: HTMLElement) => {
      if (shouldReduceMotion()) {
        gsap.set(element, { clearProps: 'scale,y' });
        return;
      }
      gsap.to(element, {
        scale: 1,
        y: 0,
        duration: readProfileMotionSeconds('--duration-fast'),
        ease: readProfileMotionValue('--motion-ease-out'),
        overwrite: 'auto',
        onComplete: () => gsap.set(element, { clearProps: 'scale,y' }),
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const element = resolvePressable(event.target);
      if (!element || isUnavailable(element) || shouldReduceMotion()) return;
      gsap.to(element, {
        scale: element.matches('[data-motion="switch"], [data-motion="toggle"]')
          ? readProfileMotionNumber('--motion-toggle-scale')
          : readProfileMotionNumber('--motion-press-scale'),
        y: readProfileMotionNumber('--motion-press-y'),
        duration: readProfileMotionSeconds('--duration-press'),
        ease: readProfileMotionValue('--motion-ease-press'),
        overwrite: 'auto',
      });
    };

    const onPointerRelease = (event: PointerEvent) => {
      const element = resolvePressable(event.target);
      if (element) restorePressable(element);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || shouldReduceMotion()) return;
      const element = resolvePressable(event.target);
      if (!element || isUnavailable(element)) return;
      const previous = resolvePressable(event.relatedTarget);
      if (previous === element) return;
      gsap.to(element, {
        y: readProfileMotionNumber('--motion-hover-y'),
        duration: readProfileMotionSeconds('--duration-fast'),
        ease: readProfileMotionValue('--motion-ease-out'),
        overwrite: 'auto',
      });
    };

    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const element = resolvePressable(event.target);
      if (!element) return;
      const next = resolvePressable(event.relatedTarget);
      if (next === element) return;
      restorePressable(element);
    };

    const animateEntry = (element: HTMLElement) => {
      if (element.dataset.motionAnimated === 'true') return;
      element.dataset.motionAnimated = 'true';
      if (shouldReduceMotion()) {
        gsap.set(element, { opacity: 1, clearProps: 'transform' });
        return;
      }
      gsap.fromTo(
        element,
        {
          opacity: 0,
          y: readProfileMotionNumber('--motion-entry-y'),
          scale: readProfileMotionNumber('--motion-entry-scale'),
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: readProfileMotionSeconds('--duration-base'),
          ease: readProfileMotionValue('--motion-ease-out'),
          clearProps: 'opacity,transform',
        },
      );
    };

    const animateLoop = (element: HTMLElement) => {
      if (element.dataset.motionLoopActive === 'true') return;
      element.dataset.motionLoopActive = 'true';
      if (element.dataset.motionLoop === 'spinner') {
        if (shouldReduceMotion()) {
          gsap.set(element, { rotation: 0 });
          return;
        }
        gsap.to(element, {
          rotation: 360,
          duration: readProfileMotionSeconds('--motion-spinner-duration'),
          ease: readProfileMotionValue('--motion-spinner-ease'),
          repeat: -1,
        });
        return;
      }
      if (shouldReduceMotion()) {
        gsap.set(element, { opacity: readProfileMotionNumber('--motion-pulse-static-opacity') });
        return;
      }
      gsap.fromTo(
        element,
        { opacity: readProfileMotionNumber('--motion-pulse-min-opacity') },
        {
          opacity: 1,
          duration: readProfileMotionSeconds('--motion-pulse-duration'),
          ease: readProfileMotionValue('--motion-ease-loop'),
          repeat: -1,
          yoyo: true,
        },
      );
    };

    const animateEntries = (node: ParentNode) => {
      if (node instanceof HTMLElement && node.matches('[data-motion-enter]')) animateEntry(node);
      node.querySelectorAll<HTMLElement>('[data-motion-enter]').forEach(animateEntry);
      if (node instanceof HTMLElement && node.matches('[data-motion-loop]')) animateLoop(node);
      node.querySelectorAll<HTMLElement>('[data-motion-loop]').forEach(animateLoop);
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) animateEntries(node);
        });
      }
    });
    animateEntries(document);
    observer.observe(document.body, { childList: true, subtree: true });

    const onMotionPreferenceChange = () => {
      const pressables = document.querySelectorAll<HTMLElement>(pressableSelector);
      const entries = document.querySelectorAll<HTMLElement>('[data-motion-enter]');
      const loops = document.querySelectorAll<HTMLElement>('[data-motion-loop]');
      gsap.killTweensOf([...pressables, ...entries, ...loops]);

      if (motionPreference.matches) {
        pressables.forEach((element) => gsap.set(element, { clearProps: 'scale,y' }));

        entries.forEach((element) => gsap.set(element, { opacity: 1, clearProps: 'transform' }));
        loops.forEach((element) => {
          element.dataset.motionLoopActive = 'true';
          gsap.set(
            element,
            element.dataset.motionLoop === 'spinner'
              ? { rotation: 0 }
              : { opacity: readProfileMotionNumber('--motion-pulse-static-opacity') },
          );
        });
        return;
      }

      loops.forEach((element) => {
        delete element.dataset.motionLoopActive;
        animateLoop(element);
      });
    };
    motionPreference.addEventListener('change', onMotionPreferenceChange);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerRelease, true);
    document.addEventListener('pointercancel', onPointerRelease, true);
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);

    return () => {
      observer.disconnect();
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      delete root.dataset.motion;
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerRelease, true);
      document.removeEventListener('pointercancel', onPointerRelease, true);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      gsap.killTweensOf(`${pressableSelector},[data-motion-enter],[data-motion-loop]`);
    };
  }, []);

  return children;
}
