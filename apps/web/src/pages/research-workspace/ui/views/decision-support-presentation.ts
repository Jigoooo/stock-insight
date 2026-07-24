import type {
  DecisionSupportPacket,
  DecisionSupportSummary,
} from '@stock-insight/contracts/research-workspace';

const actionLabels: Record<NonNullable<DecisionSupportPacket['action']>, string> = {
  ADD: '추가 검토',
  HOLD: '현 상태 유지',
  REDUCE: '비중 축소 검토',
  EXIT: '논지 무효화 검토',
  WATCH: '관찰 유지',
  NO_ACTION: '변경 없음',
  INSUFFICIENT_DATA: '판단 보류',
};

export type DecisionSupportPresentation = {
  state: 'empty' | 'restricted' | 'visible';
  eyebrow: string;
  title: string;
  description: string;
  executionBoundary: string;
  interactive: false;
};

export function getDecisionSupportPresentation(
  data: DecisionSupportSummary,
): DecisionSupportPresentation {
  const packet = data.latestPacket;
  const executionBoundary =
    !packet || (packet.adviceProhibited && !packet.orderExecutable)
      ? '주문 기능과 연결되지 않습니다.'
      : '경계 검증 실패';

  if (!packet) {
    return {
      state: 'empty',
      eyebrow: '준비 상태',
      title:
        data.sourceState === 'migration_missing'
          ? '판단 지원 원장을 준비 중입니다.'
          : '생성된 판단 패킷이 없습니다.',
      description: '검증 가능한 공통 근거와 판단 기록이 생성되면 이곳에 표시됩니다.',
      executionBoundary,
      interactive: false,
    };
  }

  if (packet.restrictionReason !== null) {
    const expired = packet.restrictionReason === 'PACKET_EXPIRED';
    return {
      state: 'restricted',
      eyebrow: packet.entityName,
      title: expired ? '판단 패킷 만료' : '법률 검토 전',
      description: expired
        ? '유효 기한이 지나 판단 상태와 이유를 숨겼습니다.'
        : '검토 전 판단 상태와 이유는 공개하지 않습니다.',
      executionBoundary,
      interactive: false,
    };
  }

  return {
    state: 'visible',
    eyebrow: packet.entityName,
    title: packet.action ? actionLabels[packet.action] : '판단 보류',
    description: packet.actionReason ?? packet.abstentionReason ?? '설명 없음',
    executionBoundary,
    interactive: false,
  };
}
