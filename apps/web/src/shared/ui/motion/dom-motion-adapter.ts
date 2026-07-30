import {
  animate,
  motionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'motion/react';

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

type MotionProperty = 'opacity' | 'rotation' | 'scale' | 'x' | 'y';

type ActiveAnimation = {
  controls: AnimationPlaybackControls[];
  generation: number;
};

type ElementMotionState = {
  active?: ActiveAnimation;
  generation: number;
  stopEffect?: () => void;
  values: Partial<Record<MotionProperty, MotionValue<number>>>;
};

type MotionEase = 'easeIn' | 'easeInOut' | 'easeOut' | 'linear' | [number, number, number, number];

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

function motionEntries(vars: DomMotionVars): Array<[MotionProperty, number]> {
  const entries: Array<[MotionProperty, number]> = [];
  if (vars.opacity !== undefined) entries.push(['opacity', vars.opacity]);
  if (vars.x !== undefined) entries.push(['x', vars.x]);
  if (vars.y !== undefined) entries.push(['y', vars.y]);
  if (vars.scale !== undefined) entries.push(['scale', vars.scale]);
  if (vars.rotation !== undefined) entries.push(['rotation', vars.rotation]);
  return entries;
}

function readTransform(target: DomMotionTarget) {
  const transform = getComputedStyle(target).transform;
  if (transform === 'none') return { rotation: 0, scale: 1, x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return {
    rotation: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
    scale: Math.hypot(matrix.a, matrix.b),
    x: matrix.m41,
    y: matrix.m42,
  };
}

function readCurrentValue(target: DomMotionTarget, property: MotionProperty) {
  if (property === 'opacity') return Number(getComputedStyle(target).opacity);
  return readTransform(target)[property];
}

export function createMotionDomAdapter(): DomMotionAdapter {
  const states = new WeakMap<DomMotionTarget, ElementMotionState>();

  const bindState = (target: DomMotionTarget, state: ElementMotionState) => {
    state.stopEffect?.();
    const render = () => {
      const opacity = state.values.opacity?.get();
      if (opacity !== undefined) target.style.opacity = String(opacity);

      const hasTransform = Boolean(
        state.values.rotation || state.values.scale || state.values.x || state.values.y,
      );
      if (!hasTransform) return;
      const rotation = state.values.rotation?.get() ?? 0;
      const scale = state.values.scale?.get() ?? 1;
      const x = state.values.x?.get() ?? 0;
      const y = state.values.y?.get() ?? 0;
      target.style.transform = `translateX(${x}px) translateY(${y}px) scale(${scale}) rotate(${rotation}deg)`;
    };
    const subscriptions = Object.values(state.values).map((value) => value!.on('change', render));
    render();
    state.stopEffect = () => {
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  };

  const ensureState = (target: DomMotionTarget, vars: DomMotionVars) => {
    const state = states.get(target) ?? { generation: 0, values: {} };
    let addedValue = false;
    for (const [property] of motionEntries(vars)) {
      if (state.values[property]) continue;
      state.values[property] = motionValue(readCurrentValue(target, property));
      addedValue = true;
    }
    if (!states.has(target)) states.set(target, state);
    if (addedValue) bindState(target, state);
    return state;
  };

  const killTweensOf = (target: DomMotionTarget) => {
    const state = states.get(target);
    if (!state) return;
    state.generation += 1;
    for (const controls of state.active?.controls ?? []) controls.stop();
    state.active = undefined;
  };

  const clearProperties = (target: DomMotionTarget, clearProps: string) => {
    const state = states.get(target);
    if (state) {
      killTweensOf(target);
      state.stopEffect?.();
      state.stopEffect = undefined;
    }

    for (const property of clearProps.split(',').map((value) => value.trim())) {
      if (property === 'opacity') {
        state?.values.opacity?.destroy();
        if (state) delete state.values.opacity;
        target.style.removeProperty('opacity');
      }
      if (property === 'transform') {
        for (const transformProperty of ['rotation', 'scale', 'x', 'y'] as const) {
          state?.values[transformProperty]?.destroy();
          if (state) delete state.values[transformProperty];
        }
        target.style.removeProperty('transform');
      }
    }

    if (!state) return;
    if (Object.keys(state.values).length === 0) {
      states.delete(target);
      return;
    }
    bindState(target, state);
  };

  const set = (target: DomMotionTarget, vars: DomMotionVars) => {
    if (vars.clearProps) clearProperties(target, vars.clearProps);
    const entries = motionEntries(vars);
    if (entries.length === 0) return;
    killTweensOf(target);
    const state = ensureState(target, vars);
    for (const [property, value] of entries) state.values[property]?.set(value);
  };

  const to = (target: DomMotionTarget, vars: DomMotionVars) => {
    killTweensOf(target);
    const entries = motionEntries(vars);
    const state = ensureState(target, vars);
    const generation = state.generation + 1;
    state.generation = generation;
    const controls = entries.map(([property, value]) =>
      animate(state.values[property]!, value, {
        duration: vars.duration ?? 0,
        ease: resolveEase(vars.ease),
        repeat: vars.repeat === -1 ? Infinity : vars.repeat,
        repeatType: vars.yoyo ? 'reverse' : 'loop',
      }),
    );
    const active = { controls, generation };
    state.active = active;

    const complete = () => {
      if (state.active !== active || state.generation !== generation) return;
      state.active = undefined;
      if (vars.clearProps) clearProperties(target, vars.clearProps);
      vars.onComplete?.();
    };
    if (controls.length === 0) {
      queueMicrotask(complete);
      return;
    }
    void Promise.all(controls.map((animation) => animation.finished)).then(
      complete,
      () => undefined,
    );
  };

  const fromTo = (target: DomMotionTarget, from: DomMotionVars, toVars: DomMotionVars) => {
    killTweensOf(target);
    set(target, from);
    to(target, toVars);
  };

  return { fromTo, killTweensOf, set, to };
}
