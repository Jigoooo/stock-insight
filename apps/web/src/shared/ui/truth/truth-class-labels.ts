import type { TruthBinding } from './truth-binding-state';

import type { TruthClass } from '@stock-insight/contracts/truth-visual-language';

/**
 * 진술 종류를 **사람 말로** 옮기는 표 — UX 헌법 7번.
 *
 * `STATISTICAL_ESTIMATE` 를 그대로 그리면 내부 enum 노출이라 릴리스가 막힌다.
 * 그래서 이 파일이 존재하고, 화면에는 여기 `label` 만 나간다. 클래스 이름
 * 자체는 어느 깊이에서도 렌더되지 않는다 — 연구 모드가 더 깊은 것은 원문
 * 식별자가 아니라 **분류 근거**다.
 *
 * `description` 은 한 줄이어야 한다. 표준 깊이에서 칩 바로 아래 붙는 문장이고,
 * 두 줄이 되면 목록이 해설서로 바뀐다.
 *
 * 제품 경계(CLAUDE.md): 이 표의 어떤 문장도 매수/매도·목표가·"오를 것"을
 * 말하지 않는다. RECOMMENDATION 조차 "외부가 낸 권고를 기록한 것" 이지
 * 우리가 내는 권고가 아니다.
 */

export type TruthCopy = {
  /** 화면에 나가는 유일한 이름. */
  readonly label: string;
  /** 표준 깊이에서 펼쳐지는 한 줄 설명. */
  readonly description: string;
};

const TRUTH_CLASS_COPY: Record<TruthClass, TruthCopy> = {
  SOURCE: {
    label: '원문 출처',
    description: '보관된 원문 자료 그 자체입니다.',
  },
  ASSERTION: {
    label: '주장',
    description: '누군가 그렇게 말했다는 기록이며, 사실로 확인된 것은 아닙니다.',
  },
  FACT: {
    label: '확인된 사실',
    description: '출처로 확인된 사실입니다.',
  },
  EVENT: {
    label: '사건',
    description: '언제 일어났는지가 특정된 사건입니다.',
  },
  RELATION: {
    label: '확인된 관계',
    description: '두 대상이 연결되어 있다는 기록이며, 연결의 크기는 말하지 않습니다.',
  },
  EXPOSURE: {
    label: '노출 크기',
    description: '연결의 방향과 크기까지 측정된 값입니다.',
  },
  STATISTICAL_ESTIMATE: {
    label: '통계 추정',
    description: '관측 데이터로 계산한 추정값이며 원인을 말하지는 않습니다.',
  },
  CAUSAL_ESTIMATE: {
    label: '인과 추정',
    description: '무엇이 원인인지를 명시적으로 주장하는 추정값입니다.',
  },
  FORECAST: {
    label: '전망 범위',
    description: '앞으로의 범위를 나타내며 하나의 값이 아닙니다.',
  },
  HYPOTHESIS: {
    label: '가설 경로',
    description: '규칙으로 이어 붙인 연결이며, 방향과 크기는 아직 확인되지 않았습니다.',
  },
  NARRATIVE: {
    label: '시장 이야기',
    description: '많이 회자되는 이야기이며 확인된 사실과는 다릅니다.',
  },
  RECOMMENDATION: {
    label: '외부 권고 기록',
    description: '외부에서 나온 권고를 그대로 기록한 것입니다.',
  },
  PERSONAL_DECISION: {
    label: '내 판단 기록',
    description: '본인에게만 보이는 개인 기록입니다.',
  },
  OUTCOME: {
    label: '확인된 결과',
    description: '이후 실제로 어떻게 되었는지 확인된 결과입니다.',
  },
};

/**
 * 두 비상태는 **합치지 않는다**. 085 가 문단을 따로 들여 구분한 구분이고,
 * "분류가 없다" 와 "분류할 대상이 아니다" 는 독자에게 다른 말이다.
 */
const TRUTH_NON_STATE_COPY: Record<'not_a_truth_object' | 'undecided', TruthCopy> = {
  not_a_truth_object: {
    label: '주장 아님',
    description: '모델 설정이나 식별자 연결처럼, 세상에 대한 주장이 아닌 기록입니다.',
  },
  undecided: {
    label: '분류 전',
    description: '어떤 종류의 진술인지 아직 분류되지 않았습니다.',
  },
};

for (const copy of Object.values(TRUTH_CLASS_COPY)) Object.freeze(copy);
for (const copy of Object.values(TRUTH_NON_STATE_COPY)) Object.freeze(copy);
Object.freeze(TRUTH_CLASS_COPY);
Object.freeze(TRUTH_NON_STATE_COPY);

export { TRUTH_CLASS_COPY, TRUTH_NON_STATE_COPY };

export function truthClassCopy(truthClass: TruthClass): TruthCopy {
  const copy = TRUTH_CLASS_COPY[truthClass];
  // fail-closed: 클래스가 늘었는데 표가 안 늘면 빈 칩을 그리는 대신 던진다.
  if (!copy) throw new Error(`한국어 라벨이 없는 진술 종류: ${truthClass}`);
  return copy;
}

export function truthCopyFor(binding: TruthBinding): TruthCopy {
  return binding.state === 'bound'
    ? truthClassCopy(binding.truthClass)
    : TRUTH_NON_STATE_COPY[binding.state];
}
