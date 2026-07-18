# SET C 실행 기록 — 시장 데이터 풍부화

> 실행일: 2026-07-18, SET B(`7087974`) 이후
> 계획 근거: `00-B-execution-bundles.md` §4, `03-A-connector-specs.md`

## C-1 스키마 (migration 010, 멱등 확인)

`market` 스키마: corporate_action / trading_calendar / financial_concept(12종 사전: DART accountId + us-gaap tag 매핑) / financial_fact(filing-level, PIT) / macro_vintage(ALFRED) / short_volume_daily(FINRA, short interest 아님 caveat COMMENT). 워커·앱 role GRANT 포함.

## C-2 재무 filing-fact

| 소스 | 결과 | 비고 |
|---|---|---|
| SEC companyfacts (`run-sec-financial-facts.ts`) | **49,366 facts / 93사 / 12 concepts / FY2020~** — FY 14,645 + Q1~Q3 34,721 | available_at=filed acceptance date, PIT 위반 0. 분기 재무 최초 확보 |
| OpenDART (`run-dart-financial-facts.ts`) | 구현 완료·**일일 쿼터 소진(status 020)으로 적재 대기** | --offset/--limit 재개형. 다음 쿼터 리셋 후 `--from-year 2022 --limit 30` 순환 실행 |

기존 208행(요약 JSON) 대비: US는 행당 2~3지표 요약 → concept 단위 4.9만 fact.

## C-3 OHLCV 5y + corporate actions

- OHLCV: `--period 5y` 옵션 추가 후 백필 — **295,283 bars 신규**, KR 151심볼·US 106심볼 × **2021-07 ~ 현재 (5년)**. 실패 1심볼(기존 결측 US와 동일)
- corporate_action: **8,390건** (배당 7,965 / 분할 425, 254종목 중 225 수집·194종목 배당 보유), 1962년까지 소급 — adjusted 가격 재계산의 원료 확보

## C-4 macro vintage (FRED/ALFRED)

- **31,438 rows / 12 코어 시리즈 / 2,867 vintage dates** (obs 2015-01-01~)
- PIT 증명: CPIAUCSL 동일 observation_date에 vintage별 상이한 값 실측 (수정치 이력 보존)
- 구현 노트: JSON file_type의 vintage 2,000개 상한 → 일별 시리즈(DGS2/DGS10 등)는 realtime 축 2년 창 분할 수집

## C-5 수급 (FINRA CNMS)

- **2,831 rows / 102 US 심볼 / 28거래일** (6/8~7/17). 데이터 정의 라벨: short interest 아님(venue=FINRA TRF/ADF)
- 구현 노트: CDN이 휴일·미발행 키에 404 대신 403을 반환 → 스킵 처리

## 남긴 것 (이월)

| 항목 | 사유 | 재개 방법 |
|---|---|---|
| OpenDART 분기 재무 적재 | 일일 쿼터 소진 (오늘 기존 fundamentals 러너가 선소비) | 쿼터 리셋 후 `run-dart-financial-facts.ts --apply --limit 30` 순환 (systemd 슬롯 등록은 별도 승인) |
| KRX corporate action 공식 소스 | 약관 검토 선행 (03-A §2.5) — 현재 yfinance 배당/분할로 1차 충족 | 약관 확인 후 교차검증 소스로 추가 |
| adjusted OHLCV 재계산 | corporate_action 확보 완료 — 계산기는 SET E(feature) 초입 | split/dividend 결합 adj_close 백필 |
| trading_calendar 적재 | 파생(ohlcv 거래일) 초기화는 SET E에서 | derived_ohlcv 소스로 upsert |
| KR 수급 재구조화 | KRX 공식 경로 확인 필요 | 〃 |
| 수집기 정기 스케줄 등록 | systemd 변경 = 별도 승인 | finra 일일·fred 주간·ca 주간 슬롯 제안 |

## 수집기 인벤토리 (SET C 신규 4종)

| 러너 | 모드 | 주기 제안 |
|---|---|---|
| `run-corporate-actions.ts` | 전 종목 actions upsert | 주 1회 |
| `run-sec-financial-facts.ts` | CIK별 companyfacts, --since-year | 주 1회 (실적 시즌 일 1회) |
| `run-dart-financial-facts.ts` | corp_code별, 쿼터 인지 재개형 | 일 1회 순환 |
| `run-fred-vintage.ts` | 12 시리즈 vintage 증분 | 주 1회 |
| `run-finra-short-volume.ts` | US universe 필터 일별 | 일 1회 (--days 3) |
