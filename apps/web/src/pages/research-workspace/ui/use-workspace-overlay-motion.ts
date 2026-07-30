import { animate } from 'motion/react';
import { useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from 'react';

import {
  createWorkspaceOverlayMotionPlan,
  type WorkspaceOverlayKind,
} from './workspace-overlay-motion-controller';
import {
  runWorkspaceOverlayMotion,
  type WorkspaceOverlayMotionAdapter,
} from './workspace-overlay-motion-runtime';
import {
  createWorkspaceOverlayState,
  reduceWorkspaceOverlayState,
} from './workspace-overlay-transition-state';

import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';

const useBeforePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type WorkspaceMotionVars = {
  opacity?: number;
  x?: number;
  xPercent?: number;
  y?: number;
};

function resolveMotionVars(vars: WorkspaceMotionVars) {
  return {
    ...(vars.opacity === undefined ? {} : { opacity: vars.opacity }),
    ...(vars.xPercent === undefined
      ? vars.x === undefined
        ? {}
        : { x: vars.x }
      : { x: `${vars.xPercent}%` }),
    ...(vars.y === undefined ? {} : { y: vars.y }),
  };
}

function setMotionVars(target: HTMLElement, vars: WorkspaceMotionVars) {
  if (vars.opacity !== undefined) target.style.opacity = String(vars.opacity);
  const transforms: string[] = [];
  if (vars.xPercent !== undefined) transforms.push(`translateX(${vars.xPercent}%)`);
  else if (vars.x !== undefined) transforms.push(`translateX(${vars.x}px)`);
  if (vars.y !== undefined) transforms.push(`translateY(${vars.y}px)`);
  if (transforms.length > 0) target.style.transform = transforms.join(' ');
}

export function useWorkspaceOverlayMotion({
  kind,
  onExited,
  open,
  panelRef,
  scopeRef: _scopeRef,
  scrimRef,
}: {
  kind: WorkspaceOverlayKind;
  onExited?: () => void;
  open: boolean;
  panelRef: RefObject<HTMLElement | null>;
  scopeRef: RefObject<HTMLElement | null>;
  scrimRef?: RefObject<HTMLElement | null>;
}) {
  const [state, dispatch] = useReducer(
    reduceWorkspaceOverlayState,
    open,
    createWorkspaceOverlayState,
  );
  const onExitedRef = useRef(onExited);
  const previousAnimatedPhaseRef = useRef<'closing' | 'opening' | null>(null);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useBeforePaintEffect(() => {
    dispatch({ open, type: 'request' });
  }, [open]);

  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = reducedMotion || forcedColors;

  useBeforePaintEffect(() => {
    if (state.phase !== 'opening' && state.phase !== 'closing') return;

    const phase = state.phase;
    let active = true;
    const complete = () => {
      if (!active) return;
      dispatch({ token: state.token, type: 'finish' });
      if (phase === 'closing') onExitedRef.current?.();
    };
    const panel = panelRef.current;
    if (!panel) {
      complete();
      return;
    }
    const initializeOpening =
      phase === 'opening' &&
      (previousAnimatedPhaseRef.current === null || panel.style.transform === '');
    previousAnimatedPhaseRef.current = phase;

    const adapter: WorkspaceOverlayMotionAdapter = {
      animate: (target, vars, options) =>
        animate(target as HTMLElement, resolveMotionVars(vars as WorkspaceMotionVars), options),
      set: (target, vars) => setMotionVars(target as HTMLElement, vars as WorkspaceMotionVars),
    };

    const dispose = runWorkspaceOverlayMotion({
      adapter,
      onComplete: complete,
      plan: createWorkspaceOverlayMotionPlan({
        initializeOpening,
        kind,
        phase,
        reducedMotion: normalizeMotion,
      }),
      targets: { panel, scrim: scrimRef?.current ?? null },
    });
    return () => {
      active = false;
      dispose();
    };
  }, [kind, normalizeMotion, panelRef, scrimRef, state.phase, state.token]);

  useBeforePaintEffect(() => {
    if (state.phase !== 'open' && state.phase !== 'closed') return;
    const targets = [panelRef.current, scrimRef?.current].filter((target): target is HTMLElement =>
      Boolean(target),
    );
    for (const target of targets) {
      target.style.removeProperty('opacity');
      target.style.removeProperty('transform');
    }
  }, [panelRef, scrimRef, state.phase]);

  return state;
}
