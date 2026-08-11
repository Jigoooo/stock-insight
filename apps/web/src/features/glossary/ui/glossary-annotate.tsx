import { Fragment } from 'react';

import { GlossaryTerm } from './glossary-term';

import {
  annotateSection,
  type GlossaryIndex,
  type GlossarySegment,
} from '@/features/glossary/model/glossary-index';

/**
 * 계획된 조각을 그리기만 하는 컴포넌트. 판단은 전부 `glossary-index.ts` 의
 * 순수 함수가 이미 끝냈다.
 */
export function GlossarySegments({ segments }: { segments: readonly GlossarySegment[] }) {
  return (
    <>
      {/* key 는 원문에서의 시작 위치다 — 배열 인덱스와 달리 조각 자신의 사실이다. */}
      {segments.map((segment) =>
        segment.kind === 'term' ? (
          <GlossaryTerm entry={segment.entry} key={segment.start} text={segment.text} />
        ) : (
          <Fragment key={segment.start}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * 본문 하나를 주석해 그린다.
 *
 * **`text` 는 `string` 이다.** `ReactNode` 를 받으면 "링크·헤딩 안에서는 금지"
 * 규칙이 element 타입 검사로 번지고, 트리 모양이 바뀔 때마다 조용히 부서진다.
 * prop 타입이 문자열이라는 사실 자체가 그 규칙을 지키는 방법이다 — 링크나
 * 헤딩 안에서는 **부르지 않는다**.
 *
 * 예산(블록당 5개)은 이 호출 하나에 걸린다. 한 섹션에 본문이 여럿이면
 * `annotateSection()` 으로 한 번에 계획해 `GlossarySegments` 로 그린다.
 */
export function GlossaryAnnotate({
  budget,
  exclude,
  index,
  text,
}: {
  budget?: number;
  exclude?: ReadonlySet<string>;
  index: GlossaryIndex;
  text: string;
}) {
  const [segments = []] = annotateSection(index, [text], {
    ...(budget === undefined ? {} : { budget }),
    ...(exclude === undefined ? {} : { exclude }),
  });
  return <GlossarySegments segments={segments} />;
}
