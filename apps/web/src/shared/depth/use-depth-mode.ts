'use client';

import { use } from 'react';

import { DepthModeContext, type DepthModeContextValue } from './depth-context';

/**
 * 깊이 모드를 읽는 **유일한** 훅.
 *
 * 소비자는 두 곳뿐이다 — `depth-gate.tsx`(무엇을 펼칠지 결정)와
 * `depth-mode-toggle.tsx`(현재 선택 표시). 뷰 컴포넌트가 이 훅을 부르면
 * `test/depth-mode-contract.test.ts` 의 "분기 금지" 단언이 깨진다.
 */
export function useDepthMode(): DepthModeContextValue {
  const context = use(DepthModeContext);
  if (!context) {
    throw new Error('useDepthMode must be used within DepthModeProvider');
  }
  return context;
}
