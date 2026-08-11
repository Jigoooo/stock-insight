import styles from './asset-deep-dive.module.css';

import { WorkspaceState } from '@/shared/ui/workspace';
import type {
  CommonAssetViewBlock,
  CommonAssetViewBlockState,
} from '@stock-insight/contracts/common-asset-view';

/**
 * `blockState` 5값 렌더러 — **`REQ-PROD-021` 어휘와 별개 컴포넌트다.**
 *
 * 마이그레이션 099 헤더:
 *
 * > REQ-PROD-021 defines NOT_COMPARABLE / INSUFFICIENT_COVERAGE for one narrow
 * > question: whether a KPI can be ranked against peers. A block that has no
 * > producer is a different fact about a different subject.
 *
 * 그래서 이 파일의 스위치에는 `NOT_COMPARABLE` 이 없고, `comparability-notice.tsx`
 * 의 스위치에는 `not_produced` 가 없다. 한 스위치에 합치는 순간 두 어휘가
 * 하나가 되고, 그러면 어느 쪽도 아무것도 뜻하지 않는다.
 *
 * 다섯 상태는 각각 **다른 고칠 거리**를 지목하므로 문구도 다섯 개다. "데이터
 * 없음" 하나로 뭉치면 네 개의 서로 다른 문제가 하나의 문제로 보인다.
 *
 * ## `block.stateReason` 원문은 이 화면에 나가지 않는다
 *
 * 이 자리에는 `StateReason` 이 있었고 `raw={block.stateReason}` 을 넘겼다.
 * 그 배치의 근거는 "원문을 research 깊이로 배정했으니 기본 UI 가 아니다" 였는데,
 * **거짓이다.** `animate-ui/primitives/radix/accordion.tsx` 의 Content 는
 * `asChild forceMount` 이고 닫힘 표현이 `overflow:hidden` + 높이/투명도뿐이라
 * `hidden` 도 `aria-hidden` 도 붙지 않는다. 즉 접혀 있어도 접근성 트리에 남고,
 * **초보 모드 스크린리더 사용자에게 그대로 읽힌다.**
 *
 * 그리고 원문은 내부 테이블·잡·요구사항 ID 를 담고 있다. 라이브 실측:
 * `analytics.surprise_revision has no row for this subject`,
 * `20 of 20 covering datasets are not ok`,
 * `analytics.scenario_set is empty and personalization.thesis_revision is barred
 * by REQ-REC-001`. UX 헌법 7번이 막는 바로 그것이다.
 *
 * `StateReason` 자체는 고치지 않았다 — 그 컴포넌트의 도달성 계약이 `hidden` 을
 * 금지하고, 이 화면이 그 문자열들의 첫 실사용 소비자이므로 책임은 여기에 있다.
 * 여기서는 **넘기지 않는 것**이 고침이다. 쉬운 말은 `WorkspaceState` 가 이미
 * 그리므로 `plain` 만 남기면 같은 문장이 두 번 나온다.
 */

function assertNever(value: never): never {
  throw new Error(`처리하지 않은 블록 상태입니다: ${String(value)}`);
}

type StateCopy = {
  kind: 'empty' | 'partial' | 'unavailable';
  title: string;
  description: string;
};

function copyFor(state: Exclude<CommonAssetViewBlockState, 'available'>): StateCopy {
  switch (state) {
    case 'partial':
      return {
        kind: 'partial',
        title: '일부만 확인됐습니다',
        description:
          '이 항목이 요구하는 자료 범위를 아직 다 채우지 못했습니다. 보이는 범위 안에서만 읽어 주세요.',
      };
    case 'unverified_only':
      return {
        kind: 'partial',
        title: '아직 검증되지 않은 자료뿐입니다',
        description:
          '자료는 모였지만 검증을 통과한 것이 없습니다. 확인된 사실과 같은 자리에 두지 않았습니다.',
      };
    case 'not_produced':
      return {
        kind: 'empty',
        title: '만들어진 결과가 없습니다',
        description:
          '이 항목을 만드는 작업은 있지만 아직 아무 결과도 내놓지 않았습니다. 작업이 결과를 내면 이 자리에 표시됩니다.',
      };
    case 'no_eligible_source':
      return {
        kind: 'unavailable',
        title: '읽을 수 있는 자료가 아직 없습니다',
        description:
          '이 항목이 근거로 삼아도 되는 자료 자체가 없습니다. 같은 작업을 더 돌린다고 채워지지 않습니다.',
      };
    default:
      return assertNever(state);
  }
}

export function BlockStateNotice({ block }: { block: CommonAssetViewBlock }) {
  if (block.blockState === 'available') return null;
  const copy = copyFor(block.blockState);
  return (
    <div className={styles.blockNotice} data-block-state={block.blockState}>
      <WorkspaceState kind={copy.kind} title={copy.title} description={copy.description} />
    </div>
  );
}

/**
 * 상태 배지 — 제목 옆에 붙는 한 낱말.
 *
 * `Record<CommonAssetViewBlockState, string>` 이라 계약이 여섯 번째 상태를
 * 들고 오면 타입체크가 여기서 멈춘다. 내부 enum 은 `data-` 속성에만 남는다.
 */
const blockStateBadgeLabels: Record<CommonAssetViewBlockState, string> = {
  available: '확인됨',
  partial: '일부만',
  unverified_only: '미검증',
  not_produced: '결과 없음',
  no_eligible_source: '자료 없음',
};

export function BlockStateBadge({ state }: { state: CommonAssetViewBlockState }) {
  return (
    <span className={styles.stateBadge} data-block-state={state}>
      {blockStateBadgeLabels[state]}
    </span>
  );
}
