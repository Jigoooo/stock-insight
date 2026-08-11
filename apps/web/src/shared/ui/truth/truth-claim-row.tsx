import type { ReactNode } from 'react';

import type { TruthBinding } from './truth-binding-state';
import { TruthChip } from './truth-chip';
import { TruthExplanation } from './truth-explanation';
import { truthRuleFor } from './truth-render-guard';
import styles from './truth.module.css';

import { cn } from '@/shared/lib/utils';

export type TruthClaimRowProps = {
  binding: TruthBinding;
  children: ReactNode;
  className?: string;
  /** 연구 깊이에서만 펼쳐지는 분류 근거. */
  basis?: string;
  /** 연구 깊이에서만 펼쳐지는 항목 수. */
  itemCount?: number;
};

/**
 * 진술 종류를 붙인 블록. 좌측 규칙선(dash 패턴) + 칩 + 내용이다.
 *
 * 한 항목이 아니라 **블록**을 감싼다. 지금 적용한 화면들은 한 섹션의 모든 행이
 * 같은 종류라서, 행마다 칩을 달면 같은 라벨이 12번 반복되는 소음이 된다.
 * 실제로 구분되어야 하는 것은 섹션과 섹션 사이 — 가설 경로 옆의 파선과 원문
 * 출처 옆의 실선이고, 그 대비가 시각 언어의 전부다.
 */
export function TruthClaimRow({
  basis,
  binding,
  children,
  className,
  itemCount,
}: TruthClaimRowProps) {
  return (
    <div
      className={cn(styles.row, className)}
      data-slot="truth-claim-row"
      data-truth-rule={truthRuleFor(binding)}
      data-truth-state={binding.state}
    >
      <div className={styles.mark}>
        <TruthChip binding={binding} />
      </div>
      <TruthExplanation basis={basis} binding={binding} itemCount={itemCount} />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
