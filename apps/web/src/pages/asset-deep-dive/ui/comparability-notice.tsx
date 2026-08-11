import styles from './asset-deep-dive.module.css';

import type {
  MetricComparability,
  PeerComparisonView,
} from '@/pages/asset-deep-dive/model/asset-packet';
import { MetricStrip, PropertyList, StructuredList } from '@/shared/ui/workspace';

/**
 * `REQ-PROD-020` · `REQ-PROD-021` 렌더러. **`BlockStateNotice` 와 별개 컴포넌트다.**
 *
 * 마이그레이션 099 헤더가 두 어휘를 섞지 말라고 세 문단에 걸쳐 적었다.
 * 여기 스위치에는 `not_produced` 나 `no_eligible_source` 가 없고, 저기 스위치에는
 * `NOT_COMPARABLE` 이 없다. 두 파일, 두 어휘, 공유 스위치 없음.
 *
 * ## 갭 1 — 항목 4(peer-relative position) 를 빈칸으로 두지 않는 방법
 *
 * 블록 3 payload 는 `comparability` · `peerCount` · `minimumPeersForRank` 를
 * 싣지만 **peer 집합도, 차원별 rank 도, 지표의 사람 이름도 싣지 않는다.**
 * `PEER_OF` 는 정책행도 생산자도 없고, `PRODUCT_SIMILARITY` 는 통계 추정이라
 * `REQ-PROD-030` 이 "관련 기업" 으로 쓰는 것을 금지한다.
 *
 * 그래서 이 컴포넌트가 그리는 것은 순위가 아니라 **순위를 매길 수 있는지에
 * 대한 판정**이다: 차원별 `NOT_COMPARABLE` / `INSUFFICIENT_COVERAGE` 개수,
 * 기준(최소 몇 개의 동종이 필요한지), 그리고 확인된 동종 수. 이것이 빈칸이
 * 아니라 `REQ-PROD-021` 충족이다 — 정본은 비교 불가능한 KPI 를 **표시하라**고
 * 했지 감추라고 하지 않았다.
 *
 * 지표 이름은 `dart:AcquisitionOfTreasuryShares` 형태의 원시 XBRL 개념이고
 * 사람 이름표의 원천인 `governance.entity_playbook_current_v1.key_indicators`
 * 는 `stock_insight_app_reader` 에 GRANT 가 없다. 이름을 지어내는 대신 개수로
 * 말하고 그 사실을 갭으로 적는다.
 */

const comparabilityCopy: Record<
  MetricComparability,
  { label: string; description: string; tone: 'ok' | 'blocked' | 'thin' }
> = {
  COMPARABLE: {
    label: '비교 가능',
    description: '같은 정의·같은 기간으로 묶인 동종이 기준 수 이상 확인된 지표입니다.',
    tone: 'ok',
  },
  INSUFFICIENT_COVERAGE: {
    label: '동종 수 부족',
    description: '비교 묶음은 있으나 동종 수가 기준에 미치지 못해 순위를 말할 수 없습니다.',
    tone: 'thin',
  },
  NOT_COMPARABLE: {
    label: '비교 불가',
    description: '정의·기간이 맞는 비교 묶음 자체가 없어 애초에 나란히 놓을 수 없습니다.',
    tone: 'blocked',
  },
  unknown: {
    label: '판정 미상',
    description: '이 지표의 비교 가능 여부를 아직 판정하지 못했습니다.',
    tone: 'blocked',
  },
};

/** 표시 순서. 좋은 쪽에서 나쁜 쪽으로 읽는다. */
const comparabilityOrder: readonly MetricComparability[] = [
  'COMPARABLE',
  'INSUFFICIENT_COVERAGE',
  'NOT_COMPARABLE',
  'unknown',
];

