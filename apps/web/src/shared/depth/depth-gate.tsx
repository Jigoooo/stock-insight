'use client';

import type { ReactNode } from 'react';

import { isExpandedAt, type DepthLevel } from './depth-mode';
import { useDepthMode } from './use-depth-mode';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/ui/accordion';

export type DepthGateProps = {
  /** 이 콘텐츠에 배정된 깊이. `depth-assignment.ts` 의 표에서 온다. */
  at: DepthLevel;
  children: ReactNode;
  className?: string;
  /**
   * 접혔을 때 보이는 트리거 문구. UX 헌법 7번 — 내부 enum·source key 가 아니라
   * 사람이 읽는 한국어여야 한다.
   */
  label: string;
};

/**
 * 깊이 모드를 읽는 **유일한 뷰 컴포넌트**.
 *
 * 현재 모드가 이 깊이를 펼치면 그대로 렌더하고, 아니면 **접힌 accordion** 안에
 * 넣는다. 절대 `null` 을 돌려주지 않고 `display: none` 도 쓰지 않는다 —
 * IA 36줄: "research 는 숨김이 아니라 배치다. 도달 경로가 없으면 그건 삭제이고
 * 정본 위반이다."
 *
 * `keepRendered` 로 콘텐츠를 항상 DOM 에 둔다. 접힘은 `height: 0 / overflow:
 * hidden` 이라 트리거 하나로 도달 가능하고, 검색·인쇄·보조기술이 닿는 자리가
 * 사라지지 않는다.
 */
export function DepthGate({ at, children, className, label }: DepthGateProps) {
  const { mode } = useDepthMode();
  const expanded = isExpandedAt(mode, at);

  if (expanded) {
    return (
      <div className={className} data-depth-gate="expanded" data-depth-level={at}>
        {children}
      </div>
    );
  }

  return (
    <Accordion
      className={className}
      type="single"
      collapsible
      variant="ledger"
      data-depth-gate="collapsed"
      data-depth-level={at}
    >
      <AccordionItem value={`depth-${at}`}>
        <AccordionTrigger>{label}</AccordionTrigger>
        <AccordionContent keepRendered>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
