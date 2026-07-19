import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
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

gsap.registerPlugin(useGSAP);

const useBeforePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useWorkspaceOverlayMotion({
  kind,
  onExited,
  open,
  panelRef,
  scopeRef,
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
  const latestTokenRef = useRef(state.token);
  const onExitedRef = useRef(onExited);
  const previousAnimatedPhaseRef = useRef<'closing' | 'opening' | null>(null);
  latestTokenRef.current = state.token;
  onExitedRef.current = onExited;

  useBeforePaintEffect(() => {
    dispatch({ open, type: 'request' });
  }, [open]);

  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = reducedMotion || forcedColors;

  useGSAP(
    (_context, contextSafe) => {
      if (!contextSafe || (state.phase !== 'opening' && state.phase !== 'closing')) return;

      const token = state.token;
      const phase = state.phase;
      const complete = contextSafe(() => {
        if (latestTokenRef.current !== token) return;
        dispatch({ token: state.token, type: 'finish' });
        if (phase === 'closing') onExitedRef.current?.();
      });
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
        createTimeline: ({ onComplete }) => {
          const timeline = gsap.timeline({ onComplete });
          const wrapper = {
            kill: () => timeline.kill(),
            to: (target: object, vars: object, at: number) => {
              timeline.to(target, vars as gsap.TweenVars, at);
              return wrapper;
            },
          };
          return wrapper;
        },
        killTweensOf: (target) => gsap.killTweensOf(target),
        set: (target, vars) => {
          gsap.set(target, vars as gsap.TweenVars);
        },
      };

      return runWorkspaceOverlayMotion({
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
    },
    {
      dependencies: [kind, normalizeMotion, state.phase, state.token],
      revertOnUpdate: false,
      scope: scopeRef,
    },
  );

  useBeforePaintEffect(() => {
    if (state.phase !== 'open' && state.phase !== 'closed') return;
    const targets = [panelRef.current, scrimRef?.current].filter((target): target is HTMLElement =>
      Boolean(target),
    );
    if (targets.length > 0) gsap.set(targets, { clearProps: 'opacity,transform' });
  }, [panelRef, scrimRef, state.phase]);

  return state;
}
