# SET F 실행 기록 — 개인화 + Calibration + 증분 브리프

> 실행일: 2026-07-18, SET E(`fd43dae`) 이후 — **번들 세트 A~F 마지막**
> 계획 근거: `00-B-execution-bundles.md` §7, `05-A §6`, `04-A §8`

## F-1 personalization 스키마 + 백필 (migration 015)

- user_profile / user_asset_affinity / user_feed_item (Baseline §6.6 채택)
- 백필: 프로필 1 (라이브 사용자), affinity 9 (watchlist 8 active + soft-removed 1은 valid_to 닫힘 — bitemporal 보존)
- 민감정보: 매입가·수량 미복제 (affinity는 유형·가중치만)

## F-2 피드 빌더 (`run-feed-build.ts`)

- 2단계 (Baseline §13.2): 후보 생성(발행 리포트 + 7d 이벤트 500 + impact path 500 + 1-hop 그래프 이웃) → 순위화
- 실측: 후보 475 → **20개 피드**, explanation_codes **누락 0** (MARKET_ESSENTIAL / WATCHLIST_DIRECT / SUPPLY_CHAIN_nHOP / SOURCE_BACKED / GRAPH_LINKAGE)
- 다양성 제약 검증: 엔티티당 최대 4 슬롯(cap 6 이내), **네거티브 슬롯 보장 동작** — 자연 선택에 부정 항목이 없자 rank 20에 sec_8k impact path 강제 삽입 실측
- 편집 슬롯: 발행 글로벌 리포트가 rank 1 고정 (선호보다 우선)
- **사용자별 LLM 호출 0** (조립만) — Baseline §13.3 게이트 충족

## F-3 Calibration (정직성 우선 설계 결정)

**발견**: `forecast_issuance_ledger.predicted_probability`가 **3,565행 전부 NULL** → Brier/log score는 수학적으로 불가능.
**결정**: 가짜 확률을 만들지 않고 **label-level calibration v1** (confidence label별 실현 적중률)로 범위 축소, method 필드에 사유 명기.

- `analytics.calibration_profile` 10그룹 (final outcome 3,361 기반) + `serving.forecast_scorecard_v1`
- 실측 인사이트: **label 순서성 확인** — CRYPTO/7d hit rate low 21.9% < medium 34.3%, US/7d low 7.5% < medium 15.7% (라벨이 실제 신호를 담음). US/30d medium은 invalidation 53%로 위험 라벨 검증
- 최소표본 규칙: n<30 그룹 `insufficient_sample=true` (10그룹 중 1)
- 이월: Brier·reliability 곡선은 발행기가 probability 기록 시작 후 (05-A 발행기 이월 항목과 연동)

## F-4 증분 이벤트 브리프 (`run-event-brief.ts`)

- 중요도 트리거: 문서 보유 24h 이벤트 → `editorial_importance` (유형 가중 × path 보너스 × 신선도), 임계 0.55
- 실측: 후보 중 2건 발행 (`event_brief` 리포트, scope=KR:000660·global), **포인터 2개 원자 등록**, 이벤트 중복 발행 방지(NOT EXISTS 게이트) 동작
- 사실형 블록 인용 2/2 = 100%, action-advice 게이트 통과

## 게이트 요약

| 게이트 (Baseline Phase 3~4 완료조건) | 결과 |
|---|---|
| 피드 생성 성공률 (대상 사용자) | ✅ 1/1, 20 항목 |
| 개인화 결과 설명 코드 100% | ✅ 20/20 |
| 부정 콘텐츠 미소실 (네거티브 슬롯) | ✅ rank 20 강제 삽입 실측 |
| 사용자별 LLM 0회 | ✅ 조립 전용 |
| 중요 사건 증분 브리프 + 원자 발행 | ✅ 2건, 포인터·supersession 정상 |
| calibration 정직성 (가짜 확률 0) | ✅ label-level로 명시 축소 |
| 멱등성 | ✅ 015 재실행 no-op, 피드 재실행 same-day 교체 |

## 남긴 것 (이월)

| 항목 | 사유 |
|---|---|
| Brier/reliability/ECE | 발행기 probability 기록 선행 (`forecast_issuance` 스키마는 준비됨) |
| 행동 신호(조회·숨김) affinity | 웹 이벤트 수집 트랜치 |
| 세그먼트 캐시·콜드스타트 웹 노출 | 사용자 1명 — 다중 사용자 시 |
| lineage 기반 선택 재계산 | 오케스트레이터(Dagster) 도입과 함께 |
| 피드/스코어카드/브리프 v1 API 라우트 | serving 소비 컨트롤러 트랜치 |
| 정기 스케줄 (feed 일 1회·brief 시간별·calibration 일 1회) | systemd 등록 = 별도 승인 |

---

# 번들 세트 A~F 총괄 (2026-07-18 완료)

| 세트 | 커밋 | 핵심 산출 |
|---|---|---|
| A | `652cb95` | serving 계층 + universe 254 + 가격 API + NestJS cutover |
| B | `7087974` | core 식별자(DART 100%·CIK 96) + ingestion 원장 + WAL/백업/복구 리허설 |
| C | `015fa66` | 5y OHLCV 295k + corporate action 8,390 + SEC facts 49,366 + ALFRED vintage 31,438 + FINRA 수급 |
| D | `ebc6775` | knowledge 문서 2,540·이벤트 2,999·claim 게이트 + 원자 발행 (인용 100%) |
| E | `fd43dae` | relation 3,312 bitemporal + feature 253종목 + impact 3,145 경로 + 3축 시장확인 |
| F | (본 커밋) | 개인화 피드 + label calibration + 증분 브리프 |

Baseline 9계층 전부 가동 상태 진입. 잔여는 각 세트 로그의 '남긴 것' 및 승인 대기 항목(스케줄 등록·DART 쿼터·RSS 본문 라이선스).
