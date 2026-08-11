import type { TruthBinding } from './truth-binding-state';
import { truthCopyFor } from './truth-class-labels';
import { truthRuleFor, type TruthRule } from './truth-render-guard';
import styles from './truth.module.css';

import { cn } from '@/shared/lib/utils';

const SWATCH_DASH: Record<Exclude<TruthRule, 'none'>, string | undefined> = {
  solid: undefined,
  dashed: '5 3',
  dotted: '1 3',
};

/**
 * 칩 옆의 선 견본. 좌측 규칙선과 **같은 패턴**이라 "이 칩 = 저 선" 이 눈으로
 * 이어진다. `currentColor` 만 쓴다 — 색을 의미로 쓰지 않으므로 색 리터럴을
 * 둘 이유가 없다.
 */
function RuleSwatch({ rule }: { rule: TruthRule }) {
  if (rule === 'none') return null;
  return (
    <svg className={styles.swatch} width="18" height="6" viewBox="0 0 18 6" aria-hidden="true">
      <line
        x1="0"
        y1="3"
        x2="18"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={SWATCH_DASH[rule]}
      />
    </svg>
  );
}

export type TruthChipProps = {
  binding: TruthBinding;
  className?: string;
};

/**
 * 진술 종류를 알리는 유일한 표시. **한국어 라벨만** 나간다 — 내부 enum 은
 * 어느 깊이에서도 렌더되지 않는다(UX 헌법 7번).
 */
export function TruthChip({ binding, className }: TruthChipProps) {
  const copy = truthCopyFor(binding);
  const rule = truthRuleFor(binding);

  return (
    <span
      className={cn(styles.chip, className)}
      data-slot="truth-chip"
      data-truth-rule={rule}
      data-truth-state={binding.state}
    >
      <RuleSwatch rule={rule} />
      <span>{copy.label}</span>
    </span>
  );
}
