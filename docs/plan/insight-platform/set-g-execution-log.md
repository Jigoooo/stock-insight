# SET G 실행 기록 — 제품화·자동운영 완결

> 실행일: 2026-07-18
> 선행: SET A~F (`652cb95` → `ca04902`)
> 범위: 잔여 승인 5항목(RSS 본문, DART 재개, v1 API, 확률/Brier, 정기 스케줄) + 운영 배포

## G-1 라이선스 안전 RSS 본문

- 공용 정본 `research-common/research_common/news_feeds.py`에 RSS/Atom이 직접 제공한
  `description` / `content:encoded` / `summary` / `content` 추출을 추가했다.
- 기사 페이지는 크롤링하지 않는다. HTML tag·entity를 평문으로 정제하고 4,000자로 제한한다.
- stock-insight 수집 계약에 `summary`를 추가하고 content/revision hash에 포함했다.
- migration 016이 신규 source document를 knowledge에 승격하고 summary 변경 문서를 `pending`으로 되돌린다.
- 운영 실측: `public.source_documents` RSS 322건 중 summary 79건. 강제 수집 첫 실행은 80건
  (insert 5/update 75), 후속 실행은 멱등(unchanged 80).
- 현재 `knowledge.document` 2,568건, feed/legacy summary 보유 725건, pending 2,295건.
  2시간 주기 extraction이 100건씩 순차 처리한다.

## G-2 미래 예측 확률 발행

- source 후보 3테이블과 append-only `ops.forecast_issuance_ledger`에 확률 방법·기준시각을 추가했다.
- `ops.stamp_forecast_probability()` BEFORE INSERT trigger 우선순위:
  1. source explicit probability(0..1) → `source_explicit_v1` 또는 source method
  2. 발행시각 전에 계산된 동일 market/horizon/confidence label 적중률 →
     `empirical_label_target_hit_v1`
  3. 선행 표본 부족 → 확률 NULL + `unavailable_no_prior_calibration`
- 과거 3,565건은 소급 조작하지 않았다(현재 probability 보유 0건).
- rollback 격리 검증: explicit 0.63과 empirical 0.1571이 method/reference와 함께 저장됐고
  테스트 행은 ROLLBACK으로 0건 잔존.

## G-3 Calibration v2

- `analytics.probability_calibration_snapshot`과 `serving.probability_scorecard_v1` 구축.
- Brier, log loss, ECE, 10-bin reliability 계산기를 구현했다.
- 역사 검증은 각 발행시각에 이미 `known_at`이 지난 동일 segment outcome만 쓰는 expanding-window 방식이다.
- 실측: final outcomes 1,307 → PIT-safe 역사 score 34건,
  Brier 0.201461 / log loss 0.588888 / ECE 0.053757.
- live score는 오늘 이후 probability가 찍힌 forecast가 만기될 때부터 생성된다.
- daily job이 label calibration도 날짜별로 갱신해 미래 trigger의 base rate가 노후화되지 않는다.

## G-4 v1 데이터 제품 API

계약(Zod)·공통 read model·Nest controller·인증된 TanStack route를 동일하게 추가했다.

| 내부 Nest | 인증 web |
|---|---|
| `/v1/features` | `/api/v1/features` |
| `/v1/impact` | `/api/v1/impact` |
| `/v1/confirmation` | `/api/v1/confirmation` |
| `/v1/personal/feed` | `/api/v1/personal/feed` |
| `/v1/calibration/scorecard` | `/api/v1/calibration/scorecard` |
| `/v1/reports/latest` | `/api/v1/reports/latest` |

- 후보 실측: NVDA feature 1 / impact 1 / confirmation 1, feed 20,
  label scorecard 10 + probability scorecard 1, latest reports 4.
- 인증경계: web 무인증 401, localhost Nest만 내부 접근.
- golden diff: 후보 6/6 및 production 6/6에서 web/Nest `data` 완전일치.
- production image:
  - API `sha256:e82a9ac54272024ed9b90047e2ea338aaf86956f1333dfc437fb9c24af71f111`
  - web `sha256:233b6e1fa3fb74db110b2d21650d3be89c4da620e6a6f202d5536be9071b5c5e`
- 두 컨테이너 healthy, 각각 `127.0.0.1:8093`, `127.0.0.1:8091`에만 bind.
- API Node 24 base image도 digest pin으로 고정했다.

## G-5 자동 운영

10개 timer를 난립시키지 않고 세 파이프라인으로 묶었다.

| timer | 일정(KST) | 순서 | 첫 실운영 |
|---|---|---|---|
| market-enrichment | 매일 05:20 | DART → SEC → FINRA → FRED → 일요일 action → split factor | exit 0 |
| knowledge | 2시간마다 :45 | extraction 100 → event brief | exit 0 |
| analytics | 매일 07:45 | feature → graph → report → feed → calibration | exit 0 |

- systemd unit은 `ops/systemd/user/`에 추적하고 `~/.config/systemd/user/`에 0600 설치했다.
- `systemd-analyze --user verify` 통과, timer 3개 enabled + persistent.
- 첫 실행 readback SQL에서 실제 이름과 다른 `macro_observation_vintage`, `source_document_id`를
  사용해 서비스가 실패한 것을 journal로 검출했다. 실제 schema인 `macro_vintage`,
  `knowledge.claim_evidence`로 수정 후 세 서비스 모두 실제 exit 0을 확인했다.

## G-6 DART quota-safe 재개

- cursor 정본: `ingestion.source_watermark`, dataset `dart_financial_facts_cursor`.
- 하루 5개 기업, 회사 완료 후에만 cursor 전진. 회사 중간 quota 소진이면 같은 회사를 재시도한다.
- API status는 `000` 성공과 `013` 명시적 no-data만 정상 처리한다. `020`은 cursor 고정 partial,
  그 밖의 오류(잘못된 키·서버 오류 등)는 fail-closed로 종료해 기업을 건너뛰지 않는다.
- 현재 외부 API 결과: status `020`(일일 사용한도 초과), requests 1, facts inserted 0,
  `next_offset=1`, `quota_exhausted=true`.
- 따라서 **KR 분기 facts 적재 성공으로 선언하지 않는다.** timer가 다음 quota reset 후 자동 재시도한다.
- 같은 운영 실행에서 SEC 95사 factsSeen 67,313(기존과 멱등), FINRA 신규 505,
  FRED vintage 신규 1,044, split factor 567구간 readback 완료.

## 검증

- research-common pytest: 9/9 pass
- RSS/PIT focused Node tests: 8/8 pass
- probability unit tests: 3/3 pass
- api-server: 21 pass / 1 opt-in DB skip / 0 fail
- web: 158/158 pass
- contracts/db-schema/api typecheck: pass
- web route generation + production build: exit 0
- API Docker build + web Docker build: exit 0
- migration 016 두 번째 실행: INSERT 0 / UPDATE 0
- knowledge/market/analytics service 실제 재실행: 모두 exit 0
- production health + golden 6/6 + unauthenticated 401: pass

## 최종 운영 수치

- feature 253종목 / impact summary 198종목 / market confirmation 253종목
- 개인화 feed 20 / latest report pointer 4
- claim 14 / claim evidence 14 / event 3,029
- probability scorecard: CRYPTO 7d 역사 baseline 34건
- DART만 외부 quota reset 대기(자동 재시도 가동)
