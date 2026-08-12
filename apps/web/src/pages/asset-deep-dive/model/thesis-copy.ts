import type { ThesisView } from './asset-packet';

/**
 * 블록 9 의 **단일 문구 원천**. above-the-fold 와 밸류에이션 탭이 같은 블록을 두
 * 자리에서 그리므로 문구를 각자 쓰면 갈라진다(`describeEventCoverage` 와 같은 이유).
 *
 * 첫 항목이 **무엇을 다투는지**다. 세 갈래는 가격 전망이 아니라 "이 종목의 과거
 * 배수 구간이 아직 이 종목을 설명하는가" 를 두고 갈리는 해석이고, 그 문장이
 * 먼저 오지 않으면 아래 세 줄이 강세/약세 전망으로 읽힌다.
 *
 * 각 갈래는 서술과 **반증 조건**을 함께 낸다. 정본 05 §7 이 "각 가설이 무엇을
 * 설명하고 무엇을 반증할지 함께 저장한다" 고 요구하고, 040 은 반증 조건을 쓴
 * 분기만 봉인되게 한다 — 화면에서 반증 조건을 빼면 그 설계가 사용자에게 도달하지
 * 못한다.
 */
export function describeThesis(thesis: ThesisView): Array<{ label: string; value: string }> {
  const items = [
    {
      label: '무엇이 갈리는가',
      value:
        '이 종목의 과거 배수 구간이 지금도 이 종목을 설명하는지를 두고 해석이 갈립니다. 앞으로의 가격 방향을 말하는 것이 아닙니다.',
    },
    ...thesis.branches.map((branch) => ({
      label: branch.label,
      value: [
        branch.narrative,
        branch.invalidationCondition ? `반증 조건 — ${branch.invalidationCondition}` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' '),
    })),
  ];

  if (thesis.unnamedBranchCount > 0) {
    items.push({
      label: '아직 싣지 않은 해석',
      value: `${thesis.unnamedBranchCount}건. 이 화면이 이름을 붙이지 못한 갈래라 옮기지 않았습니다.`,
    });
  }
  // 040 이 봉인 단계에서 막으므로 0이어야 한다. 0이 아니면 데이터가 아니라 결함이고,
  // 화면이 그것을 감추면 다음 사람이 반쪽짜리 논지를 온전한 것으로 읽는다.
  if (thesis.branchesWithoutInvalidation > 0) {
    items.push({
      label: '반증 조건이 없는 갈래',
      value: `${thesis.branchesWithoutInvalidation}건. 무엇이 이 해석을 뒤집는지 적히지 않아 그대로 읽으면 안 됩니다.`,
    });
  }
  return items;
}
