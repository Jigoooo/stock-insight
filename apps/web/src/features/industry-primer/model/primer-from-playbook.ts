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

export type IndustryPrimerState =
  /** 플레이북 자체가 배정되지 않았다. */
  | 'not_assigned'
  /** 배정되어 있으나 이름을 아직 한국어로 옮기지 못했다. */
  | 'unnamed'
  /** 이름까지는 닿았고, 판단표 본문은 아직 이 읽기 경로에 없다. */
  | 'named_absence';

export type IndustryPrimer = {
  state: IndustryPrimerState;
  /** 한국어 산업 이름. 모르면 `null`. 내부 키는 절대 여기 담기지 않는다. */
  playbookLabel: string | null;
  /** 분류 라벨(예: `Semiconductors & Related Devices`). 있으면 보조로 쓴다. */
  taxonomyLabels: readonly string[];
  expectations: readonly PrimerExpectation[];
  /**
   * 판단표 본문이 왜 없는지. 화면에 그대로 나가는 문장이라 내부 어휘를 쓰지
   * 않는다(테이블 이름·권한 이름 금지).
   */
  absenceReason: string;
};

const ABSENCE_REASON =
  '이 산업의 판단표는 준비되어 있지만 아직 이 화면이 읽을 수 있는 자리에 놓이지 않았습니다. 읽기 권한을 열고 자료 묶음을 다시 고정하는 별도 작업이 필요하며, 그때까지는 배정된 산업 이름까지만 확인됩니다.';

export function buildIndustryPrimer({
  playbookKey,
  taxonomyLabels = [],
}: {
  playbookKey: string | null;
  taxonomyLabels?: readonly string[];
}): IndustryPrimer {
  const key = playbookKey?.trim() ?? '';
  if (key.length === 0) {
    return {
      state: 'not_assigned',
      playbookLabel: null,
      taxonomyLabels,
      expectations: PRIMER_EXPECTATIONS,
      absenceReason:
        '이 종목에는 산업 판단표가 배정되어 있지 않습니다. 아래 분류만으로 산업 위치를 읽어 주세요.',
    };
  }

  const playbookLabel = playbookDisplayName(key);
  return {
    state: playbookLabel === null ? 'unnamed' : 'named_absence',
    playbookLabel,
    taxonomyLabels,
    expectations: PRIMER_EXPECTATIONS,
    absenceReason:
      playbookLabel === null
        ? `산업 판단표가 배정되어 있으나 이름을 아직 한국어로 옮기지 못했습니다. ${ABSENCE_REASON}`
        : ABSENCE_REASON,
  };
}
