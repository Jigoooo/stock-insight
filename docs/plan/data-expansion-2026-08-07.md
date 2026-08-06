# 데이터 확장 계획 — 2026-08-07

전부 실측 후 작성. 추측한 수치 없음.

## 지금 있는 것

```
종목      KR 194 · US 131                          core.v_security_universe
ETF        20종 (US 12 · KR 8) · 보유 4,628행
지수      ^GSPC · ^IXIC · ^DJI · ^VIX              KOSPI/KOSDAQ 지수 없음
OHLCV     336 심볼 · 266만 행 · 2021-07~          (상위는 crypto)
거시      FRED 14계열
법안·일정  없음
```

**미국 고용·물가는 이미 다 있다.** `CPIAUCSL` · `PCEPI` · `UNRATE` · `PAYEMS` ·
`ICSA` · `UMCSENT` · `RSAFS` · `INDPRO` · `DGS10/2` · `FEDFUNDS` · `WALCL` ·
`DCOILWTICO` · `DEXKOUS`. 이건 확장 대상이 아니라 이미 된 것이다.

---

## 확장 비용이 균일하지 않다 — 네 등급

비용을 가르는 것은 데이터의 크기가 아니라 **누가 그 표를 소유하는가**다.
`research_app` 은 네 프로젝트가 공유하고, 우리가 못 쓰는 표가 있다.

### 1등급 — 우리 저장소, 설정 변경

| 항목 | 무엇 | 비용 |
| --- | --- | --- |
| 금·은·구리 | FRED 가 이미 제공(`GOLDPMGBD228NLBM`·`PCOPPUSDM` 등) | 배열 1줄 + 마이그레이션 1행 |
| 시세 이력 | `--period 7d` → `5y` | 래퍼 한 단어 |

**주의**: 계열 목록이 **두 곳**에 있다 — `run-fred-vintage.ts:21-49` 의 배열과
`analytics.macro_series_topic`(마이그레이션 065·067). 한쪽만 고치면 *데이터는
들어오는데 그래프에 안 닿거나*, *엔티티는 있는데 데이터가 없다*. `DCOILWTICO` 가
실제로 그랬다(수집기 08-05, 엔티티는 067 로 따로).

### 2등급 — 우리 저장소, 새 수집기 (스키마는 이미 있다)

| 항목 | 준비된 것 | 없는 것 |
| --- | --- | --- |
| 한국 거시 (ECOS) | `ECOS_SERIES` 가 이미 `identifier_type` CHECK 에 있고(008:32) `market.macro_vintage` 를 그대로 쓴다 | 수집기 하나. 한국은행 API 키 |
| 일정·캘린더 | — | 표 하나 + 수집기. **아래를 볼 것** |

### 3등급 — 남의 저장소 (경계 문제)

| 항목 | 현재 | 넓히려면 |
| --- | --- | --- |
| 종목 유니버스 | `public.entities` 는 `research-app-db` 가 SQLite(`stock_watchlist.db`·`signal_graph.db`)에서 옮겨 쓴다. 미국 ~45종목이 `research-common/entity_universe.py:19-40` 에 하드코딩 | 그 저장소를 고치거나, **우리가 `public.entities` 에 쓰는 첫 교차 프로젝트 쓰기**를 만든다(현재 예외는 `ops.source_collection_policy` 하나뿐이고 `verify-table-ownership.sh` 가 감시한다) |
| ETF | `build_etf_basket_edges.py:66-92` 의 하드코딩 dict 2개(US 12 · KR 8). KR 은 네이버 API 가 **Top-10 만** 준다 | dict 편집(설정, 다른 저장소). SSGA 아닌 발행사(iShares·Vanguard)는 새 파서 |

### 4등급 — 원천 자체가 없다

**KOSPI/KOSDAQ 지수.** `run-ohlcv.ts:16-34` 의 KR 분기가
`^[0-9]{6}$ AND corporationClass IN ('Y','K')` 라 **구조적으로 지수를 못 받는다**.
미국 지수(`^GSPC`)는 들어와 있는데 그건 `public.entities` 에 그 행이 이미 있어서다.
지수를 넣으려면 그 유니버스 원천이 필요하고, 그건 3등급 문제다.

---

## 가장 큰 발견 — 일정 데이터는 없는 게 아니라 버려지고 있다

`research-common` 이 **이미 매일 수집한다.**

```
scripts/event_calendar.py        Nasdaq 경제일정 + 실적 캘린더
                                 HIGH_SIGNAL = FOMC · Fed · CPI · PCE · Payroll · Powell
                                 run_collectors.py:203 에 스케줄됨
                                 → state/calendar/events-latest.json  ← 파일에만

research_common/macro_calendar.py  BOJ · ECB · Fed · 한국은행 2026 회의 일정
                                   + CLARITY 법안 추적
                                   collect_macro_liquidity.py 로 스케줄됨
                                   → JSON 파일에만

research_common/regulatory.py      SEC EDGAR + Federal Register API
                                   (미국 규칙제정 · 행정명령, 키 불필요)
```

