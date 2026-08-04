export type DataFeedbackTabId =
  | 'table'
  | 'data-grid'
  | 'progress'
  | 'spinner'
  | 'skeleton'
  | 'empty'
  | 'error'
  | 'loading';

export type DataFeedbackVariant = {
  id: string;
  label: string;
  description: string;
};

export type DataColumnKey = 'ticker' | 'company' | 'score' | 'status' | 'note' | 'source';
export type EditableDataColumnKey = Extract<DataColumnKey, 'status' | 'note'>;
export type DataRowStatus = '확인 전' | '확인 중' | '확인 완료';

export type DataRow = {
  id: string;
  ticker: string;
  company: string;
  score: number;
  status: DataRowStatus;
  note: string;
  source: string;
};

export type SortState = {
  key: DataColumnKey;
  direction: 'asc' | 'desc' | 'none';
};

export const dataFeedbackTabs = [
  { id: 'table', label: 'Table' },
  { id: 'data-grid', label: 'DataGrid' },
  { id: 'progress', label: 'Progress' },
  { id: 'spinner', label: 'Spinner' },
  { id: 'skeleton', label: 'Skeleton' },
  { id: 'empty', label: 'Empty' },
  { id: 'error', label: 'Error' },
  { id: 'loading', label: 'Loading' },
] as const satisfies readonly { id: DataFeedbackTabId; label: string }[];

export const dataFeedbackVariants = {
  table: [
    { id: 'expandable-rows', label: 'A · Expandable Rows', description: '행 아래 근거 펼침' },
    { id: 'sticky-surface', label: 'B · Sticky Surface', description: '고정 헤더와 낮은 표면' },
    { id: 'compact-ledger', label: 'C · Compact Ledger', description: '압축된 원장과 요약값' },
  ],
  'data-grid': [
    { id: 'precision-grid', label: 'A · Precision Grid', description: '선과 리사이저 중심' },
    { id: 'soft-sheet', label: 'B · Soft Sheet', description: '선택·편집 면 강조' },
    { id: 'dense-matrix', label: 'C · Dense Matrix', description: '숫자 정렬과 고정 식별 열' },
  ],
  progress: [
    { id: 'hairline-progress', label: 'A · Hairline Progress', description: '얇은 진행선' },
    { id: 'soft-meter', label: 'B · Soft Meter', description: '낮은 배경의 진행 면' },
    { id: 'segmented-track', label: 'C · Segmented Track', description: '구간별 진행 표시' },
  ],
  spinner: [
    { id: 'orbit', label: 'A · Orbit', description: '단일 궤도' },
    { id: 'three-dot', label: 'B · Three Dot', description: '순차 점 신호' },
    { id: 'signal-sweep', label: 'C · Signal Sweep', description: '짧은 스캔 신호' },
  ],
  skeleton: [
    { id: 'quiet-blocks', label: 'A · Quiet Blocks', description: '정적인 구조 블록' },
    { id: 'shimmer-surface', label: 'B · Shimmer Surface', description: '제한된 표면 이동' },
    { id: 'ledger-rows', label: 'C · Ledger Rows', description: '표 행 구조 미리보기' },
  ],
  empty: [
    { id: 'quiet-empty', label: 'A · Quiet Empty', description: '최소 안내' },
    { id: 'guided-empty', label: 'B · Guided Empty', description: '다음 행동을 포함한 면' },
    { id: 'inline-empty', label: 'C · Inline Empty', description: '데이터 영역 안 한 줄' },
  ],
  error: [
    { id: 'quiet-alert', label: 'A · Quiet Alert', description: '절제된 오류 안내' },
    { id: 'recovery-panel', label: 'B · Recovery Panel', description: '복구 행동 중심' },
    { id: 'inline-critical', label: 'C · Inline Critical', description: '행 안의 위험 상태' },
  ],
  loading: [
    { id: 'skeleton-first', label: 'A · Skeleton First', description: '구조를 먼저 표시' },
    { id: 'progress-panel', label: 'B · Progress Panel', description: '설명과 진행률 결합' },
    { id: 'staged-ledger', label: 'C · Staged Ledger', description: '단계별 수집 상태' },
  ],
} as const satisfies Record<DataFeedbackTabId, readonly DataFeedbackVariant[]>;

const tickers = ['005930', '000660', '035420', '051910', '207940', '006400', '068270', '105560'];
const companies = [
  '삼성전자',
  'SK하이닉스',
  '네이버',
  'LG화학',
  '삼성바이오로직스',
  '삼성SDI',
  '셀트리온',
  'KB금융',
];
const sources = ['DART', 'SEC', '한국거래소', '기업 IR'];
const statuses: readonly DataRowStatus[] = ['확인 전', '확인 중', '확인 완료'];
const notes = ['실적 발표 전 확인', '공시 연결 근거', '테마 영향 경로', '변동성 재검토'];

export function createDataRows(count: number): DataRow[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    id: `research-${String(index + 1).padStart(4, '0')}`,
    ticker: tickers[index % tickers.length]!,
    company: companies[index % companies.length]!,
    score: (index * 37) % 101,
    status: statuses[index % statuses.length]!,
    note: notes[index % notes.length]!,
    source: sources[index % sources.length]!,
  }));
}

function compareValues(left: DataRow[DataColumnKey], right: DataRow[DataColumnKey]) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), 'ko');
}

export function sortDataRows(rows: readonly DataRow[], sort: SortState): DataRow[] {
  if (sort.direction === 'none') {
    return [...rows];
  }

  const direction = sort.direction === 'asc' ? 1 : -1;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const result = compareValues(left.row[sort.key], right.row[sort.key]);
      return result === 0 ? left.index - right.index : result * direction;
    })
    .map(({ row }) => row);
}

export function updateDataCell(
  rows: readonly DataRow[],
  rowId: string,
  column: EditableDataColumnKey,
  value: string,
): DataRow[] {
  return rows.map((row) => {
    if (row.id !== rowId) return row;
    if (column === 'status' && !statuses.includes(value as DataRowStatus)) return row;
    return { ...row, [column]: value } as DataRow;
  });
}

export function getVirtualRange({
  scrollTop,
  viewportHeight,
  rowCount,
  rowHeight = 44,
  overscan = 6,
}: {
  scrollTop: number;
  viewportHeight: number;
  rowCount: number;
  rowHeight?: number;
  overscan?: number;
}) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);

  return {
    start,
    end,
    offsetTop: start * rowHeight,
    totalHeight: rowCount * rowHeight,
  };
}
