import type { ValuationView } from './asset-packet';

/**
 * 블록 7 밴드의 **단일 문구 원천**. above-the-fold 와 밸류에이션 탭이 같은 블록을
 * 두 자리에서 그리므로, 문구를 각자 쓰면 한쪽만 고쳐지고 두 화면이 같은 숫자에
 * 다른 뜻을 붙인다. `describeEventCoverage()` 가 같은 이유로 model 층에 있다.
 *
 * 첫 항목이 **근거 문장이고 숫자보다 위**다. 생산자가 쓰는 `own_history_*` 는
 * 이 종목 자신의 과거 배수 분포이지 앞으로의 수준에 대한 주장이 아닌데, 숫자가
 * 먼저 오면 그 문장은 읽히지 않는다. 읽는 사람이 두 숫자를 보고 가장 먼저 떠올릴
 * 오해를 그 자리에서 막는 것이 이 항목의 일이다.
 *
 * 부재도 이름을 갖는다: 단위를 모르는 밴드는 숫자 대신 그 사실을 적고, 이름
 * 붙지 않은 산출 방법은 원문 키를 그리는 대신 세기만 한다(UX 헌법 7번).
 */
export function describeValuationBands(
  valuation: ValuationView,
): Array<{ label: string; value: string }> {
  const items = [
    {
      label: '이 구간이 뜻하는 것',
      value:
        '이 종목이 과거에 실제로 거래된 배수의 구간입니다. 앞으로 얼마가 되어야 한다는 뜻이 아니고, 다른 회사와 비교한 값도 아닙니다.',
    },
    ...valuation.bands.map((band) => ({
      label: band.horizonLabel ? `${band.methodLabel} · ${band.horizonLabel}` : band.methodLabel,
      value: band.rangeText ?? '단위를 확인하지 못해 숫자를 싣지 않았습니다.',
    })),
  ];

  if (valuation.unnamedMethodCount > 0) {
    items.push({
      label: '아직 싣지 않은 산출 방법',
      value: `${valuation.unnamedMethodCount}건. 이 화면이 이름을 붙이지 못한 방법이라 숫자를 옮기지 않았습니다.`,
    });
  }

  // 블록이 `available` 인데 이름 붙은 밴드가 하나도 남지 않는 경우다. 근거
  // 문장만 남기면 무엇에 대한 근거인지 없는 문단이 되므로 그 사실을 적는다.
  if (valuation.bands.length === 0) {
    items.push({
      label: '실린 밴드',
      value:
        valuation.unnamedMethodCount > 0
          ? '이름을 붙인 산출 방법이 아직 없어 이 화면에 옮긴 구간이 없습니다.'
          : '기록된 구간이 없습니다.',
    });
  }

  return items;
}
