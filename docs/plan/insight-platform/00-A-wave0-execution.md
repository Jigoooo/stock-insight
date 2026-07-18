# 00-A — 마스터 로드맵 심화: Wave 0 실행 WBS·의존성·리스크 레지스터

> 상위 문서: `00-master-roadmap.md` (Wave 정의)
> 성격: Wave 0 "운영 정합"의 구현 착수 가능 수준 상세 설계. 실행은 항목별 명시 승인 후.
> 실측 기준: 2026-07-18, `master@cc95685`

---

## 1. Wave 0 목표 재정의

**"코드를 새로 만들기 전에, 이미 쌓인 데이터가 API·상태감시·발행에 정직하게 반영되게 만든다."**

성공 판정 (전부 실측 게이트):

| G# | 게이트 | 측정 방법 |
|---|---|---|
| G1 | `/api/stocks`가 entities 전 종목(KR151+US102) 반환 | HTTP 응답 count = entities count |
| G2 | KR 종목 최신가 커버리지 ≥ 95% | latestPrice non-null 비율 |
| G3 | `/api/status` 데이터셋 ≥ 10종 워터마크 | 응답 datasets 배열 검사 |
| G4 | NestJS `/api/meta` 200 + 23라우트 golden diff 0 | cutover 스모크 스크립트 |
| G5 | market_snapshots 진단행이 어떤 read 경로에도 미유입 | 뷰 정의 + API 응답 검사 |
| G6 | fiscal_year=0 행이 API `available`로 미노출 | financials 응답 검사 |

## 2. WBS (작업 분해 — 실행 단위)

### W0-1. NestJS api-server 운영 cutover

| 단계 | 작업 | 산출물 | 검증 | 승인 |
|---|---|---|---|---|
| 1a | api-server 프로덕션 빌드 확인 (`pnpm --filter @stock-insight/api-server build`) + Dockerfile/compose 서비스 추가 (`stock-insight-api`) | compose diff | 로컬 기동 + `/api/health` `/api/meta` 200 | 빌드=승인 필요 |
| 1b | 레거시(`.output/server/index.mjs`)와 병행 기동 (별도 포트) | 두 프로세스 | 23라우트 golden diff 스크립트 (기존 parity 스크립트 재사용) | — |
| 1c | reverse proxy(또는 web SSR fetch base) 전환: `/api/*` → api-server | 설정 diff | 브라우저 QA + console error 0 | 배포=승인 필요 |
| 1d | 레거시 앱 API 핸들러 비활성(웹 SSR 전용화) | 코드 diff | 회귀 스모크 | 승인 필요 |

주의: 기존 세션에서 NestJS 마이그레이션이 "이식·parity 100%"까지 완료된 상태이므로 1a~1b는 재검증 성격. **image tag는 커밋 SHA 고정, `latest` 금지.**

롤백: proxy 라우팅을 레거시로 원복 (1c의 역방향, 1분 내).

### W0-2. 종목 universe SoT 교체

대상 코드: `apps/api/src/stocks/read-model.ts` `STOCK_LIST_SQL` (현재 `stock.candidates` 기반 CTE).

| 단계 | 작업 |
|---|---|
| 2a | `serving` 스키마 생성 + `serving.security_universe_v1` 뷰: `public.entities`(ticker, KR/US) LEFT JOIN 프로필·후보·watchlist·deep_cache |
| 2b | read-model SQL을 universe 뷰 기반으로 재작성. candidates는 `primaryThesis/confidence` 공급자로 강등 (LEFT JOIN) |
| 2c | `analysisStatus` 재정의: deep_cache 존재=cached, analysis_jobs 상태 반영, 나머지 none (현재 로직 유지) |
| 2d | 계약 영향: `stockListItemSchema` 무변경 (필드 동일, 모수만 확대) → web 그리드 렌더 QA |

검증 쿼리 (사전/사후):

```sql
-- 사전: 매칭 커버리지 (현재 KR 21/151, US 32/102)
-- 사후: API count == SELECT count(*) FROM public.entities WHERE entity_type='ticker' AND market IN ('KR','US')
```

리스크: 목록이 53→253으로 늘며 썸네일 데이터(가격·thesis) 결측 행 대량 노출 → `availability` 뱃지로 정직 표기 (기존 원칙 '결측은 상태로 표시'). UI 폭증 검증 필수 (SaaS UI 규칙: 브라우저 QA).

### W0-3. OHLCV serving 뷰 + 가격 API

| 단계 | 작업 |
|---|---|
| 3a | `serving.latest_price_v1`: `market_ts.ohlcv` timeframe='1D' 심볼별 최신 bar (close, prev_close 대비 change_pct 계산) + `stock.market_snapshots` fallback (US intraday) |
| 3b | `serving.price_series_v1`: (symbol, from, to, timeframe) 파라미터형 — 뷰가 아닌 read-model SQL로 구현 |
| 3c | stocks read-model의 latest_snapshots CTE를 latest_price 뷰로 교체 |
| 3d | 신규 라우트 `GET /api/stocks/:entityKey/prices?range=1M|3M|1Y` (api-server 컨트롤러 + zod 계약 `priceSeriesResponseSchema` 신설) |

심볼 매핑 규약: `market_ts.ohlcv.symbol`은 KR이 `005930.KS` 형식 → `regexp_replace(symbol,'\.(KS|KQ)$','')` 정규화를 뷰 안에서 1회만 수행 (산재 금지).

