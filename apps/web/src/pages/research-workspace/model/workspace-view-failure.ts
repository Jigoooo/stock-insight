export type WorkspaceViewFailureKind = 'timeout' | 'service' | 'unknown';

export function classifyWorkspaceViewFailure(error: unknown): WorkspaceViewFailureKind {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && (status >= 500 || status === 429)) return 'service';
  }
  return 'unknown';
}

export function workspaceViewFailureMessage(kind: WorkspaceViewFailureKind): string {
  if (kind === 'timeout') {
    return '응답 시간이 길어져 중단했습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (kind === 'service') {
    return '데이터 서비스 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  return '화면을 준비하지 못했습니다. 다시 시도해 주세요.';
}
