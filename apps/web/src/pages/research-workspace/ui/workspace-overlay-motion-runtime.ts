import type { WorkspaceOverlayMotionPlan } from './workspace-overlay-motion-controller';

type WorkspaceOverlayMotionTimeline = {
  kill: () => void;
  to: (target: object, vars: object, at: number) => WorkspaceOverlayMotionTimeline;
};

export type WorkspaceOverlayMotionAdapter = {
  createTimeline: (options: {
    duration: number;
    onComplete: () => void;
  }) => WorkspaceOverlayMotionTimeline;
  killTweensOf: (target: object) => void;
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
  const availableTargets = [targets.panel, targets.scrim].filter(
    (target): target is object => target !== null,
  );
  for (const target of availableTargets) adapter.killTweensOf(target);

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
      for (const target of availableTargets) adapter.killTweensOf(target);
    };
  }

  const timeline = adapter.createTimeline({ duration: plan.duration, onComplete: finish });
  for (const step of plan.tweens) {
    const target = resolveTarget(step.target);
    if (!target) continue;
    timeline.to(
      target,
      {
        ...step.vars,
        duration: plan.duration,
        ease: 'power2.out',
        overwrite: 'auto',
      },
      step.at ?? 0,
    );
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    timeline.kill();
    for (const target of availableTargets) adapter.killTweensOf(target);
  };
}
