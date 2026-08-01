import { Component, useLayoutEffect, type ReactNode } from 'react';

import { Button } from '@/shared/ui/button';
import { WorkspaceState } from '@/shared/ui/workspace';

export function WorkspaceViewReady({
  children,
  onReady,
  viewKey,
}: Readonly<{
  children: ReactNode;
  onReady: (viewKey: string) => void;
  viewKey: string;
}>) {
  useLayoutEffect(() => onReady(viewKey), [onReady, viewKey]);
  return children;
}

type WorkspaceViewErrorBoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
};

type WorkspaceViewErrorBoundaryState = {
  failed: boolean;
};

export class WorkspaceViewErrorBoundary extends Component<
  WorkspaceViewErrorBoundaryProps,
  WorkspaceViewErrorBoundaryState
> {
  state: WorkspaceViewErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): WorkspaceViewErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <WorkspaceState
          action={
            <Button data-testid="workspace-view-chunk-retry" onClick={this.props.onRetry}>
              화면 다시 불러오기
            </Button>
          }
          kind="error"
          title="워크스페이스 화면을 불러오지 못했습니다"
          description="화면 파일을 불러오는 중 문제가 생겼습니다. 셸과 탐색 상태는 유지됩니다."
        />
      );
    }
    return this.props.children;
  }
}
