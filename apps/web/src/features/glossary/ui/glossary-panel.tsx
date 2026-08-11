import styles from './glossary.module.css';

import type { GlossaryIndex } from '@/features/glossary/model/glossary-index';
import { DepthGate } from '@/shared/depth';
import { AvailabilityNotice, WorkspaceState } from '@/shared/ui/workspace';

/**
 * 이 자산에 걸린 용어 전체 목록.
 *
 * ## 세 상태를 구분한다
 *
 * `unsupported`(필드 없음) 와 `empty`(빈 배열) 는 다른 사실이다. 읽기 모델의
 * `sanitizeStockDetail` 이 `undefined` 는 지우고 `[]` 는 남기므로, 빈 배열은
 * "정리된 용어가 있었는데 표시할 수 있는 것이 남지 않았다" 를 뜻한다. 둘을 같은
 * 문구로 뭉개면 UX 헌법 6번이 막는 상태 위장이 된다.
 *
 * ## 깊이 배정
 *
 * `DepthGate at="standard"` — 초보에서는 접히고 표준·연구에서는 펼쳐진다.
 * 과제가 적은 "초보는 자동 주석, 표준·연구는 hover/click" 은 **깊이가 깊어질수록
 * 덜 보이는** 배치라 `DepthGate` 로 표현할 수 없다(`depth-mode.ts` 의 단조성:
 * essential ⊆ standard ⊆ research, 그리고 그 단조성은 계약 테스트가 강제한다).
 * 인라인 주석은 그래서 **모든 모드에서 똑같이** 켜 두고, 게이트는 "전체 목록을
 * 펼친 채 둘 것인가" 라는 진짜 깊이 질문에만 쓴다. 초보에게서 주석을 뺏지 않고
 * 모드 분기도 만들지 않는 유일한 배치다.
 */
export function GlossaryPanel({ index }: { index: GlossaryIndex }) {
  if (index.state === 'unsupported') {
    return (
      <div data-slot="glossary-panel" data-glossary-state="unsupported">
        <AvailabilityNotice availability="missing" />
      </div>
    );
  }

  if (index.state === 'empty') {
    return (
      <div data-slot="glossary-panel" data-glossary-state="empty">
        {/*
          공용 `AvailabilityNotice` 의 `empty` 문구("아직 보여드릴 데이터가
          없습니다 / 수집 범위가 준비되면")는 여기서 **틀린 말**이다. 빈 배열은
          아직 안 모았다는 뜻이 아니라 모았는데 표시할 수 있는 것이 남지 않았다는
          뜻이라(읽기 모델이 `undefined` 는 지우고 `[]` 는 남긴다), 그 문구를 쓰면
          구분을 보존해 놓고 화면에서 다시 뭉개게 된다. 그래서 골격만 같은
          `WorkspaceState` 에 이 자리의 사실을 적는다.
        */}
        <WorkspaceState
          kind="empty"
          title="표시할 수 있는 용어가 없습니다"
          description="정리된 용어가 있었지만 이 화면에 실을 수 있는 것이 남지 않았습니다. 아직 수집되지 않은 것과는 다른 상태입니다."
        />
      </div>
    );
  }

  return (
    <div className={styles.panel} data-slot="glossary-panel" data-glossary-state="ready">
      <DepthGate at="standard" label={`이 종목의 용어 ${index.entries.length}개`}>
        <div className={styles.panel}>
          {/*
            "본문에 점선으로 표시된 낱말" 이라고 단언하지 않는다. 라이브에서 용어
            이름은 대개 본문에 글자 그대로 나타나지 않아(297종목 중 295종목은
            용어 자체가 없고, 있는 두 종목도 겹치지 않는다) 주석이 한 번도 안 붙는
            화면이 정상이다. 없는 것을 있다고 말하면 사용자가 없는 밑줄을 찾는다.
          */}
          <p className={styles.panelIntro}>
            이 종목에 걸린 용어 설명입니다. 본문에 같은 낱말이 나오면 점선 밑줄로 표시됩니다. 정리된
            설명이며, 출처가 연결되지 않은 항목은 그렇게 적었습니다.
          </p>
          <dl className={styles.panelList} data-testid="glossary-terms">
            {index.entries.map((entry) => (
              <div key={entry.normalized} data-availability={entry.availability}>
                <dt>{entry.term}</dt>
                <dd>{entry.definition}</dd>
                <dd className={styles.panelSource}>
                  {entry.sourceNames.length > 0
                    ? `출처 ${entry.sourceNames.join(' · ')}`
                    : '출처가 연결되지 않았습니다.'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </DepthGate>
    </div>
  );
}
