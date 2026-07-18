# 05 — 콘텐츠 생산·개인화·서빙 (NestJS)

> Baseline: §11(리포트 생성), §12(리포트 유형), §13(개인화), §15(서빙)
> 실측 결합: 현행 briefing/publication 파이프라인과 NestJS api-server 23라우트의 전환 계획

---

## 1. 리포트 생산 파이프라인 (Baseline §11 채택)

```text
스케줄·중요 이벤트 → Report Planner → Coverage Universe → Evidence Pack
→ Section Outline → 구조화 초안(JSON) → 숫자·인용·시점 검증 → 모순·중복·표현 검증
→ 점수·불확실성 → Quality Gate → {원자적 발행 | 부분 재생성 | 격리(이전 버전 유지)}
```

### 1.1 현행 대비 전환

| 현행 | 목표 |
|---|---|
| briefing 스크립트가 LLM으로 Markdown 직접 생성 | Report Definition 입력 → 구조화 JSON(block_type) → 렌더러가 Markdown/웹 생성 |
| run에 모델·프롬프트 버전 없음 | report_run에 model/prompt/pipeline version 필수 |
| skip이 rc 0으로 침묵 | 기대 산출물 부재 = 품질 게이트 실패 = incident |
| 전체 재생성 | 실패 블록만 부분 재생성 (Baseline §11.6) |
| lifecycle_state active/expired | draft→validating→approved→published→superseded 상태 머신 |
| 클릭 가능 출처 5.3% | Evidence Pack 조건: 핵심 주장마다 직접 근거 ≥1, 문장 단위 인용 (§11.4) |

### 1.2 Report Definition 초기 3종 (Baseline §11.2 형식)

1. `daily_market_stock` — 시장별(KR/US) 마감 후. 섹션: 시장 요약/거시 동인/확인된 사건/테마 변화/자산 워치/일정·리스크/반대 근거·데이터 공백 (§12.1)
2. `daily_global_crypto` — 고정 UTC 컷오프. 섹션: 시총·변동성·파생/스테이블·순유입/체인 활동/업그레이드·언락/위험/테마 회전/데이터 신뢰성 (§12.2)
3. `asset_snapshot` — 정기 + 중요 이벤트 증분 (§12.4: 주식/코인 각각의 섹션 구성)

거래소별 마감이 다르므로 시장별 리포트 생성 후 글로벌이 조합 (§12.1). 기존 stock/crypto briefing 시각(08시/21시대)은 마감 조건(ready 워터마크) 게이트로 대체.

### 1.3 검증 항목 (Baseline §11.6 전체 채택)

JSON 스키마 / 숫자의 Evidence Pack 존재 / 인용의 실제 지지 / 시제 구분 / 자산명·티커·주소 정합 / 근거 이상 단정 금지 / 중복 / 투자 권유·확정 예측 표현 차단(기존 action-advice sanitizer 재사용) / 금지어·고지사항.

### 1.4 발행 원자성 (Baseline §11.7)

draft 저장 → 섹션·인용·품질 기록 → published 전환 → **같은 트랜잭션에서 serving 최신 포인터 교체** → 캐시 무효화 이벤트 → 실패 시 기존 발행본 유지.

## 2. 테마 객체화 (Baseline §12.5)

현재 THEME: 엔티티+edge 뿐 → 테마 정의·포함/제외 기준·핵심 노드·수혜/피해 메커니즘·노출도·시장 반영도·성숙도·반대 논거·붕괴 조건을 가진 객체로 승격. 멤버십 `core/adjacent/speculative` — 뉴스 동시 언급만으로 core 승격 금지.

## 3. 개인화 (Baseline §13 채택)

### 3.1 신호와 순위화

- 신호: 명시적(관심) > 포트폴리오(민감) > 행동(시간 감쇠) > 관계 기반(1~3 hop) > 위험 기반 > 편집 정책(선호보다 우선 가능)
- 2단계: 후보 생성(보유·관심·테마·그래프 이웃·시장 필수) → 순위화(relevance_score 공식 §13.2)
- `explanation_codes` 필수 (예: `WATCHLIST_DIRECT`, `SUPPLY_CHAIN_2HOP`, `CONCENTRATION_RISK`)
- 현행 자산 재사용: `v_user_feed_dedup`의 direct/related/indirect + hops + top_reason이 후보 생성기의 골격

