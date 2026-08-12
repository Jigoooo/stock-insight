import { INDICATOR_KIND_LABELS, INDICATOR_LABELS } from './indicator-labels';

/**
 * 산업 입문 — "이 산업을 처음 본다면".
 *
 * ## 발명이 아니라 배선이다. 다만 배선이 아직 닿지 않았다
 *
 * `governance.entity_playbook_current_v1` 이 이미 산업별 판단표를 들고 있다
 * (2026-08-11 실측: 7개 플레이북, 각각 `key_indicators` 5~6개 · `peer_dimensions`
 * 5개 · `valuation_methods` 3개, 지표마다 `why`, 방법마다 `note`. 예: 반도체의
 * `ev_sales_cycle_adjusted` note — "cycle position must be stated; a trough
 * multiple on trough sales is not a valuation"). 이것은
 * `reference/master-design-monolith.md` 계열의 **설계 의도**이고 canonical 이
 * 아니다 — 정본이 비워 둔 자리를 채우는 자료로만 쓴다.
 *
 * 그런데 이 뷰는 `stock_insight_app_reader` 에 SELECT GRANT 가 없다(실측:
 * `has_table_privilege(...) = f`). 그리고 CAV 블록 2 payload 에 실린 것은
 * `{ playbookKey, assignedAt }` **둘뿐**이다(2673행 전수 확인). 즉 지표·비교축·
 * 밸류에이션 방법은 이 읽기 경로에 도달하지 않는다.
 *
 * GRANT 를 주면 `EXPECTED_CATALOG_DIGESTS` 가 움직여 패킷 재핀이 필요하고,
 * 그것은 **별도 변경**이다. 그래서 이번 범위에서는 마이그레이션을 만들지 않고
 * 부재를 이름 붙여 그린다: 무엇이 담기기로 되어 있고, 왜 지금 없고, 무엇이
 * 있어야 채워지는지.
 *
 * ## 이름 표는 임시 대용이다
 *
 * 뷰에는 `display_name` 열이 있고(`Semiconductor / AI Infrastructure` 등) 그것이
 * 진짜 이름의 출처다. GRANT 전까지는 payload 의 `playbookKey` 하나만 오므로
 * 여기서 한국어 이름을 대신 붙인다. 표에 없는 키는 **이름 없이 존재만** 말한다 —
 * 모르는 내부 키를 영어 그대로 흘리면 UX 헌법 7번에 걸린다.
 */

/**
 * 2026-08-11 라이브 배정에 실제로 나타나는 7개 키 전부.
 * (`crypto` 18 · `life_science` 16 · `semiconductor` 12 · `bank` 11 ·
 * `utility` 6 · `refining` 3 · `resources` 3 — 합계 69개 배정.)
 */
const PLAYBOOK_DISPLAY_NAMES: Record<string, string> = {
  bank: '은행·예금 취급 대출기관',
  crypto: '가상자산 프로토콜·토큰',
  life_science: '생명과학·신약 개발',
  refining: '정유·정제',
  resources: '자원 채굴',
  semiconductor: '반도체·AI 인프라',
  utility: '규제 유틸리티',
};

/** 모르는 키는 `null`. 이름을 지어내지 않는다. */
export function playbookDisplayName(playbookKey: string): string | null {
  return PLAYBOOK_DISPLAY_NAMES[playbookKey.trim()] ?? null;
}

/**
 * 산업 판단표가 담기로 되어 있는 것. 화면은 이 목록을 **부재의 내용**으로
 * 그린다 — "무엇이 없는지" 를 말할 수 있으면 그것도 정보다.
 */
export type PrimerExpectation = {
  title: string;
  description: string;
};

export const PRIMER_EXPECTATIONS: readonly PrimerExpectation[] = [
  {
    title: '핵심 지표와 그 이유',
    description:
      '이 산업에서 무엇을 먼저 보는지, 그리고 왜 그 지표인지를 지표마다 한 줄로 적은 표입니다.',
  },
  {
    title: '동종 비교 축',
    description:
      '어떤 기준으로 나란히 놓아야 비교가 성립하는지를 정한 축입니다. 축 없이 매긴 순위는 순위가 아닙니다.',
  },
  {
    title: '밸류에이션 방법과 주의',
    description:
      '이 산업에 쓰이는 방법과 각각의 함정을 적습니다. 예를 들어 업황 바닥에서 바닥 배수를 곱한 값은 밸류에이션이 아닙니다.',
  },
];

export type PrimerIndicator = { name: string; why: string; kindLabel: string | null };

export type IndustryPrimerState =
  /** 플레이북 자체가 배정되지 않았다. */
  | 'not_assigned'
  /** 배정되어 있으나 이름을 아직 한국어로 옮기지 못했다. */
  | 'unnamed'
  /** 이름까지는 닿았고, 판단표 본문은 아직 이 읽기 경로에 없다. */
  | 'named_absence'
  /** 지표까지 닿았다. */
  | 'available';

