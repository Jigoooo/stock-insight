import { useCallback, useMemo, useSyncExternalStore } from 'react';

export const MOTION_PREFERENCE_QUERIES = [
  '(prefers-reduced-motion: reduce)',
  '(prefers-contrast: more)',
  '(forced-colors: active)',
] as const;

type MotionPreferenceQuery = (typeof MOTION_PREFERENCE_QUERIES)[number];
type MotionPreferenceListener = () => void;

export type MotionPreferenceMediaQuery = {
  matches: boolean;
  addEventListener: (type: 'change', listener: MotionPreferenceListener) => void;
  removeEventListener: (type: 'change', listener: MotionPreferenceListener) => void;
};

export type MotionPreferenceMatchMedia = (
  query: MotionPreferenceQuery,
) => MotionPreferenceMediaQuery;

export type MotionPreferences = {
  forcedColors: boolean;
  prefersMoreContrast: boolean;
  reducedMotion: boolean;
};

export type MotionTransitionElement = object;
export type MotionTransitionRecipe =
  | 'surface'
  | 'status'
  | 'feedback'
  | 'appended-row'
  | 'skeleton'
  | 'spinner';
export type MotionTransitionVars = {
  clearProps?: 'opacity,transform';
  duration?: number;
  ease?: string;
  onComplete?: () => void;
  opacity?: number;
  overwrite?: 'auto';
  repeat?: number;
  rotation?: number;
  x?: number;
  y?: number;
  yoyo?: boolean;
};
export type MotionTransitionAdapter = {
  fromTo: (
    element: MotionTransitionElement,
    from: MotionTransitionVars,
    to: MotionTransitionVars,
  ) => void;
  killTweensOf: (element: MotionTransitionElement) => void;
  set: (element: MotionTransitionElement, to: MotionTransitionVars) => void;
  to: (element: MotionTransitionElement, to: MotionTransitionVars) => void;
};

type MotionTransitionOptions = {
  element: MotionTransitionElement;
  onComplete?: () => void;
  recipe: MotionTransitionRecipe;
  reducedMotion: boolean;
};

const enterRecipes: Record<
  Exclude<MotionTransitionRecipe, 'skeleton' | 'spinner'>,
  { duration: number; from: MotionTransitionVars }
> = {
  surface: { duration: 0.2, from: { opacity: 0, y: 6 } },
  status: { duration: 0.14, from: { opacity: 0, y: 2 } },
  feedback: { duration: 0.16, from: { opacity: 0, y: 4 } },
  'appended-row': { duration: 0.16, from: { opacity: 0, y: 4 } },
};

function isLoopRecipe(
  recipe: MotionTransitionRecipe,
): recipe is Extract<MotionTransitionRecipe, 'skeleton' | 'spinner'> {
  return recipe === 'skeleton' || recipe === 'spinner';
}

export function createMotionTransitionController(adapter: MotionTransitionAdapter) {
  return {
    cleanup(element: MotionTransitionElement) {
      adapter.killTweensOf(element);
      adapter.set(element, { clearProps: 'opacity,transform' });
    },
    enter({ element, onComplete, recipe, reducedMotion }: MotionTransitionOptions) {
      adapter.killTweensOf(element);
      if (reducedMotion || isLoopRecipe(recipe)) {
        adapter.set(element, { opacity: 1, x: 0, y: 0 });
        onComplete?.();
        return;
      }
      const definition = enterRecipes[recipe];
      adapter.fromTo(element, definition.from, {
        duration: definition.duration,
        ease: 'power2.out',
        opacity: 1,
        overwrite: 'auto',
        x: 0,
        y: 0,
        ...(onComplete ? { onComplete } : {}),
      });
    },
    exit({ element, onComplete, reducedMotion }: MotionTransitionOptions) {
      adapter.killTweensOf(element);
      if (reducedMotion) {
        adapter.set(element, { opacity: 0, x: 0, y: 0 });
        onComplete?.();
        return;
      }
      adapter.to(element, {
        duration: 0.14,
        ease: 'power1.in',
        opacity: 0,
        overwrite: 'auto',
        y: -4,
        ...(onComplete ? { onComplete } : {}),
      });
    },
    loop({ element, recipe, reducedMotion }: MotionTransitionOptions) {
      adapter.killTweensOf(element);
      if (reducedMotion || !isLoopRecipe(recipe)) {
        adapter.set(element, { opacity: 1, rotation: 0 });
        return;
      }
      if (recipe === 'skeleton') {
        adapter.fromTo(
          element,
          { opacity: 0.55 },
          {
            duration: 0.8,
            ease: 'sine.inOut',
            opacity: 1,
            overwrite: 'auto',
            repeat: -1,
            yoyo: true,
          },
        );
        return;
      }
      adapter.fromTo(
        element,
        { rotation: 0 },
        {
          duration: 0.8,
          ease: 'none',
          overwrite: 'auto',
          repeat: -1,
          rotation: 360,
        },
      );
    },
  };
}

function browserMatchMedia(): MotionPreferenceMatchMedia | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return (query) => window.matchMedia(query) as MotionPreferenceMediaQuery;
}

export function subscribeMotionPreferences(
  onStoreChange: MotionPreferenceListener,
  matchMedia = browserMatchMedia(),
) {
  if (!matchMedia) return () => undefined;

  const subscriptions = MOTION_PREFERENCE_QUERIES.map((query) => {
    const target = matchMedia(query);
    const listener = () => onStoreChange();
    target.addEventListener('change', listener);
    return { listener, target };
  });

  return () => {
    for (const { listener, target } of subscriptions) {
      target.removeEventListener('change', listener);
    }
  };
}

function readPreferenceBits(matchMedia = browserMatchMedia()) {
  if (!matchMedia) return 0;
  return MOTION_PREFERENCE_QUERIES.reduce(
    (bits, query, index) => bits | (matchMedia(query).matches ? 1 << index : 0),
    0,
  );
}

export function useMotionPreferences(): MotionPreferences {
  const subscribe = useCallback(
    (onStoreChange: MotionPreferenceListener) => subscribeMotionPreferences(onStoreChange),
    [],
  );
  const getSnapshot = useCallback(() => readPreferenceBits(), []);
  const bits = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  return useMemo(
    () => ({
      reducedMotion: Boolean(bits & 1),
      prefersMoreContrast: Boolean(bits & 2),
      forcedColors: Boolean(bits & 4),
    }),
    [bits],
  );
}