성능: ohlcv 63k rows, 심볼별 최신은 `DISTINCT ON (exchange,symbol) ORDER BY ts DESC` + `(symbol, timeframe, ts DESC)` 인덱스 확인. hypertable이므로 최근 chunk만 스캔 — p95 목표 50ms.

### W0-4. dataset_watermark 확대

현재 3종 → 목표 12종. 각 수집 파이프라인 종료 시 upsert (수집기 코드에 1 statement 추가):

| dataset_name | 원천 | 갱신 지점 |
|---|---|---|
| ohlcv_1d | market_ts.ohlcv max(ts) | run-ohlcv apply 후 |
| market_snapshots | stock.market_snapshots | 'all' 러너 |
| macro_observations | stock.macro_observations | 〃 |
| company_profiles | public.company_profiles | fundamentals 러너 |
| company_financials | public.company_financials | 〃 |
| rss_news | source_documents(rss_news) | rss ingest |
| news_translation | title_ko/summary_ko coverage | translation |
| market_signals | public.market_signals | signal 생성기 |
| graph_edges | ops.current_temporal_graph_edge | graph sync |
| forecast_outcome | ops.forecast_outcome_ledger | evaluator |
| publication_records | (기존) | 유지 |
| user_feed_index | (기존) | 유지 |

`/api/status`는 코드 무변경으로 자동 확대 (`dataset_watermark` 전량 조회 구조). row_count·watermark_at 채우기만 하면 됨. **status의 overall 판정이 12종으로 넓어지며 stale이 뜰 수 있음 → stale 기준(dataset별 allowed_lag)을 watermark 테이블에 컬럼 추가(additive)로 명시.**

### W0-5. 데이터 오염 격리

| 단계 | 작업 |
|---|---|
| 5a | `serving.market_snapshots_clean_v1` 뷰: `snapshot_type NOT IN ('api_key_status','env')` — read-model의 `WHERE symbol IS NOT NULL`을 뷰로 이전 |
| 5b | fiscal_year=0 재무행(20건): `quality_state='quarantined'` 컬럼 추가(additive) 또는 read-model WHERE 제외 + quality_incidents 기록 |
| 5c | `yfinance-error` provider 문서(3건): processing_status='quarantined' 마킹 |

원칙: **원본 삭제 금지** — 뷰/상태 컬럼으로 read 경로에서만 제외.

### W0-6. RSS provider 정책 등록

- `source_documents`의 provider_key `rss:*` 27종 추출 → `ops.source_collection_policy`에 일괄 insert
- 분류 기본값: `source_class='public_web', license_status='review_required', redistribution_scope='internal_only', enforcement_mode='shadow'` (기존 KDI와 동일 패턴)
- 개별 매체 약관 검토는 Wave 2 본문 수집 전 완료 조건

## 3. 의존성 그래프

```text
W0-1 (cutover) ──────────────┐
W0-2 (universe) ← W0-3a (latest_price 뷰)   │
W0-3 (가격 API) ← serving 스키마 생성        ├─→ G1~G6 통합 검증 → Wave 0 종료
W0-4 (워터마크) ← 수집기 3종 수정            │
W0-5 (오염 격리) ← W0-2/3 뷰 작업과 병합 가능 │
W0-6 (정책 등록) — 독립                      ┘
```

- W0-2와 W0-3은 같은 read-model 파일을 수정 → **한 브랜치에서 순차 진행** (충돌 방지)
- W0-1은 독립적이나, 라우트 추가(W0-3d)는 cutover 이후가 깔끔 → 순서: W0-1 → W0-3d
- 권장 실행 순서: `W0-6 → W0-5 → W0-4 → W0-3a/b → W0-2 → W0-1 → W0-3d`

## 4. 리스크 레지스터

| R# | 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|---|
| R1 | universe 확대로 UI 목록 폭증·성능 저하 | 중 | 중 | 페이지네이션 기본화 + 가상 스크롤 검토, 브라우저 QA |
| R2 | cutover 후 미발견 라우트 동작 차이 | 중 | 고 | golden diff 23라우트 + 1일 병행 관찰, 즉시 롤백 경로 |
| R3 | KR ohlcv 심볼 정규화 불일치(.KS/.KQ) | 중 | 중 | 뷰 단일 정규화 + KR 151종목 전수 조인 검증 쿼리 |
| R4 | status stale 대량 표출로 overall=stale 고착 | 고 | 저 | dataset별 allowed_lag 명시, UI는 dataset 단위 표기 |
| R5 | 수집기 수정(W0-4)이 기존 적재 회귀 | 저 | 고 | watermark upsert는 트랜잭션 말미 1 statement, dry-run 검증 |
| R6 | web SSR이 레거시 내부 핸들러에 암묵 의존 | 중 | 중 | SSR fetch base 명시(STOCK_INSIGHT_API_BASE_URL, 기존 Phase7 해결책 재사용) |

## 5. 승인 포인트 요약

| 승인 필요 | 항목 |
|---|---|
| DB 변경 | serving 스키마+뷰 생성, watermark 컬럼 추가, quality_state 컬럼, policy insert |
| 빌드·배포 | api-server 이미지 빌드, compose 변경, proxy 전환, 수집기 3종 수정 배포 |
| 불필요(읽기전용) | 검증 쿼리, golden diff 실행, QA |

## 6. Wave 0 완료 후 즉시 이어지는 것

- Wave 1 착수 결정 회의: 오케스트레이터 선정(06-A §2), 객체 저장소 경로 확정(02 §4), WAL 아카이빙(06-A §5)
- Wave 0 실측 리포트: G1~G6 결과 + 커버리지 before/after 표
