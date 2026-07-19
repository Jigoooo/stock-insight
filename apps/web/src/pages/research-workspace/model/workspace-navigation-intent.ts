export type WorkspaceNavigationIntentState = {
  pendingLane: string | null;
  pendingSection: string | null;
  sequence: number;
};

type WorkspaceNavigationIntentAction =
  | {
      kind: 'lane' | 'section';
      sequence: number;
      type: 'request';
      value: string;
    }
  | {
      sequence: number;
      type: 'settle';
    };

export function createWorkspaceNavigationIntentState(sequence = 0): WorkspaceNavigationIntentState {
  return {
    pendingLane: null,
    pendingSection: null,
    sequence,
  };
}

export function reduceWorkspaceNavigationIntent(
  state: WorkspaceNavigationIntentState,
  action: WorkspaceNavigationIntentAction,
): WorkspaceNavigationIntentState {
  if (action.type === 'request') {
    if (action.sequence <= state.sequence) return state;
    return {
      pendingLane: action.kind === 'lane' ? action.value : null,
      pendingSection: action.kind === 'section' ? action.value : null,
      sequence: action.sequence,
    };
  }
  if (action.sequence !== state.sequence) return state;
  return createWorkspaceNavigationIntentState(state.sequence);
}