### 3.2 비용 원칙 (§13.3)

Evidence Pack → 검증된 Content Pack → 사용자별 선택·순서 → 템플릿 연결 문장 → 피드.
사용자별 LLM 호출 금지. 세그먼트 캐시에 잔고·매입가 미포함.

### 3.3 콜드 스타트·필터 버블 (§13.4~13.5)

비로그인=글로벌+인기 테마 / 신규=명시 선택만 / 개인화 off=행동신호 미사용 / 지면 일부는 시장 필수 항목 예약 / 보유 자산 부정 정보도 중요하면 노출 / 반대 근거 슬롯 유지 / 숨기기·이유 표시 제공.

## 4. NestJS 서빙 전환 계획

### 4.1 현행 23 라우트의 재편

| 현행 라우트 | 처분 |
|---|---|
| `/api/health`, `/api/meta` | 유지 |
| `/api/dashboard/today`, `/api/stocks*`, `/api/market-news`, `/api/discover/stocks`, `/api/portfolio/digest`, `/api/me/bootstrap` | 유지하되 원천을 serving 뷰로 교체 (Wave 0~2) |
| `/api/watchlist*`, `/api/positions*` (쓰기) | 유지 (personalization 스키마로 원천 이관 시 함께) |
| `/api/workspace`, `/api/feed`, `/api/records/:key`, `/api/status`, `/api/radar`, `/api/history`, `/api/themes`, `/api/my-research`, `/api/entities/:key/relations` | v3 유지 → content/serving 재편 시 v1 신규 계약으로 병행 후 전환 |

### 4.2 신규 API (Baseline §15.2 + 실측 자산)

```text
GET /v1/reports/global?market=&type=&date=
GET /v1/reports/personalized/latest
GET /v1/assets/{key}/analysis          ← asset Content Pack
GET /v1/assets/{key}/prices?range=     ← market_ts.ohlcv (Wave 0 선행)
GET /v1/assets/{key}/fundamentals      ← financial_fact
GET /v1/assets/{key}/events?cursor=
GET /v1/assets/{key}/ownership
GET /v1/assets/{key}/forecasts         ← forecast 원장 + scorecard (Wave 5)
GET /v1/themes/{id}/analysis
GET /v1/reports/{id}/evidence
GET /v1/graph/paths/{impact_path_id}
GET /v1/datasets/coverage              ← 워터마크 확대판
```

응답 공통 필드 (Baseline §15.2): `as_of, data_cutoff, freshness, quality_status, version, payload, disclosures` — 현행 v3 meta(cutoff/watermark/sourceCoverage)와 정합, zod 계약으로 유지.

### 4.3 서빙 규칙 (§15.3~15.4)

- 허용: 최신 가격 결합, 권한·선호 필터, 사전 계산 카드 정렬·페이지네이션, 렌더링
- 지양: 그래프 탐색, 대규모 벡터 검색, LLM 생성, 전체 위험 재계산
- 새로고침 요청 → 기존 스냅샷 + `업데이트 중` 상태, 백그라운드 갱신
- 캐시: 버전 키(콘텐츠 ID+발행 버전), 삭제보다 전환. Redis/CDN은 트래픽 근거 관측 후 도입. 캐시 장애 시 PG 폴백. 미발행 초안 캐시 금지

### 4.4 운영 cutover (Wave 0-1 선결)

1. api-server artifact 빌드·이미지 태그 고정(`latest` 금지)
2. 병행 기동 + 골든 diff (레거시 대비 23라우트 parity)
3. 트래픽 전환 + `/api/meta` readback
4. 레거시 앱은 웹 SSR 전용으로 축소

## 5. 컴플라이언스 표기 (Baseline §19.3)

- 모든 리포트 블록: fact/reported_claim/inference/market_signal/counter_evidence/risk/unknown 배지
- 수익 보장·확정 권유 차단 (기존 sanitizer 유지·강화)
- 가격 목표·추천 등급 미제공 (도입 시 별도 방법론·승인 체계 필요)
- 데이터 지연·모델 생성 고지, 라이선스 제한 소스는 요약+메타만
