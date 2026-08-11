import type { TruthBinding } from './truth-binding-state';
import { TruthChip } from './truth-chip';
import { truthCopyFor } from './truth-class-labels';
import { TruthExplanation } from './truth-explanation';
import { assertRenderableInCommonView } from './truth-render-guard';
import styles from './truth.module.css';

import { cn } from '@/shared/lib/utils';

export type TruthLegendEntry = {
  binding: TruthBinding;
  /** 연구 깊이에서만 펼쳐지는 분류 근거. */
  basis?: string;
  /** 연구 깊이에서만 펼쳐지는 항목 수. */
  itemCount?: number;
};

export type TruthLegendProps = {
  entries: readonly TruthLegendEntry[];
  className?: string;
  /** 범례 제목. 사람이 읽는 한국어. */
  title?: string;
};

/**
 * 감쌀 블록이 없는 화면(캔버스·차트)의 범례.
 *
 * 관계 지도가 이 경우다. `buildRelationGraph()` 가 검증되지 않은 간선에서
 * 던지므로 그려지는 간선은 **전부 RELATION 하나**이고, 간선마다 스타일을
 * 나누는 것은 존재하지 않는 구분을 그리는 일이다. 한 종류면 범례도 한 줄이다.
 */
export function TruthLegend({ className, entries, title = '표시의 뜻' }: TruthLegendProps) {
  if (entries.length === 0) return null;

  return (
    <div className={cn(styles.legend, className)} data-slot="truth-legend">
      <p className={styles.legendTitle}>{title}</p>
      <ul className={styles.legendList}>
        {entries.map((entry) => (
          <li
            key={entry.binding.state === 'bound' ? entry.binding.truthClass : entry.binding.state}
            className={styles.legendItem}
          >
            <TruthChip binding={entry.binding} />
            <TruthExplanation
              basis={entry.basis}
              binding={entry.binding}
              itemCount={entry.itemCount}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 범례 항목의 접근성 문구가 필요한 호출자를 위한 편의 함수.
 *
 * 렌더러와 **같은 문지기**를 통과한다. 화면에 나가는 한국어를 돌려주는 함수는
 * 컴포넌트가 아니라도 `REQ-REC-001` 의 대상이다 — aria 라벨로 새는 개인 범위
 * 문구는 화면에 그린 것과 같다.
 */
export function truthLegendLabel(binding: TruthBinding): string {
  if (binding.state === 'bound') assertRenderableInCommonView(binding.truthClass);
  return truthCopyFor(binding).label;
}