export function ComparabilityNotice({ view }: { view: PeerComparisonView }) {
  const present = comparabilityOrder.filter((verdict) => view.counts[verdict] > 0);
  // 판정한 지표가 하나도 없으면 **판정 요약을 그리지 않는다.**
  //
  // 라이브 25종목의 블록3 payload 는 `{}` 다. 그 위에서 이 스트립은 패킷이
  // 말한 적 없는 두 문장을 만들어 냈다: `minimumPeersForRank` 의 기본값 3이
  // "순위 기준 · 동종 3개 이상" 이라는 규칙으로 단언됐고, `0 > 0` 이 거짓이라
  // "관측된 지표 전부를 판정했습니다" 라는 완결성 주장이 붙었다. 둘 다 바로
  // 위의 "만들어진 결과가 없습니다" 아래에 놓였다.
  //
  // 갭 목록은 남긴다. 갭은 payload 가 없어도 참인 사실이고, 그것을 지우면
  // 부재가 이름을 잃는다.
  const judged = view.keptMetricCount > 0;
  return (
    <div className={styles.comparability} data-slot="comparability-notice">
      {judged ? (
        <MetricStrip
          label="동종 비교 판정"
          items={[
            {
              label: '순위 기준',
              value: `동종 ${view.minimumPeersForRank}개 이상`,
              detail: '이 수를 넘겨야 차원별 순위를 말할 수 있습니다.',
            },
            {
              label: '확인된 동종',
              value:
                view.peerCountRange === null
                  ? '기준을 넘긴 지표 없음'
                  : view.peerCountRange.min === view.peerCountRange.max
                    ? `${view.peerCountRange.max}개`
                    : `${view.peerCountRange.min}~${view.peerCountRange.max}개`,
              detail: `최소 ${view.minimumPeersForRank}개 필요`,
            },
            {
              label: '판정한 지표',
              value: `${view.keptMetricCount}개`,
              detail:
                view.totalMetricCount > view.keptMetricCount
                  ? `관측된 ${view.totalMetricCount}개 중 상위 ${view.keptMetricCount}개만 실렸습니다`
                  : '관측된 지표 전부를 판정했습니다',
            },
          ]}
        />
      ) : null}

      {present.length > 0 ? (
        <StructuredList className={styles.comparabilityList}>
          {present.map((verdict) => {
            const copy = comparabilityCopy[verdict];
            return (
              <li key={verdict} data-comparability={verdict} data-tone={copy.tone}>
                <strong>
                  {copy.label} · {view.counts[verdict]}개
                </strong>
                <span>{copy.description}</span>
              </li>
            );
          })}
        </StructuredList>
      ) : null}

      {/*
        갭을 지우지 않고 이름 붙여 그린다. 화면이 꽉 차 보이게 하려고 이 문단을
        빼면 "순위가 없다" 가 "순위가 낮다" 로 읽힌다.
      */}
      <PropertyList
        className={styles.gapList}
        items={[
          {
            label: '차원별 순위',
            value:
              '아직 계산되지 않습니다. 비교 가능 여부까지만 판정되어 있고 순위 값은 이 화면에 도달하지 않습니다.',
          },
          {
            label: '지표 이름',
            value:
              '지표 정의를 한국어로 옮길 표가 아직 연결되지 않아 개수로만 표시합니다. 이름 없는 지표를 원문 그대로 적지 않습니다.',
          },
          {
            // 낱말을 바꾼 이유. 여기에는 "확인된 동종 관계가 아직 없어" 라고
            // 적혀 있었고, 바로 위 스트립은 같은 화면에서 "확인된 동종 8~108개"
            // 를 그렸다. 둘은 서로 다른 것을 재고 있다 — 스트립은 지표 하나가
            // 같은 정의·같은 기간으로 묶인 **비교 묶음의 크기**를 세고, 이 줄은
            // 이름을 지목할 수 있는 **기업 간 관계 기록**이 없다는 사실이다.
            // 그러나 사용자가 읽는 낱말은 "동종" 하나였고, 그래서 한 화면이
            // 자기를 반증했다(라이브 272/297 종목).
            //
            // 그래서 이 줄에서 "동종" 을 걷어내고 질문을 존재 여부가 아니라
            // **이름**으로 되돌린다. 갭 자체는 지우지 않는다 — payload 가
            // 없어도 참인 사실이고, 지우면 부재가 이름을 잃는다.
            label: '비교한 기업 이름',
            value:
              '어떤 기업과 나란히 놓았는지 그 이름은 이 화면에 실리지 않습니다. 이름을 지목할 수 있는 기업 간 관계가 아직 기록되지 않았고, 문서 유사도로 대신 채우지 않았습니다.',
          },
        ]}
      />
    </div>
  );
}
