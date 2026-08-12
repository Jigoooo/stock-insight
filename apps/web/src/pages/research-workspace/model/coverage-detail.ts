import { datasetLabels } from './reliability-briefing';

import type { SystemStatus } from '@stock-insight/contracts/research-workspace';

/**
 * IA §4 행 11 이 배정한 **두 번째 화면**의 내용 — `status(전체)` / `research`(상세).
 *
 * 종목 상세는 이 블록을 배지로만 진다(`essential`). 전체는 여기다. IA §5 가
 * 되살리라고 지목한 것이 정확히 이 자리다: "`484661e`(keep coverage details
 * internal)가 `status-view` 에서 196줄을 지웠지만 … 삭제된 196줄에 해당하는
 * 상세는 `research` 깊이로 되살린다."
 *
 * 요약 카드는 `values.slice(0, 3)` 으로 자르면서 잘랐다는 말을 하지 않는다.
 * 그래서 이 모듈이 나르는 것은 새로 만든 정보가 아니라 **카드가 버린 정보**다.
 *
 * 원문 노출 금지(UX 헌법 7번)가 여기서 특히 빡빡하다. `predicate_or_fact_family`
 * 는 `market.financial_fact` 같은 스키마 한정 내부 이름이고 `gap_reason` 은
 * 파이프라인이 운영자에게 쓴 영어 문장이다. 둘 다 그대로 그리면 릴리스가 막힌다.
 * 그래서 아래 두 표만 화면에 올리고, 표에 없는 값은 **세기만 한다** — 블록 7
 * 밴드에서 이름 없는 산출 방법을 다루는 방식과 같다.
 */

/** 라이브 실측(2026-08-12): `governance.coverage_ledger` 의 계열은 이 하나뿐이다. */
const FACT_FAMILY_LABELS: Record<string, string> = {
  'market.financial_fact': '기업 재무 사실',
};

/**
 * 라이브 실측(2026-08-12) 전수 3종. 파이프라인이 문장을 고치면 매칭이 끊기는데,
 * 그때 값은 사라지지 않고 "아직 옮기지 못한 사유" 로 세어져 화면에 남는다.
 * 조용히 없어지는 것보다 세어지는 편이 다음 사람을 부른다.
 */
const GAP_REASON_LABELS: Record<string, string> = {
  'The collector cursor has not reached this issuer yet.':
    '수집기가 아직 이 발행사까지 오지 않았습니다.',
  'OpenDART returned status 013 (no filing) for this issuer-period. Whether the issuer is exempt from this report or the filing is absent cannot be distinguished from the response.':
    '공시 시스템이 "해당 보고서 없음" 으로 답했습니다. 제출 의무가 없는 것인지 제출되지 않은 것인지는 그 응답만으로 구별할 수 없습니다.',
  'Issuer has been fetched, but this cell has no retained observation: empty responses were discarded before 2026-08-03. Self-heals on the next visit.':
    '발행사는 조회했지만 이 칸에 남겨둔 관측이 없습니다. 다음 수집 때 스스로 채워집니다.',
};

const COVERAGE_STATE_LABELS: Record<SystemStatus['coverage'][number]['state'], string> = {
  complete: '모두 확인됨',
  partial: '일부만 확인됨',
  // REQ-SRC-001 — "없다" 와 "묻지 않았다" 는 다른 말이고, 화면에서도 달라야 한다.
  not_collected: '아직 수집하지 않음',
  source_unavailable: '출처를 가져올 수 없음',
  not_applicable: '해당하지 않음',
};

export type CoverageDetailRow = { label: string; value: string };

export type CoverageDetailView = {
  gapRows: CoverageDetailRow[];
  /** 한국어로 옮기지 못한 사유의 칸 수. 0이면 화면에 나오지 않는다. */
  unlabelledGapCells: number;
  stateRows: CoverageDetailRow[];
  datasetRows: CoverageDetailRow[];
  /** 이름을 한국어로 옮기지 못해 목록에 올리지 않은 데이터셋 수. */
  unlabelledDatasetCount: number;
  staleDatasetCount: number;
};

function familyLabel(family: string): string | null {
  return FACT_FAMILY_LABELS[family] ?? null;
}

export function describeCoverageDetail(data: SystemStatus): CoverageDetailView {
  const gapRows: CoverageDetailRow[] = [];
  let unlabelledGapCells = 0;

  for (const gap of data.coverageGaps) {
    const family = familyLabel(gap.factFamily);
    const reason = GAP_REASON_LABELS[gap.reason];
    if (family === null || reason === undefined) {
      unlabelledGapCells += gap.cells;
      continue;
    }
    gapRows.push({ label: `${family} · ${gap.cells.toLocaleString('ko-KR')}칸`, value: reason });
  }

  const stateRows = data.coverage.flatMap((state) => {
    const family = familyLabel(state.factFamily);
    if (family === null) return [];
    return [
      {
        label: `${family} · ${COVERAGE_STATE_LABELS[state.state]}`,
        value: `${state.cells.toLocaleString('ko-KR')}칸`,
      },
    ];
  });

  // 데이터셋 원문 이름은 테이블 이름이라 그대로 그리면 UX 헌법 7번 위반이다.
  // `?? '확인된 데이터'` 로 떨어뜨리지 않는 이유는 이 자리가 **목록**이기 때문이다 —
  // 폴백을 쓰면 서로 다른 데이터셋 여러 줄이 전부 같은 이름으로 나란히 서서,
  // 사람이 읽을 수 없으면서 읽을 수 있는 척한다. 옮기지 못한 것은 센다.
  const datasetRows: CoverageDetailRow[] = [];
  let unlabelledDatasetCount = 0;

  for (const dataset of data.datasets) {
    const label = datasetLabels[dataset.datasetName];
    if (label === undefined) {
      unlabelledDatasetCount += 1;
      continue;
    }
    datasetRows.push({
      label,
      // 워터마크가 없는 데이터셋은 "오래됐다" 가 아니라 "확인 시각을 모른다" 다.
      // 한 수로 합치면 생산자가 없는 데이터셋과 늦은 데이터셋이 같아진다.
      value:
        dataset.watermarkAt === null
          ? '최근 확인 시각이 기록되지 않았습니다.'
          : `최근 확인 ${new Date(dataset.watermarkAt).toLocaleString('ko-KR', {
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}`,
    });
  }

  const staleDatasetCount = data.datasets.filter(
    (dataset) => dataset.availability !== 'available',
  ).length;

  return {
    gapRows,
    unlabelledGapCells,
    stateRows,
    datasetRows,
    unlabelledDatasetCount,
    staleDatasetCount,
  };
}
