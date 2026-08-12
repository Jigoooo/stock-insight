/**
 * Market Home 의 예정 캘린더 — 정본 01 §2 가 요구하는 여섯 번째 섹션.
 *
 * `market.scheduled_event` 는 이미 매일 채워진다(`run-calendar-promote.ts`,
 * 그 파일 헤더가 스스로 "this job is not new collection; it is the last hop that
 * was never built" 라고 적었다). 미래 132건이 있고 리더에 SELECT 도 열려 있는데
 * **읽는 코드가 0개**였다. 거시 지표와 같은 모양이다 — 만들 것은 수집기가 아니라
 * 배선이었다.
 *
 * ## 132건을 다 그리지 않는다
 *
 * 실측(2026-08-12): 스페인 3개월 국채 입찰·남아공 기업신뢰지수까지 들어 있다.
 * 이 제품이 다루는 시장은 KR·US 이고, 정책 축은 중앙은행 회의다. 그 세 갈래로
 * 좁히면 39건 + 실적이 남는다. 좁힌다는 사실 자체를 화면이 말하게 한다 —
 * 조용히 자르면 "이게 전부" 로 읽힌다.
 *
 * ## 제목은 원문 그대로 옮긴다
 *
 * `title` 은 수집원이 쓴 영문이다(`ADP Employment Change Weekly`). 번역하면
 * 기록을 고쳐 쓰는 것이고, 버리면 무슨 일정인지 알 수 없다. 사건 목록이 이미 쓰는
 * 방식을 그대로 쓴다 — **누가 쓴 것인지 먼저 적고 원문을 옮긴다.**
 * 지역·종류처럼 우리가 분류한 값만 한국어로 바꾼다.
 */

export type ScheduledEvent = {
  key: string;
  scheduledOn: string;
  kindLabel: string;
  regionLabel: string | null;
  title: string;
};

export type ScheduledCalendar = {
  events: ScheduledEvent[];
  /** 이 화면이 좁히기 전 전체 미래 일정 수. 자른 사실을 숨기지 않는다. */
  totalUpcoming: number;
};

export type CalendarRowQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

const kindLabels: Record<string, string> = {
  central_bank_meeting: '통화정책 회의',
  economic_release: '경제지표 발표',
  earnings: '실적 발표',
  legislative_action: '입법 일정',
};

/**
 * `region` 은 원천마다 어휘가 다르다 — 경제지표는 나라 이름(`United States`),
 * 통화정책 회의는 기관 약어(`BOK`·`ECB`)다. 아는 것만 옮기고 모르는 값은
 * `null` 로 떨어뜨려 화면이 지역을 말하지 않게 한다. 원문 약어를 그대로 흘리면
 * 그것이 무엇인지 읽는 사람이 알 수 없다(UX 헌법 7번).
 */
const regionLabels: Record<string, string> = {
  'United States': '미국',
  'South Korea': '한국',
  Korea: '한국',
  BOK: '한국은행',
  ECB: '유럽중앙은행',
  FOMC: '미국 연준',
};

/**
 * 다가오는 일정을 날짜 순으로. `known_at <= $1` 이 PIT 다 — 오늘 알게 된 일정으로
 * 어제 화면을 다시 그리면 그 화면이 무엇을 알고 있었는지 재현할 수 없다.
 *
 * 좁히는 조건을 SQL 이 진다. 전부 가져와 앱에서 버리면 "전체 몇 건" 을 셀 수 없고,
 * 그 수가 없으면 잘랐다는 말을 할 수 없다.
 */
const CALENDAR_SQL = `
  WITH upcoming AS (
    SELECT scheduled_event_id, event_kind, scheduled_date, region, title
      FROM market.scheduled_event
     WHERE scheduled_date >= $1::date
       AND known_at <= $2::timestamptz
  )
  SELECT (SELECT count(*) FROM upcoming)::int AS total_upcoming,
         scheduled_event_id, event_kind, scheduled_date, region, title
    FROM upcoming
   WHERE event_kind = 'central_bank_meeting'
      OR event_kind = 'earnings'
      OR region IN ('United States', 'South Korea', 'Korea')
   ORDER BY CASE event_kind
              WHEN 'central_bank_meeting' THEN 0
              WHEN 'economic_release' THEN 1
              ELSE 2
            END,
            scheduled_date,
            scheduled_event_id
   LIMIT $3
`;

type CalendarRow = {
  total_upcoming: number | string;
  scheduled_event_id: number | string;
  event_kind: string;
  scheduled_date: string | Date;
  region: string | null;
  title: string;
};

/** 날짜 컬럼에 시간대를 태우지 않는다 — 거시 지표에서 하루가 밀렸던 바로 그 함정. */
function toDay(value: string | Date): string {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getScheduledCalendar(
  executor: CalendarRowQueryExecutor,
  options: { now?: Date; limit?: number } = {},
): Promise<ScheduledCalendar> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 8;
  const rows = await executor.queryRows<CalendarRow>(CALENDAR_SQL, [
    toDay(now),
    now.toISOString(),
    limit,
  ]);

  return {
    totalUpcoming: rows[0] ? Number(rows[0].total_upcoming) : 0,
    events: rows.map((row) => ({
      key: String(row.scheduled_event_id),
      scheduledOn: toDay(row.scheduled_date),
      // 이름을 모르는 종류는 원문을 그대로 흘리지 않고 중립어로 받는다(UX 헌법 7번).
      kindLabel: kindLabels[row.event_kind] ?? '예정된 일정',
      regionLabel: row.region ? (regionLabels[row.region] ?? null) : null,
      title: row.title,
    })),
  };
}
