export type ControlMotionKind = 'switch' | 'toggle';
export type ControlMotionTarget = object;

export type ControlMotionVars = {
  clearProps?: 'opacity' | 'transform';
  duration?: number;
  ease?: string;
  opacity?: number;
  overwrite?: 'auto';
  x?: number;
};

export type ControlMotionAdapter = {
  killTweensOf: (target: ControlMotionTarget) => void;
  set: (target: ControlMotionTarget, vars: ControlMotionVars) => void;
  to: (target: ControlMotionTarget, vars: ControlMotionVars) => void;
};

type ApplyControlStateMotionOptions = {
  active: boolean;
  adapter: ControlMotionAdapter;
  duration: number;
  ease: string;
  kind: ControlMotionKind;
  reducedMotion: boolean;
  target: ControlMotionTarget;
};

type ClearControlStateMotionOptions = Pick<
  ApplyControlStateMotionOptions,
  'adapter' | 'kind' | 'target'
>;

const SWITCH_THUMB_TRAVEL = 18;

type ControlChangeGuard = {
  defaultPrevented: boolean;
  disabled?: boolean;
  pending?: boolean;
};

export function shouldCommitControlChange({
  defaultPrevented,
  disabled,
  pending,
}: ControlChangeGuard) {
  return !defaultPrevented && !disabled && !pending;
}

export function clearControlStateMotion({ adapter, kind, target }: ClearControlStateMotionOptions) {
  adapter.killTweensOf(target);
  adapter.set(target, { clearProps: kind === 'switch' ? 'transform' : 'opacity' });
}

export function applyControlStateMotion({
  active,
  adapter,
  duration,
  ease,
  kind,
  reducedMotion,
  target,
}: ApplyControlStateMotionOptions) {
  adapter.killTweensOf(target);
  const finalState =
    kind === 'switch' ? { x: active ? SWITCH_THUMB_TRAVEL : 0 } : { opacity: active ? 1 : 0 };
  if (reducedMotion) {
    adapter.set(target, finalState);
    return;
  }
  adapter.to(target, { ...finalState, duration, ease, overwrite: 'auto' });
}
