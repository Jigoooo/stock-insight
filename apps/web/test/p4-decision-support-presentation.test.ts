import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DecisionSupportContent } from '../src/pages/research-workspace/ui/views/decision-support-content.ts';
import { getDecisionSupportPresentation } from '../src/pages/research-workspace/ui/views/decision-support-presentation.ts';

import type {
  DecisionSupportPacket,
  DecisionSupportSummary,
} from '@stock-insight/contracts/research-workspace';

const restrictedPacket: DecisionSupportPacket = {
  decisionPacketId: '50000000-0000-4000-8000-000000000005',
  entityKey: 'KR:005930',
  entityName: '삼성전자',
  action: null,
  actionReason: null,
  abstentionReason: null,
  commonViewAsOf: '2026-07-22T00:00:00.000Z',
  generatedAt: '2026-07-22T00:00:00.000Z',
  expiresAt: '2026-07-23T00:00:00.000Z',
  legalReviewStatus: 'required',
  restrictionReason: 'LEGAL_REVIEW_REQUIRED',
  adviceProhibited: true,
  orderExecutable: false,
};

function summary(latestPacket: DecisionSupportPacket | null): DecisionSupportSummary {
  return {
    availability: latestPacket ? 'available' : 'missing',
    sourceState: 'ready',
    packetCount: latestPacket ? 1 : 0,
    latestPacket,
  };
}

describe('decision-support presentation', () => {
  it('redacts legal-review and expired packets through the executed production branch', () => {
    const legal = getDecisionSupportPresentation(summary(restrictedPacket));
    assert.deepEqual(
      { state: legal.state, title: legal.title, description: legal.description },
      {
        state: 'restricted',
        title: '법률 검토 전',
        description: '검토 전 판단 상태와 이유는 공개하지 않습니다.',
      },
    );

    const expired = getDecisionSupportPresentation(
      summary({ ...restrictedPacket, restrictionReason: 'PACKET_EXPIRED' }),
    );
    assert.equal(expired.state, 'restricted');
    assert.equal(expired.title, '판단 패킷 만료');
    assert.equal(expired.description, '유효 기한이 지나 판단 상태와 이유를 숨겼습니다.');
  });

  it('maps every approved read-only action and never exposes an execution affordance', () => {
    const labels: Record<NonNullable<DecisionSupportPacket['action']>, string> = {
      ADD: '추가 검토',
      HOLD: '현 상태 유지',
      REDUCE: '비중 축소 검토',
      EXIT: '논지 무효화 검토',
      WATCH: '관찰 유지',
      NO_ACTION: '변경 없음',
      INSUFFICIENT_DATA: '판단 보류',
    };
    for (const [action, label] of Object.entries(labels) as [
      NonNullable<DecisionSupportPacket['action']>,
      string,
    ][]) {
      const presentation = getDecisionSupportPresentation(
        summary({
          ...restrictedPacket,
          action,
          actionReason: '검증된 읽기 전용 설명',
          abstentionReason: action === 'INSUFFICIENT_DATA' ? '근거 부족' : null,
          legalReviewStatus: 'approved_read_only',
          restrictionReason: null,
        }),
      );
      assert.equal(presentation.state, 'visible');
      assert.equal(presentation.title, label);
      assert.equal(presentation.executionBoundary, '주문 기능과 연결되지 않습니다.');
      assert.equal(presentation.interactive, false);
    }
  });

  it('renders restricted content without leaking raw action fields or interactive controls', () => {
    for (const restrictionReason of ['LEGAL_REVIEW_REQUIRED', 'PACKET_EXPIRED'] as const) {
      const maliciousInput = summary({
        ...restrictedPacket,
        action: 'EXIT',
        actionReason: 'SENSITIVE_ACTION_REASON',
        restrictionReason,
      } as unknown as DecisionSupportPacket);
      const html = renderToStaticMarkup(
        DecisionSupportContent({ data: maliciousInput, className: 'decision-primary' }),
      );
      assert.doesNotMatch(html, /SENSITIVE_ACTION_REASON|논지 무효화 검토/);
      assert.match(
        html,
        restrictionReason === 'PACKET_EXPIRED' ? /판단 패킷 만료/ : /법률 검토 전/,
      );
      assert.doesNotMatch(html, /<(?:button|a|input|select|textarea|form)\b/i);
    }
  });

  it('distinguishes an empty ledger without inventing a decision', () => {
    const empty = getDecisionSupportPresentation(summary(null));
    assert.equal(empty.state, 'empty');
    assert.equal(empty.title, '생성된 판단 패킷이 없습니다.');
    assert.equal(empty.interactive, false);
  });
});
