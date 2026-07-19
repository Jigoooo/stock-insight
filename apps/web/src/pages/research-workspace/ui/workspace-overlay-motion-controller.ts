export type WorkspaceOverlayKind = 'drawer' | 'inspector';
export type WorkspaceOverlayMotionPhase = 'closing' | 'opening';

type WorkspaceOverlayMotionTarget = 'panel' | 'scrim';

type WorkspaceOverlayMotionVars = {
  opacity?: number;
  x?: number;
  xPercent?: number;
  y?: number;
};

type WorkspaceOverlayMotionStep = {
  at?: number;
  target: WorkspaceOverlayMotionTarget;
  vars: WorkspaceOverlayMotionVars;
};

export type WorkspaceOverlayMotionPlan = {
  completeSynchronously: boolean;
  duration: number;
  sets: WorkspaceOverlayMotionStep[];
  tweens: WorkspaceOverlayMotionStep[];
};

function closedPanelVars(kind: WorkspaceOverlayKind): WorkspaceOverlayMotionVars {
  return kind === 'drawer' ? { x: 0, xPercent: -102 } : { opacity: 0.96, y: 12 };
}

export function createWorkspaceOverlayMotionPlan({
  initializeOpening = true,
  kind,
  phase,
  reducedMotion,
}: {
  initializeOpening?: boolean;
  kind: WorkspaceOverlayKind;
  phase: WorkspaceOverlayMotionPhase;
  reducedMotion: boolean;
}): WorkspaceOverlayMotionPlan {
  if (reducedMotion) {
    return {
      completeSynchronously: true,
      duration: 0,
      sets: [
        { target: 'scrim', vars: { opacity: phase === 'opening' ? 1 : 0 } },
        {
          target: 'panel',
          vars:
            phase === 'opening' ? { opacity: 1, x: 0, xPercent: 0, y: 0 } : closedPanelVars(kind),
        },
      ],
      tweens: [],
    };
  }

  const panelClosed = closedPanelVars(kind);
  const opening = phase === 'opening';
  return {
    completeSynchronously: false,
    duration: kind === 'drawer' ? 0.2 : 0.22,
    sets:
      opening && initializeOpening
        ? [
            { target: 'scrim', vars: { opacity: 0 } },
            { target: 'panel', vars: panelClosed },
          ]
        : [],
    tweens: [
      { at: 0, target: 'scrim', vars: { opacity: opening ? 1 : 0 } },
      {
        at: 0,
        target: 'panel',
        vars: opening
          ? kind === 'drawer'
            ? { x: 0, xPercent: 0 }
            : { opacity: 1, y: 0 }
          : panelClosed,
      },
    ],
  };
}
