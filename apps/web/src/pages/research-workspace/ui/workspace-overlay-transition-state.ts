export type WorkspaceOverlayPhase = 'closed' | 'closing' | 'open' | 'opening';

export type WorkspaceOverlayState = {
  desiredOpen: boolean;
  phase: WorkspaceOverlayPhase;
  rendered: boolean;
  token: number;
};

export type WorkspaceOverlayAction =
  | { open: boolean; type: 'request' }
  | { token: number; type: 'finish' };

export function createWorkspaceOverlayState(open: boolean): WorkspaceOverlayState {
  return {
    desiredOpen: open,
    phase: open ? 'open' : 'closed',
    rendered: open,
    token: 0,
  };
}

export function reduceWorkspaceOverlayState(
  state: WorkspaceOverlayState,
  action: WorkspaceOverlayAction,
): WorkspaceOverlayState {
  if (action.type === 'request') {
    if (state.desiredOpen === action.open) return state;
    return {
      desiredOpen: action.open,
      phase: action.open ? 'opening' : 'closing',
      rendered: action.open || state.rendered,
      token: state.token + 1,
    };
  }

  if (action.token !== state.token) return state;
  if (state.phase === 'opening') return { ...state, phase: 'open' };
  if (state.phase === 'closing') return { ...state, phase: 'closed', rendered: false };
  return state;
}
