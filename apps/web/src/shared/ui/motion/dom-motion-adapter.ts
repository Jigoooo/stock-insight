import { animate, type AnimationPlaybackControls, type DOMKeyframesDefinition } from 'motion/react';

export type DomMotionTarget = HTMLElement;

export type DomMotionVars = {
  clearProps?: string;
  duration?: number;
  ease?: string;
  onComplete?: () => void;
  opacity?: number;
  overwrite?: 'auto';
  repeat?: number;
  rotation?: number;
  scale?: number;
  x?: number;
  y?: number;
  yoyo?: boolean;
};

export type DomMotionAdapter = {
  fromTo: (target: DomMotionTarget, from: DomMotionVars, to: DomMotionVars) => void;
  killTweensOf: (target: DomMotionTarget) => void;
  set: (target: DomMotionTarget, vars: DomMotionVars) => void;
  to: (target: DomMotionTarget, vars: DomMotionVars) => void;
};

type TransformState = {
  rotation: number;
  scale: number;
  x: number;
  y: number;
};

type MotionEase = 'easeIn' | 'easeInOut' | 'easeOut' | 'linear' | [number, number, number, number];

const defaultTransformState = (): TransformState => ({ rotation: 0, scale: 1, x: 0, y: 0 });

function resolveEase(ease: string | undefined): MotionEase {
  if (!ease || ease === 'none' || ease === 'linear') return 'linear';
  if (ease === 'power1.in') return 'easeIn';
  if (ease === 'sine.inOut') return 'easeInOut';
  if (ease === 'power1.out' || ease === 'power2.out') return 'easeOut';

  const bezier = ease.match(
    /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/,
  );
  if (!bezier) return 'easeOut';
  return [Number(bezier[1]), Number(bezier[2]), Number(bezier[3]), Number(bezier[4])];
}

function keyframesFrom(vars: DomMotionVars): DOMKeyframesDefinition {
  const keyframes: DOMKeyframesDefinition = {};
  if (vars.opacity !== undefined) keyframes.opacity = vars.opacity;
  if (vars.x !== undefined) keyframes.x = vars.x;
  if (vars.y !== undefined) keyframes.y = vars.y;
  if (vars.scale !== undefined) keyframes.scale = vars.scale;
  if (vars.rotation !== undefined) keyframes.rotate = vars.rotation;
  return keyframes;
}

function hasTransform(vars: DomMotionVars) {
  return (
    vars.x !== undefined ||
    vars.y !== undefined ||
    vars.scale !== undefined ||
    vars.rotation !== undefined
  );
}

export function createMotionDomAdapter(): DomMotionAdapter {
  const activeAnimations = new WeakMap<DomMotionTarget, AnimationPlaybackControls>();
  const transformStates = new WeakMap<DomMotionTarget, TransformState>();

  const killTweensOf = (target: DomMotionTarget) => {
    activeAnimations.get(target)?.stop();
    activeAnimations.delete(target);
  };

  const clearProperties = (target: DomMotionTarget, clearProps: string) => {
    for (const property of clearProps.split(',').map((value) => value.trim())) {
      if (property === 'opacity') target.style.removeProperty('opacity');
      if (property === 'transform') {
        target.style.removeProperty('transform');
        transformStates.delete(target);
      }
    }
  };

  const set = (target: DomMotionTarget, vars: DomMotionVars) => {
    if (vars.clearProps) clearProperties(target, vars.clearProps);
    if (vars.opacity !== undefined) target.style.opacity = String(vars.opacity);
    if (!hasTransform(vars)) return;

    const next = { ...(transformStates.get(target) ?? defaultTransformState()) };
    if (vars.x !== undefined) next.x = vars.x;
    if (vars.y !== undefined) next.y = vars.y;
    if (vars.scale !== undefined) next.scale = vars.scale;
    if (vars.rotation !== undefined) next.rotation = vars.rotation;
    transformStates.set(target, next);
    target.style.transform = `translateX(${next.x}px) translateY(${next.y}px) scale(${next.scale}) rotate(${next.rotation}deg)`;
  };

  const to = (target: DomMotionTarget, vars: DomMotionVars) => {
    killTweensOf(target);
    if (hasTransform(vars)) {
      const next = { ...(transformStates.get(target) ?? defaultTransformState()) };
      if (vars.x !== undefined) next.x = vars.x;
      if (vars.y !== undefined) next.y = vars.y;
      if (vars.scale !== undefined) next.scale = vars.scale;
      if (vars.rotation !== undefined) next.rotation = vars.rotation;
      transformStates.set(target, next);
    }
    const keyframes = keyframesFrom(vars);
    const controls = animate(target, keyframes, {
      duration: vars.duration ?? 0,
      ease: resolveEase(vars.ease),
      onComplete: () => {
        queueMicrotask(() => {
          if (activeAnimations.get(target) !== controls) return;
          activeAnimations.delete(target);
          if (vars.clearProps) clearProperties(target, vars.clearProps);
          vars.onComplete?.();
        });
      },
      repeat: vars.repeat === -1 ? Infinity : vars.repeat,
      repeatType: vars.yoyo ? 'reverse' : 'loop',
    });
    activeAnimations.set(target, controls);
  };

  const fromTo = (target: DomMotionTarget, from: DomMotionVars, toVars: DomMotionVars) => {
    killTweensOf(target);
    set(target, from);
    to(target, toVars);
  };

  return { fromTo, killTweensOf, set, to };
}
