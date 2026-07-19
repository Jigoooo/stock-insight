export type WorkspaceViewLayer<Content> = {
  content: Content;
  key: string;
};

export type WorkspaceViewState<Content> = {
  active: WorkspaceViewLayer<Content>;
  exiting: WorkspaceViewLayer<Content> | null;
};

export type WorkspaceViewAction<Content> =
  | { layer: WorkspaceViewLayer<Content>; type: 'sync' }
  | { activeKey: string; type: 'finish' };

export function createWorkspaceViewState<Content>(
  key: string,
  content: Content,
): WorkspaceViewState<Content> {
  return { active: { content, key }, exiting: null };
}

export function reduceWorkspaceViewState<Content>(
  state: WorkspaceViewState<Content>,
  action: WorkspaceViewAction<Content>,
): WorkspaceViewState<Content> {
  if (action.type === 'finish') {
    return state.active.key === action.activeKey ? { ...state, exiting: null } : state;
  }
  if (state.active.key === action.layer.key) {
    return { ...state, active: action.layer };
  }
  return { active: action.layer, exiting: state.active };
}
