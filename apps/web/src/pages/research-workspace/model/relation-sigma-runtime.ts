/**
 * Minimum viewport travel (in CSS px) before a pointer gesture is treated as a
 * drag. Below this, a press-and-release is a click: a single jitter frame from a
 * trackpad/touch must not suppress selection or trigger a camera refit.
 */
export const RELATION_DRAG_MOVE_THRESHOLD_PX = 5;

export type RelationDragState = {
  activeNode: string | null;
  originX: number;
  originY: number;
  moved: boolean;
  suppressNextClick: boolean;
};

export type RelationDragEvent =
  | { type: 'down'; node: string; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'up' }
  | { type: 'click' }
  | { type: 'expire-click-suppression' };

export type RelationDragTransition = {
  state: RelationDragState;
  completedNode?: string;
  moved: boolean;
  suppressClick: boolean;
};

export function createRelationDragState(): RelationDragState {
  return {
    activeNode: null,
    originX: 0,
    originY: 0,
    moved: false,
    suppressNextClick: false,
  };
}

export function transitionRelationDrag(
  state: RelationDragState,
  event: RelationDragEvent,
): RelationDragTransition {
  if (event.type === 'down') {
    return {
      state: {
        activeNode: event.node,
        originX: event.x,
        originY: event.y,
        moved: false,
        suppressNextClick: false,
      },
      moved: false,
      suppressClick: false,
    };
  }

  if (event.type === 'move') {
    if (!state.activeNode) return { state, moved: false, suppressClick: false };
    const dx = event.x - state.originX;
    const dy = event.y - state.originY;
    const moved = state.moved || Math.hypot(dx, dy) >= RELATION_DRAG_MOVE_THRESHOLD_PX;
    return {
      state: moved === state.moved ? state : { ...state, moved },
      moved,
      suppressClick: false,
    };
  }

  if (event.type === 'up') {
    if (!state.activeNode) return { state, moved: false, suppressClick: false };
    return {
      state: {
        activeNode: null,
        originX: 0,
        originY: 0,
        moved: false,
        suppressNextClick: state.moved,
      },
      completedNode: state.activeNode,
      moved: state.moved,
      suppressClick: false,
    };
  }

  if (event.type === 'expire-click-suppression') {
    return {
      state: state.suppressNextClick ? { ...state, suppressNextClick: false } : state,
      moved: false,
      suppressClick: false,
    };
  }

  const suppressClick = state.suppressNextClick;
  return {
    state: suppressClick ? { ...state, suppressNextClick: false } : state,
    moved: false,
    suppressClick,
  };
}

type Killable = {
  kill: () => void;
};

export function createRelationRuntimeCleanup() {
  let renderer: Killable | undefined;
  let layout: Killable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bboxTimer: ReturnType<typeof setTimeout> | undefined;
  const trackedTimers = new Set<ReturnType<typeof setTimeout>>();
  let cleaned = false;

  function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  }

  function clearBBoxTimer() {
    if (!bboxTimer) return;
    clearTimeout(bboxTimer);
    bboxTimer = undefined;
  }

  return {
    setRenderer(resource: Killable) {
      if (cleaned) resource.kill();
      else renderer = resource;
    },
    setLayout(resource: Killable | null) {
      if (!resource) return;
      if (cleaned) resource.kill();
      else layout = resource;
    },
    setTimer(nextTimer: ReturnType<typeof setTimeout>) {
      clearTimer();
      if (cleaned) clearTimeout(nextTimer);
      else timer = nextTimer;
    },
    setBBoxTimer(nextTimer: ReturnType<typeof setTimeout>) {
      clearBBoxTimer();
      if (cleaned) clearTimeout(nextTimer);
      else bboxTimer = nextTimer;
    },
    trackTimer(nextTimer: ReturnType<typeof setTimeout>) {
      if (cleaned) clearTimeout(nextTimer);
      else trackedTimers.add(nextTimer);
    },
    clearTimer,
    clearBBoxTimer,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimer();
      clearBBoxTimer();
      for (const trackedTimer of trackedTimers) clearTimeout(trackedTimer);
      trackedTimers.clear();
      layout?.kill();
      renderer?.kill();
      layout = undefined;
      renderer = undefined;
    },
  };
}
