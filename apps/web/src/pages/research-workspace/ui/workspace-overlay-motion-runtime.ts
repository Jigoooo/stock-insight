import type { WorkspaceOverlayMotionPlan } from './workspace-overlay-motion-controller';

type WorkspaceOverlayMotionControls = {
  finished: Promise<unknown>;
  stop: () => void;
};

export type WorkspaceOverlayMotionAdapter = {
  animate: (
    target: object,
    vars: object,
    options: { duration: number; ease: 'easeOut' },
  ) => WorkspaceOverlayMotionControls;
  set: (target: object, vars: object) => void;
};

export function runWorkspaceOverlayMotion({
  adapter,
  onComplete,
  plan,
  targets,
}: {
  adapter: WorkspaceOverlayMotionAdapter;
  onComplete: () => void;
  plan: WorkspaceOverlayMotionPlan;
  targets: { panel: object; scrim: object | null };
}) {
  const resolveTarget = (target: 'panel' | 'scrim') =>
    target === 'panel' ? targets.panel : targets.scrim;
  for (const step of plan.sets) {
    const target = resolveTarget(step.target);
    if (target) adapter.set(target, step.vars);
  }

  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    onComplete();
  };

  if (plan.completeSynchronously) {
    finish();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
    };
  }

  const controls: WorkspaceOverlayMotionControls[] = [];
  for (const step of plan.tweens) {
    const target = resolveTarget(step.target);
    if (!target) continue;
    controls.push(
      adapter.animate(target, step.vars, {
        duration: plan.duration,
        ease: 'easeOut',
      }),
    );
  }
  void Promise.all(controls.map((control) => control.finished)).then(finish, () => undefined);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const control of controls) control.stop();
  };
}
