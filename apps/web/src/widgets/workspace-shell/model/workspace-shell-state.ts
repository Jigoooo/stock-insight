export type WorkspaceNavigationMode = 'expanded' | 'compact' | 'mobile';
export type WorkspaceDesktopMode = Exclude<WorkspaceNavigationMode, 'mobile'>;

export type WorkspaceShellState = {
  mode: WorkspaceNavigationMode;
  override: WorkspaceDesktopMode | null;
  mobileOpen: boolean;
};

export type WorkspaceShellAction =
  | { type: 'viewport-changed'; width: number }
  | { type: 'toggle-desktop-mode' }
  | { type: 'restore-desktop-mode'; mode: WorkspaceDesktopMode }
  | { type: 'set-mobile-open'; open: boolean }
  | { type: 'route-committed' };

export function resolveResponsiveNavigationMode(width: number): WorkspaceNavigationMode {
  if (width < 768) return 'mobile';
  if (width < 1240) return 'compact';
  return 'expanded';
}

export function createWorkspaceShellState(
  width: number,
  override: WorkspaceDesktopMode | null = null,
): WorkspaceShellState {
  const responsive = resolveResponsiveNavigationMode(width);
  return {
    mode: responsive === 'mobile' ? 'mobile' : (override ?? responsive),
    override,
    mobileOpen: false,
  };
}

export function reduceWorkspaceShellState(
  state: WorkspaceShellState,
  action: WorkspaceShellAction,
): WorkspaceShellState {
  if (action.type === 'restore-desktop-mode') {
    return {
      ...state,
      mode: state.mode === 'mobile' ? 'mobile' : action.mode,
      override: action.mode,
    };
  }
  if (action.type === 'viewport-changed') {
    const responsive = resolveResponsiveNavigationMode(action.width);
    return {
      ...state,
      mode: responsive === 'mobile' ? 'mobile' : (state.override ?? responsive),
      mobileOpen: responsive === 'mobile' ? state.mobileOpen : false,
    };
  }
  if (action.type === 'toggle-desktop-mode' && state.mode !== 'mobile') {
    const mode = state.mode === 'expanded' ? 'compact' : 'expanded';
    return { ...state, mode, override: mode };
  }
  if (action.type === 'set-mobile-open') return { ...state, mobileOpen: action.open };
  if (action.type === 'route-committed') return { ...state, mobileOpen: false };
  return state;
}
