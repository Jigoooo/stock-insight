import styles from './asset-deep-dive.module.css';

import { MetricStrip } from '@/shared/ui/workspace';
import type {
  CommonAssetViewCoverageState,
  CommonAssetViewPacket,
} from '@stock-insight/contracts/common-asset-view';

/**
 * 정본 01 §3 항목 10 — coverage / freshness / uncertainty.
 *
 * `coverageState` 는 **정본 00 §7 이 금지한 종합 신뢰도 숫자가 아니다.** 다섯
 * 단어는 "어느 블록이 서 있는가" 라는 게이트 통과 여부이지 근거신뢰도·경제크기·
 * 반영도·모델불확실성을 곱해 만든 점수가 아니다. 그래서 여기서 이 값을 숫자로
 * 바꾸거나 다른 지표와 합치지 않는다 — 라벨과 그 라벨이 뜻하는 게이트만 적는다.
 */
const coverageStateCopy: Record<
  CommonAssetViewCoverageState,
  { label: string; description: string }
> = {
  RESEARCH_CANDIDATE: {
    label: '근거가 두루 모임',
    description:
      '정체성·재무·시장 반응·최근 사건·촉매까지 여섯 게이트가 모두 섰습니다. 각 항목의 상태는 아래에서 따로 확인해 주세요.',
  },
  WATCH: {
    label: '핵심 근거까지 모임',
    description: '정체성·재무·시장 반응은 섰지만 최근 사건이나 촉매 쪽이 아직 비어 있습니다.',
  },
  PARTIAL_COVERAGE: {
    label: '일부 근거만 모임',
    description: '재무와 시장 반응 중 한쪽만 확인됐습니다. 비교나 반응 해석의 범위가 좁습니다.',
  },
  INFORMATION_ONLY: {
    label: '설명용 정보만 있음',
    description:
      '정체성은 확인됐지만 그 위에 등급을 매길 관측이 없습니다. 무엇을 하는 회사인지까지만 읽어 주세요.',
  },
  INSUFFICIENT_DATA: {
    label: '근거가 부족함',
    description: '정체성이 확인되지 않아 나머지 항목이 누구에 대한 사실인지 말할 수 없습니다.',
  },
};

function formatAsOfDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${year}년 ${Number(month)}월 ${Number(day)}일` : value;
}

export function AssetCoverageSummary({ packet }: { packet: CommonAssetViewPacket }) {
  const copy = coverageStateCopy[packet.coverageState];
  const availableCount = packet.blocks.filter((block) => block.blockState === 'available').length;

  return (
    <div className={styles.sectionBody} data-coverage-state={packet.coverageState}>
      <MetricStrip
        label="자료 범위와 기준"
        items={[
          { label: '자료 범위', value: copy.label, detail: copy.description },
          {
            label: '채워진 항목',
            value: `12개 중 ${availableCount}개`,
            detail: '나머지는 감춘 것이 아니라 아래에 이유와 함께 표시했습니다.',
          },
          {
            label: '관측 기준일',
            value: formatAsOfDate(packet.asOfDate),
            detail: '이 날짜에 관측된 자료로 만들어졌습니다.',
          },
        ]}
      />
    </div>
  );
}
