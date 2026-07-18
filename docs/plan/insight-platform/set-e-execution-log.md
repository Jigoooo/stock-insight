# SET E 실행 기록 — 그래프 추론 + Feature + 시장확인

> 실행일: 2026-07-18, SET D(`ebc6775`) 이후
> 계획 근거: `00-B-execution-bundles.md` §6, `04-A §4~6`

## E-1 relation 이관 + analytics 스키마 (migration 013)

- **비티커 엔티티 core 승격**: theme→Theme 138 / macro·index→Metric 309 / org→LegalEntity 156 / stage→Industry 38 / crypto→Token 24 (+665 신규, 'source' 유형은 provenance라 제외)
- `knowledge.relation` (bitemporal): **3,312/3,312 승격 — 손실 0**, structural 2,151 + statistical 1,161 (COMMON_OWNER·NEWS_COMENTION 등은 statistical로 분리 — 구조 관계 오인 방지)
- bitemporal 불변식(legacy_relation_key당 open 레코드 정확히 1개): **위반 0**
- `analytics.theme` 138 + membership 396 — **전부 'adjacent'** (co-mention 유래를 core로 승격 금지, Baseline §12.5). 멱등 재실행 시 중복 발견→NOT EXISTS 가드 추가 후 재검증 no-op
- 기존 graph_evidence 25,332건은 계획대로 **미이관** (source 없음 — evidence는 문서 기반으로 신규 축적)

## E-2 분할 조정 (핵심 발견 2건)

1. **압축 hypertable 제약**: ohlcv 183/262 chunk 압축 상태 → in-place UPDATE 불가(1.5GB 재압축 리스크). **factor 테이블 방식으로 전환**: `market.split_adjustment_factor` 567 구간/142종목 (조회 시 join, NVDA 1→10→40→60 누적배수 검증)
2. **이중조정 결함 자기검출**: yfinance bar는 **이미 분할조정 완료** (NVDA 2021-07 bar=18.78, post-split 스케일 실측) → feature 계산기가 factor를 또 나누면 최근 분할종목(KLAC 10:1, NFLX 10:1, 삼바 등)에 가짜 불연속 발생. **v2에서 원본 close 직접 사용으로 수정**, 재계산 후 KLAC ret_60d=+17.5% 연속성 확인. factor 테이블은 비조정 소스(KRX raw 등) 도입 시 사용하도록 주석 명시

## E-3 Feature 스냅샷 (fs_v1)

- **253종목 적재** (universe 254 중 bar 부족 0, 미수집 1), 평균 완전성 **0.902**
- 피처: price/ret_1d·5d·20d·60d/vol_20d/ma20·50_gap/rsi_14/volume_z_20d + short_vol_ratio_5d(US 101) + event_count_7d(90) + latest_revenue(84, available_at PIT 게이트)
- 결측은 null 유지(대체 금지), input_watermark에 소스별 기준 기록

## E-4 규칙 엔진 + impact_path (impact-v1)

- 이벤트 200건 × relation 2,125 walk (max 2 hop, allowlist 9 predicate) → **3,145 경로 / 174 종목 / 197 이벤트**
- path_score = event_strength × Π(confidence) × 0.7^(hops-1) × freshness(반감기 14d) — 문서 없는 legacy 이벤트는 strength 감쇠(0.5)
- **모든 경로가 edge 근거 보유** (path_edges empty = 0) — "경로 edge 추적 100%" 게이트 통과
- explanation에 요소별 기여도 저장 + "산업 연결 강도이지 가격 예측 아님" 명시

## E-5 시장확인 3축 serving 뷰 (migration 014)

- `latest_feature_snapshot_v1` / `impact_summary_v1` / `market_confirmation_v1`
- 3축 분리 유지(합산 점수 없음): 산업연결(graph) / 시장확인(ret_20d+volume_z 룰) / 기대반영도(rsi+ma20_gap 룰)
- 분포 실측: not_confirmed·low 161 / partial·medium 21 / confirmed·high 3 등 — 현 시장(조정장) 정합
- 샘플: 삼성전자 연결 0.871·미확인·low / NVDA 0.871·미확인·medium

## 게이트 요약

| 게이트 | 결과 |
|---|---|
| relation 손실 0 + bitemporal 불변식 | ✅ 3,312/3,312, 위반 0 |
| 경로 edge 근거 100% | ✅ 3,145/3,145 |
| 이중조정 방지 | ✅ 자기검출→수정→재검증 (KLAC/NFLX/207940 연속성) |
| 3축 비합산 | ✅ 뷰 설계상 강제 |
| 테마 co-mention core 승격 0 | ✅ 전부 adjacent |
| 멱등성 | ✅ 013/014 재실행 no-op |

## 남긴 것 (이월)

| 항목 | 사유 |
|---|---|
| suppress 조건(반대근거·포화도) 규칙 반영 | contradicts 링크 축적 후 (SET D NLI 이월과 연동) |
| exposure_ratio 실값 | 매출 segment 데이터 확보 후 (현재 미반영 — score에 포함 안 함) |
| 코인 feature (fs_v1 코인판) | 온체인 소스 확정 후 |
| macro vintage feature 조인 | nowcast 트랜치 (SET F 이후) |
| 정기 스케줄 (features 일 1회·inference 일 1회) | systemd 등록 = 별도 승인 |
| v1 API 라우트 (features/impact/confirmation) | serving 뷰 소비 컨트롤러 — 다음 API 트랜치 |