Postgres 에는 **파생 카드만** 들어오고 **날짜는 버려진다** —
`ingest_signals.py:121` → 시그널 카드 → `signal_graph.db` → `public.entities`.

**그래서 「법안 일정 수집」 은 새 수집기가 아니라 이미 받는 것을 승격하는 일이다.**
가장 싼 확장이면서 가장 큰 구멍을 메운다.

### 왜 이게 지금 중요한가

미귀속 `policy_event` **623건**이 여기 걸려 있다.

```
MACRO:gl_major_event         288
MACRO:crypto_regulation      241
MACRO:tariffs                 33
MACRO:narrative_ai_capex      32
MACRO:narrative_semiconductor 29
```

`tariffs` 는 `trade` 주제에 걸리는데 `trade` 는 **계열이 0** 이라 붙을 노드가 없다.
`crypto_regulation` 은 주제 어휘에 아예 없다. 일정 표가 생기면 이 사건들이 처음으로
**붙을 데**를 얻는다.

### 다만 성격을 구분해야 한다

시계열은 상관으로 종목에 닿는다(`MEASURED_BY` → `MACRO_COMOVEMENT` → 종목).
**일정은 상관이 아니다.** "언제 결정되나" 를 답하지 "어느 종목이 움직이나" 를 답하지
않는다. 일정을 종목에 잇는 다리는 `EXPOSES` 인데 **그게 0이다.**

그러므로 일정 도입은 두 단계다.

```
1  일정을 표로 들인다        사건이 주체를 얻는다. 경로는 아직 안 생긴다
2  EXPOSES 를 만든다        그래야 "이 법안이 어느 종목에 닿는가" 가 된다
```

1단계만 해도 값이 있다(달력·맥락). 2단계 없이 "경로가 생긴다" 고 말하면 안 된다.

---

## 순서 제안

```
A  원자재 3종 (금·은·구리)      1등급. 배열 + 마이그레이션. 반나절
B  일정 표 + JSON 승격          2등급. 이미 받는 것을 Postgres 로. 가장 큰 구멍
C  한국 거시 (ECOS)             2등급. 스키마 준비됨, API 키 필요
D  EXPOSES                     일정이 종목에 닿게 하는 다리
E  유니버스·ETF 확장             3등급. 남의 저장소 — 별도 합의 필요
F  KOSPI/KOSDAQ 지수            4등급. E 가 선행
```

**A 를 먼저 두는 이유**: 싸고, 두 곳 동기화 문제(위 주의)를 작은 변경으로 한 번
겪어 두면 이후 계열 추가가 안전해진다.

**B 를 C 보다 먼저 두는 이유**: C 는 새 API 키와 새 수집기가 필요한데, B 는 이미
매일 받고 있는 것을 옮기는 일이다. 같은 2등급이어도 B 가 훨씬 싸다.

---

## 먼저 물어야 할 것 — 유니버스를 정말 넓혀야 하는가

`KOSPI/KOSDAQ 전부` 는 194 → 2,500+, **13배**다. 그런데 이 제품은 개인 투자
리서치 피드다. 오늘 잰 것 하나가 여기에 걸린다.

```
미귀속 사건 2,641 중 유니버스 회사를 언급한 것   163 (6.2%)
```

나머지 93.8%가 미귀속인 것은 **필터가 맞게 도는 것**이지 결함이 아니었다.
유니버스를 13배로 넓히면 그 필터가 열리고, 수집·저장·경로 비용이 함께 13배가 된다.
**넓히는 것이 목적이 아니라 "무엇을 보고 싶은가" 가 목적**이어야 한다.

재보지 않은 것: 실제로 관심 종목이 몇 개인지, 그중 몇 개가 유니버스 밖인지.
그 수를 재면 E 의 크기가 "2,500" 이 아니라 실제 필요분으로 줄어든다.

---

## 함께 고칠 결함 둘 (조사 중 발견)

1. **FRED 계열 목록이 두 곳에서 조용히 어긋날 수 있다.** 배열과
   `analytics.macro_series_topic`. A 를 하면서 이 둘을 묶는 검사를 넣는다 — 오늘
   만든 재고 테스트와 같은 모양이다
2. **`database-ownership.md:62-63` 이 `market_ts.ohlcv` 를 "research-common 이
   쓰고 우리가 읽는다" 고 적었는데 `run-ohlcv.ts:154` 가 쓴다.** 둘 다 쓰면
   문서화되지 않은 공유 쓰기 면이고 `verify-table-ownership.sh` 가 안 잡고 있다.
   확인해서 문서를 고치거나 경계를 정해야 한다
