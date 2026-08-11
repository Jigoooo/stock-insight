'use client';

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';

import { DEPTH_MODE_OPTIONS, isDepthMode } from './depth-mode';
import styles from './depth-mode-toggle.module.css';
import { useDepthMode } from './use-depth-mode';

import { cn } from '@/shared/lib/utils';

export type DepthModeToggleProps = {
  className?: string;
};

/**
 * 설명 깊이 전역 토글(IA §9 결정 2).
 *
 * `role="radiogroup"` + 3옵션. Radix RadioGroup 이 radiogroup/radio 역할과
 * 방향키 이동을 담당한다. 타겟은 44×28 로 UX 헌법 3번(24×24 이상)을 넘긴다.
 * 사용자에게는 한국어 라벨만 보이고 내부 enum 은 `value` 에만 있다(헌법 7번).
 *
 * `useDepthMode` 를 부르는 곳은 여기와 `depth-gate.tsx` 둘뿐이고, 계약 테스트가
 * 그 두 파일만 허용한다.
 */
export function DepthModeToggle({ className }: DepthModeToggleProps) {
  const { mode, setMode } = useDepthMode();
  const labelId = useId();

  return (
    <RadioGroupPrimitive.Root
      aria-labelledby={labelId}
      className={cn(styles.root, className)}
      data-slot="depth-mode-toggle"
      data-testid="depth-mode-toggle"
      orientation="horizontal"
      value={mode}
      onValueChange={(next) => {
        if (isDepthMode(next)) setMode(next);
      }}
    >
      <span className={styles.visuallyHidden} id={labelId}>
        설명 깊이
      </span>
      {DEPTH_MODE_OPTIONS.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          className={styles.item}
          data-slot="depth-mode-option"
          title={option.description}
          value={option.value}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
