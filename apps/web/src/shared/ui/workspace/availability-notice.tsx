import { WorkspaceState } from './workspace-state';

import type { DataAvailability } from '@stock-insight/contracts';
import type { MarketComponentWatermark } from '@stock-insight/contracts/research-workspace';

export type WorkspaceAvailability = DataAvailability | MarketComponentWatermark['availability'];

function assertNeverAvailability(_availability: never): never {
  throw new Error('Unsupported workspace availability');
}

export function AvailabilityNotice({ availability }: { availability: WorkspaceAvailability }) {
  switch (availability) {
    case 'available':
      return null;
    case 'collecting':
      return (
        <WorkspaceState
          kind="loading"
          title="새 데이터를 정리하고 있습니다"
          description="준비된 내용부터 보여드리며, 수집이 끝나면 자동으로 상태가 바뀝니다."
        />
      );
    case 'stale':
    case 'text_only':
      return (
        <WorkspaceState
          kind="stale"
          title={
            availability === 'stale'
              ? '업데이트를 기다리는 데이터입니다'
              : '원문 연결이 제한되어 있습니다'
          }
          description="표시된 기준 시각을 확인하고, 중요한 판단에는 최신 출처를 함께 확인해 주세요."
        />
      );
    case 'partial':
      return (
        <WorkspaceState
          kind="partial"
          title="일부 데이터만 확인됐습니다"
          description="표시된 범위와 기준 시각을 확인하고, 누락된 근거가 채워질 때까지 판단 범위를 제한해 주세요."
        />
      );
    case 'error':
      return (
        <WorkspaceState
          kind="error"
          title="데이터를 확인하지 못했습니다"
          description="빈 결과로 처리하지 않았습니다. 잠시 후 다시 이 화면을 열어 주세요."
        />
      );
    case 'missing':
    case 'unsupported':
      return (
        <WorkspaceState
          kind="unavailable"
          title="현재 사용할 수 없는 데이터입니다"
          description="연결 범위가 준비되면 이곳에 상태와 결과가 표시됩니다."
        />
      );
    case 'empty':
      return (
        <WorkspaceState
          kind="empty"
          title="아직 보여드릴 데이터가 없습니다"
          description="수집 범위가 준비되면 이곳에 결과가 표시됩니다."
        />
      );
    default:
      return assertNeverAvailability(availability);
  }
}