export type IndustryPrimer = {
  state: IndustryPrimerState;
  /** 한국어 산업 이름. 모르면 `null`. 내부 키는 절대 여기 담기지 않는다. */
  playbookLabel: string | null;
  /** 분류 라벨(예: `Semiconductors & Related Devices`). 있으면 보조로 쓴다. */
  taxonomyLabels: readonly string[];
  expectations: readonly PrimerExpectation[];
  /** 한국어로 옮긴 핵심 지표. `state === 'available'` 일 때만 채워진다. */
  indicators: readonly PrimerIndicator[];
  /** 이름을 아직 옮기지 못한 지표 수. 원문 키를 흘리는 대신 센다. */
  unnamedIndicatorCount: number;
  /**
   * 판단표 본문이 왜 없는지. 화면에 그대로 나가는 문장이라 내부 어휘를 쓰지
   * 않는다(테이블 이름·권한 이름 금지).
   */
  absenceReason: string;
};

/**
 * 이 문장은 화면에 그대로 나가므로 내부 어휘를 쓰지 않는다. 아래 주석이
 * **무엇이 실제로 남았는지**를 대신 진다.
 *
 * 2026-08-13 실측으로 원장을 열어보고 알게 된 것: 읽기 권한과 재핀만으로는
 * 이 자리가 채워지지 않는다. `governance.entity_playbook_current_v1` 의 내용이
 * 전부 **영문 엔지니어 산문과 내부 키**다. 반도체 행 실물:
 *
 *   key_indicators[0]  { key: 'product_generation_node',
 *                        why: 'canonical/04 §5: product generation/node/interface.
 *                              A part number without its node and interface cannot
 *                              be compared across a transition.' }
 *   peer_dimensions[0] 'node_and_interface_generation'
 *   valuation_methods[0] { key: 'ev_sales_cycle_adjusted',
 *                          note: 'cycle position must be stated; a trough multiple
 *                                 on trough sales is not a valuation' }
 *
 * 권한만 열고 그대로 그리면 `canonical/04 §5:` 라는 내부 문서 참조와 영문 산문이
 * 사용자 화면에 나간다 — UX 헌법 7번으로 릴리스가 막힌다. 그러므로 남은 일은
 * 세 가지이고 **순서가 있다**:
 *
 *   1. 지표 키 → 한국어 이름 표(옮긴 것만 그리고 나머지는 센다).
 *      이 저장소가 `valuationMethodLabels`·`datasetLabels`·`kindLabels` 에서
 *      쓰는 것과 같은 패턴이다.
 *   2. `why`·`note` 는 번역이 아니라 **한국어로 다시 쓰는 일**이다. 정본 06 §9 가
 *      LLM 이 빈 필드를 서술로 보충하는 것을 NO-GO 로 지목하므로, 사람이 쓰거나
 *      쓰기 전까지는 이름만 그린다.
 *   3. 그 다음에 `governance.entity_playbook_current_v1` SELECT GRANT +
 *      digest 재핀. 이 순서를 뒤집으면 권한만 열린 채 화면은 그대로이고,
 *      재핀 사이에 멈추면 브레인이 부팅에 실패한다.
 */
const ABSENCE_REASON =
  '이 산업의 판단표는 준비되어 있지만 아직 이 화면이 읽을 수 있는 말로 옮겨지지 않았습니다. 지표 이름을 한국어로 정리하는 작업이 먼저 필요하며, 그때까지는 배정된 산업 이름까지만 확인됩니다.';

export function buildIndustryPrimer({
  playbookKey,
  taxonomyLabels = [],
  keyIndicators = [],
}: {
  playbookKey: string | null;
  taxonomyLabels?: readonly string[];
  keyIndicators?: readonly { key: string; kind: string | null }[];
}): IndustryPrimer {
  const key = playbookKey?.trim() ?? '';
  if (key.length === 0) {
    return {
      state: 'not_assigned',
      playbookLabel: null,
      taxonomyLabels,
      expectations: PRIMER_EXPECTATIONS,
      indicators: [],
      unnamedIndicatorCount: 0,
      absenceReason:
        '이 종목에는 산업 판단표가 배정되어 있지 않습니다. 아래 분류만으로 산업 위치를 읽어 주세요.',
    };
  }

  const playbookLabel = playbookDisplayName(key);
  // 이름을 옮긴 지표만 그리고 나머지는 센다. 원문 키(`product_generation_node`)를
  // 흘리는 것도, 조용히 빠뜨리는 것도 하지 않는다.
  const indicators: PrimerIndicator[] = [];
  let unnamedIndicatorCount = 0;
  for (const item of keyIndicators) {
    const label = INDICATOR_LABELS[item.key];
    if (!label) {
      unnamedIndicatorCount += 1;
      continue;
    }
    indicators.push({
      name: label.name,
      why: label.why,
      kindLabel: item.kind === null ? null : (INDICATOR_KIND_LABELS[item.kind] ?? null),
    });
  }

  if (playbookLabel !== null && indicators.length > 0) {
    return {
      state: 'available',
      playbookLabel,
      taxonomyLabels,
      expectations: PRIMER_EXPECTATIONS,
      indicators,
      unnamedIndicatorCount,
      absenceReason: '',
    };
  }

  return {
    state: playbookLabel === null ? 'unnamed' : 'named_absence',
    playbookLabel,
    taxonomyLabels,
    expectations: PRIMER_EXPECTATIONS,
    indicators: [],
    unnamedIndicatorCount,
    absenceReason:
      playbookLabel === null
        ? `산업 판단표가 배정되어 있으나 이름을 아직 한국어로 옮기지 못했습니다. ${ABSENCE_REASON}`
        : ABSENCE_REASON,
  };
}
