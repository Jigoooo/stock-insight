import type { HTMLMotionProps } from 'motion/react';

type EffectViewport = NonNullable<HTMLMotionProps<'div'>['viewport']>;

export type MotionButtonScaleOptions = {
  hoverScale?: number;
  tapScale?: number;
};

export type EffectDirection = 'up' | 'down' | 'left' | 'right';

export type FadeEffect = boolean | { initialOpacity?: number; opacity?: number };
export type SlideEffect =
  | boolean
  | {
      direction?: EffectDirection;
      offset?: number;
    };
export type ZoomEffect = boolean | { initialScale?: number; scale?: number };

export type EffectAnimationOptions = {
  blur?: boolean | string;
  delay?: number;
  fade?: FadeEffect;
  inView?: boolean;
  inViewMargin?: EffectViewport['margin'];
  inViewOnce?: boolean;
  slide?: SlideEffect;
  zoom?: ZoomEffect;
};

type MotionValues = {
  filter?: string;
  opacity?: number;
  scale?: number;
  x?: number;
  y?: number;
};

const shortSpring = {
  damping: 30,
  mass: 0.6,
  stiffness: 420,
  type: 'spring',
} as const;

export function resolveMotionButtonAnimation({
  hoverScale = 1.012,
  tapScale = 0.978,
}: MotionButtonScaleOptions) {
  return {
    transition: shortSpring,
    whileHover: { scale: hoverScale },
    whileTap: { scale: tapScale },
  };
}

function resolveSlide(slide: SlideEffect) {
  const { direction = 'up', offset = 16 } = typeof slide === 'object' ? slide : {};

  switch (direction) {
    case 'down':
      return { y: -offset };
    case 'left':
      return { x: -offset };
    case 'right':
      return { x: offset };
    case 'up':
      return { y: offset };
  }
}

export function resolveEffectAnimation({
  blur = false,
  delay = 0,
  fade = false,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  slide = false,
  zoom = false,
}: EffectAnimationOptions) {
  const initial: MotionValues = {};
  const target: MotionValues = {};

  if (fade) {
    const fadeOptions = typeof fade === 'object' ? fade : {};
    initial.opacity = fadeOptions.initialOpacity ?? 0;
    target.opacity = fadeOptions.opacity ?? 1;
  }

  if (slide) {
    Object.assign(initial, resolveSlide(slide));
    if ('x' in initial) target.x = 0;
    if ('y' in initial) target.y = 0;
  }

  if (zoom) {
    const zoomOptions = typeof zoom === 'object' ? zoom : {};
    initial.scale = zoomOptions.initialScale ?? 0.96;
    target.scale = zoomOptions.scale ?? 1;
  }

  if (blur) {
    const initialBlur = typeof blur === 'string' ? blur : '6px';
    initial.filter = `blur(${initialBlur})`;
    target.filter = 'blur(0px)';
  }

  return {
    animate: inView ? undefined : target,
    initial,
    transition: { delay, duration: 0.24, ease: 'easeOut' as const },
    viewport: inView
      ? { amount: 'some' as const, margin: inViewMargin, once: inViewOnce }
      : undefined,
    whileInView: inView ? target : undefined,
  };
}

export function resolveEffectChildDelay({
  delay = 0,
  holdDelay = 0,
  index,
}: {
  delay?: number;
  holdDelay?: number;
  index: number;
}) {
  return holdDelay + delay * index;
}
