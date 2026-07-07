# Stock Insight Phase 8~12 데이터 준비도·상태값 로드맵

작성: 2026-07-07 08:47 KST
범위: repo 문서·코드 정독, 운영 PostgreSQL/API/cron probe, 브라우저 실화면 QA, KR/US 데이터 소스·UI/UX 레퍼런스 조사, Phase 8~12 제한 구현·DB readback
원칙: 주문 기능 없음, API key 필요 작업 제외, 매수·매도 시점/권유 제외, 출처 없는 숫자 노출 금지, KR/US stock 기본 범위 유지

## 1. 결론

현재 Stock Insight는 Phase 7까지의 read-only 리서치 터미널 골격이 실제 DB/API/UI로 연결되어 있다. 다만 “빈칸”은 단순 UI 누락이 아니라 아래 5종으로 분류된다.

| 분류 | 현재 근거 | 판단 |
|---|---|---|
| 구조화 전(text_only) | `company_profiles` 8건 전부 `text_only`, 삼성전자/NVDA 상세가 회사 개요를 원문 기반으로 표시 | 정상 상태. 출처 있는 구조화 collector 전까지 숫자 승격 금지 |
| 수집중/결측(collecting/missing) | KR 다수 종목 등락률·상세 숫자, 출처 링크 일부가 “수집중” | UI가 정직하게 상태 표시 중. Phase 8에서 상태 contract를 더 잠가야 함 |
| 데이터 없음 | `user_positions`, `user_trades`, `user_judgment_evaluations` 0건 | 실제 보유/거래 성과 평가는 보류. 대신 Phase 12는 기록형 journal만 제한 도입 |
| 구현 완료 | `analysis_jobs/events`, `entity_glossary_terms`, `user_notification_rules`, `user_alert_events`, `user_decision_journal_entries` 생성·적용 | Phase 10~12 최소 운영화 완료. 모두 stock-only·비주문·기록형 gate 적용 |
| contract 불일치 | 설계문서에는 `unsupported`가 있었고 실제 `DataAvailability`에는 없었음 | Phase 8 1차 패스로 `unsupported`를 contracts/API normalize/web schema/status UI/DDL check에 반영 완료 |

## 2. repo 정독 결과: 상태값이 흐르는 경로

### 2.1 Contracts

| 파일 | 확인 지점 | 의미 |
|---|---|---|
| `packages/contracts/src/index.ts:7` | `dataAvailabilitySchema = available/missing/collecting/stale/text_only/unsupported/error` | 실제 API envelope 상태 source of truth |
| `packages/contracts/src/index.ts:33` | 모든 API envelope가 `availability` + `meta.source` 보유 | 화면은 값뿐 아니라 상태와 원천을 같이 받아야 함 |
| `packages/contracts/src/index.ts:429` | `stockCompanyProfile.status` | 회사 개요가 구조화/텍스트/결측인지 API에서 구분 가능 |
| `packages/contracts/src/index.ts:454` | `stockCompanyMetricGroup.availability`, `currency`, `sources` | 출처·통화 없는 재무/시장지표 승격 방지 장치 |
| `packages/contracts/src/index.ts:468` | `stockLearningCard.availability` | 공부 카드도 available/text_only로 구분 가능 |
| `docs/research_db_alignment_plan.md:39` | 설계상 `unsupported` 포함 | Phase 8 1차 패스로 코드와 문서 방향 정렬 완료 |

### 2.2 API read-model

| 파일 | 확인 지점 | 빈칸 분류 근거 |
|---|---|---|
| `apps/api/src/stocks/read-model.ts:556` | DB 문자열 상태를 `DataAvailability`로 normalize | 알 수 없는 값은 `missing`으로 강등 |
| `apps/api/src/stocks/read-model.ts:906` | deep report/learning/company/metrics/job를 한 detail DTO에 결합 | 상세 빈칸은 DB row 유무에 따라 섹션별로 다르게 닫힘 |
| `apps/api/src/stocks/read-model.ts:927` | `deepReport.status = reportMarkdown ? available : missing` | 원문 리포트 없으면 허위 요약 금지 |
| `apps/api/src/stocks/read-model.ts:935` | `companyProfile`, `companyMetrics`, `learningCards`, `glossaryTerms`, `analysisJob` optional | 없는 섹션은 API가 생략하고 UI가 상태문구로 닫음 |
| `apps/api/src/stocks/read-model.ts:994` | stock list read 실패는 `error` + `fallback` envelope | API 실패가 화면 crash로 번지지 않음 |
| `apps/api/src/stocks/read-model.ts:1013` | list row가 없으면 `collecting` | “빈 목록=오류”가 아니라 “수집중/아직 없음”으로 구분 |
| `apps/api/src/me/read-model.ts:267` | me bootstrap row 있으면 `available`, 없으면 `collecting` | 사용자의 관심/보유 원장 초기 상태 처리 |

### 2.3 Web/UI

| 파일 | 확인 지점 | UI 표시 정책 |
|---|---|---|
| `apps/web/src/shared/ui/primitives/status.ts:17` | 상태 라벨: 사용 가능/수집 중/오류/없음/오래됨/텍스트만 | 상태 UI primitive 존재 |
| `apps/web/src/entities/stock/model/schema.ts:11` | web stock schema도 contract와 같은 상태 enum 사용 | 프론트 모델이 API 상태를 보존 |
| `apps/web/src/entities/stock/ui/stock-detail.tsx:196` | 학습 카드 없으면 “학습 카드 수집중” | 카드 삭제보다 상태 표시 |
| `apps/web/src/entities/stock/ui/stock-detail.tsx:201` | 상세 패널에 `data-availability` 노출 | 브라우저 smoke로 상태 검증 가능 |
| `apps/web/src/entities/stock/ui/stock-detail.tsx:249` | 회사 개요 없으면 “회사 개요 원문은 수집중…” | 출처 없는 숫자 금지 문구 포함 |
| `apps/web/src/entities/stock/ui/stock-detail.tsx:343` | 출처 링크 없으면 “출처 링크는 수집중…” | 출처 추적 없는 정보 노출 방지 |
| `apps/web/src/entities/stock/ui/stock-detail.tsx:420` | statusLabel fallback은 `missing` | 화면 상태가 무한정 undefined로 새지 않음 |

## 3. 운영 DB/API/cron read-only probe 결과

### 3.1 DB object 존재 여부

| 대상 | 상태 | 판단 |
|---|---:|---|
| `public.user_watchlist` | 존재 | 관심종목 원장 사용 중 |
| `public.user_positions` | 존재 | 보유 원장 테이블은 있으나 현재 row 0 |
| `public.user_trades` | 존재 | 판단 복기 입력 row 0 |
| `public.user_judgment_evaluations` | 존재 | 평가 row 0 |
| `public.change_events` | 존재 | 변화 감지 이벤트 있음 |
| `public.company_profiles` | 존재 | text_only seed 있음 |
| `public.company_financials` | 존재 | source-backed market_snapshot 지표 있음 |
| `public.company_capitalization` | 없음 | API key/공식 원천 승인 전 보류. 현재 시총/주식수 구조화 전 |
| `public.analysis_jobs`, `public.analysis_job_events` | 존재 | Phase 10 apply 후 deep_cache learning jobs/events 기록됨 |
| `public.stock_learning_cards` | 존재 | 일부 available/text_only seed 있음 |
| `public.entity_glossary_terms` | 존재 | Phase 10 apply 후 durable fact 기반 용어 정의 생성 |
| `public.user_notification_rules`, `public.user_alert_events` | 존재 | Phase 11 apply 후 stock-only 알림 원장 생성 |
| `public.user_decision_journal_entries`, `public.v_user_decision_journal` | 존재 | Phase 12 apply 후 기록형 journal 생성. 권유/시점 문구 금지 |

### 3.2 핵심 row/freshness 수치

| 항목 | 수치 | 최신/상태 | 해석 |
|---|---:|---|---|
| active watchlist | 8 | latest added `2026-06-07 22:16 KST` | 개인 리서치 범위 존재 |
| open positions | 0 | - | 보유 입력 없음. 평가금액/수익률 허위 생성 금지 |
| user trades | 0 | - | 매수·매도 판단 복기 구현 보류 근거 |
| judgment evaluations | 0 | - | Phase 6/12 평가 보류 근거 |
| change_events total | 1,097 | latest `2026-07-07 05:46 KST` | 변화 이벤트는 존재하나 crypto 편중 |
| stock unresolved change_events | 59 | latest `2026-07-07 00:18 KST` | stock 이벤트는 일부 존재 |
| v_user_feed_dedup | 259 total / 257 stock | latest `2026-07-06 00:00 KST` | 개인화 feed fallback 원천 정상 |
| source_documents | 410 total / 337 stockish_or_null | latest `2026-07-06 00:00 KST` | source freshness는 약 32h 수준 |
| publication_records | 416 total / 364 stock | latest `2026-07-06 15:48 KST` | 발행 DB 연결 유지 |
| stock.candidates | 1,170 | latest `2026-07-07` | 종목 후보 원천 충분 |
| stock.market_snapshots | 14,946 total / 13,739 KR/US | latest `2026-07-07T08:01 KST` | 가격/시장 스냅샷 최신 |
| watchlist.deep_cache | 8 | all report non-empty | 심층 리포트 원문 기반 존재 |
| company_profiles | 8 text_only | latest `2026-07-07 02:25 KST` | 구조화 전, 원문 기반 표시가 맞음 |
| company_financials | 25 available | missing source/currency 0 | `market_snapshot` 20 + SEC `sec_annual_facts` 5 |
| stock_learning_cards | 4 available / 4 text_only | latest `2026-07-07 02:25 KST` | 공부 카드 일부만 실데이터 |
| entity_glossary_terms | 16 | Phase 10 apply | deep_cache durable fact 기반, 출처 없는 것은 text_only 맥락 유지 |
| analysis_jobs/events | 8/40 | Phase 10 apply | deep_cache learning job/event timeline 운영화 |
| user_notification_rules/events | 1/3 | Phase 11 apply | stock-only rule 1, alert ledger 3, 비주식 누수 0 |
| user_decision_journal_entries | 3 | Phase 12 apply | 기록형 alert_review 3, advice_prohibited=true, 행동조언 누수 0 |

### 3.3 HTTP API live smoke

Base: `http://127.0.0.1:6123`, `DATABASE_URL=postgresql://research_app@127.0.0.1:55432/research_app`

| Endpoint | 결과 | 판단 |
|---|---|---|
| `/api/me/bootstrap` | `database/available`, watchlist 8, positions 0 | 원장 조회 정상 |
| `/api/portfolio/digest` | alerts 8, exposures 7, freshness 3, exposureSum 100, nonStockFiltered 0 | 포트폴리오 digest 정상, 비주식 누수 없음 |
| `/api/dashboard/today` | stocks 8, insights 5, themes 2, focusTheme `watchlist` | dashboard bootstrap 정상 |
| `/api/market-news?type=all` | count 100, nonKRUS 0 | 시장 뉴스 기본 범위 정상 |
| `/api/discover/stocks?market=KR&reason=all` | count 28, first `KR:000660`, nonKRUS 0 | KR discover 정상 |
| `/api/stocks?market=KR&scope=all&q=삼성` | count 7, first `KR:005930` | 검색 정상 |
| `/api/stocks/KR%3A005930` | deepReport available, companyProfile text_only, companyMetrics 0, learningCards 1, analysisJob null | 삼성전자 상세는 원문/학습카드 중심, 구조화 시장지표 없음 |
| `/api/stocks/US%3ANVDA` | deepReport available, companyProfile text_only, companyMetrics 1, learningCards 1, analysisJob null | NVDA는 source-backed market_snapshot 1그룹 표시 가능 |

초기 no-write smoke 이후 승인된 Phase 9~12 apply가 수행됐다. 최종 readback 기준 `company_financials=25`, `analysis_jobs/events=8/40`, `entity_glossary_terms=16`, `user_notification_rules/events=1/3`, `user_decision_journal_entries=3`; `user_positions/user_trades/user_judgment_evaluations=0`은 유지.

### 3.4 Cron 상태

| job | 상태 | 해석 |
|---|---|---|
| `research_app 발행 (아침)` | last_status ok, 07:10 KST | 발행 sync 정상 |
| `research_app 발행 (저녁)` | scheduled, 아직 last_run 없음 | 신규 등록 후 첫 저녁 실행 전 |
| `research_app 그래프 sync` | last_status ok, 07:20 KST | graph/feed rebuild 경로 정상 |
| `research_app 발행 파이프라인 watchdog` | last_status ok | 발행·그래프 stale 감시 존재 |
| `상시 업데이트 루프` | last_status ok, 05:46 KST | 숫자형 변화감지 loop 존재 |
| `research SQLite→PG mirror before loop monitor` | last_status ok | bridge는 존재하나 구조적 endpoint는 PG direct-write가 별도 과제 |
| `research-loop-monitor` | last_status error | 별도 monitor 오류. API read path 자체는 smoke로 정상 확인됨 |

## 4. 브라우저 실화면 QA

| 시나리오 | 결과 |
|---|---|
| `/` 초기 진입 | title `Futur Insight - Research Feed`, shell dataset `source=database`, `availability=available`, `portfolioSource=database`, `portfolioAvailability=available` |
| 콘솔 | JS error 0. Vite debug 연결 메시지만 존재 |
| 종목 분석 탭 | `종목 61개 DB · 사용 가능`; 삼성전자 등 KR 종목은 `등락률 수집중`으로 노출 |
| 삼성전자 상세 클릭 | 회사 개요 `text_only`, 공부 카드 렌더링, 관련 뉴스 3건, “주문 기능 없음” 유지 |
| 포트폴리오 탭 | `포트폴리오 DB · 사용 가능`, `Digest DB · 사용 가능`, KR 38% + US 62% = 100%, `목업` 문구 0 |
| 상단 검색 입력 | `삼성` 입력 후 console error 0, 화면 깨짐 없음 |

판단: 실화면은 데이터 상태를 숨기지 않고 표시한다. 남은 문제는 “상태 contract의 완성도”와 “빈 상태별 UX 품질”이지, API 연결 자체의 부재가 아니다.

## 5. KR/US 데이터 소스·UI/UX 레퍼런스 정리

| 영역 | 후보 | 확인 내용 | 제품 반영 판단 |
|---|---|---|---|
| KR 공시/재무 | OpenDART | DART 원문 XML, 주요 공시, 정기보고서 재무정보, KOSPI/KOSDAQ 분기 재무정보 제공. 인증키 관리 필요 | Phase 9의 KR 재무·회사정보 1차 정식 원천 후보. API key는 주인님 승인 전 사용 금지 |
| US 공시/XBRL | SEC EDGAR `data.sec.gov` | 인증/API key 없이 submissions, companyfacts, companyconcept, frames JSON 제공. 10-K/10-Q 등 XBRL 업데이트 | US 재무 구조화의 1차 정식 원천. User-Agent/SEC 정책 준수 필요 |
| 시장가격 보조 | yfinance | Yahoo 비공식 오픈소스 도구, 연구·교육/개인사용 전제, Yahoo 약관 확인 필요 | 이미 시장 snapshot seed에 쓰는 보조 원천. production 핵심 출처로 단독 승격 금지 |
| KR 가격/시총 보조 | pykrx | KRX/Naver 스크래핑. 공식 데이터와 차이 가능, 무분별 호출 자제, 상업 사용은 제공처 약관 준수 필요 | backfill/검증 보조 후보. 운영 collector는 rate-limit·약관·공식성 확인 후 제한 사용 |
| 상업 재무 API | FMP 등 | 재무제표·시총 API 제공하나 API key/pricing/terms 필요 | 빠른 보강 후보지만 비용·약관 승인 전 제외 |
| 빈 상태 UX | NN/g Empty State | empty state는 시스템 상태 전달, 학습성 증가, 다음 행동 제공에 유용 | Phase 8 UI 상태 matrix에 “왜 비었는지 + 다음 행동 1개”를 표준화 |

## 6. 구현 제외 범위

| 제외 | 이유 | UI 처리 |
|---|---|---|
| 실제 매수·매도 주문, 브로커 API, 주문권한 키 | 제품 정체성은 조회 전용 리서치 터미널 | 모든 화면에 “조회 전용/주문 기능 없음” 유지 |
| 출처 없는 재무/주주/시총 숫자 | 숫자 신뢰도 훼손 | `text_only` 또는 `collecting`; 0으로 대체 금지 |
| Phase 6 판단력 평가 즉시 구현 | trades/evaluations/note 데이터 0 | 자리만 보존, “준비중/기록 없음” 표시 |
| crypto/realestate 기본 노출 | KR/US stock 앱 범위 오염 | API 필터로 기본 비노출, 별도 명시 필터 전 금지 |
| 스크래핑-only 상업 운영 | 약관/정확도 리스크 | 공식 원천 우선, 스크래핑은 보조·검증용 |
| mirror cron을 migration 완료로 간주 | SQLite→PG mirror는 bridge일 뿐 SoT 전환 아님 | freshness 표시는 하되 구조적 endpoint는 PG direct-write 설계로 분리 |
| HFT/초단타 실시간 호가 | 현재 리서치 앱 범위 초과, 안정성/비용 리스크 | 15분~일 단위 freshness 중심 |

## 7. Phase 8~12 로드맵

### Phase 8 — 상태 contract/UX 불변식 정렬

목표: “수집중/준비중/한계”를 코드·API·UI·문서에서 하나의 상태 매트릭스로 잠근다.

| 작업 | 산출물 | 검증 |
|---|---|---|
| `DataAvailability` matrix 확정 | `available/text_only/stale/collecting/missing/error/unsupported` 여부 결정 | contract/doc/web schema 일치 |
| `unsupported` 도입 또는 문서 제거 | KR/US 범위 밖 상태 처리 정책 | API schema + UI label + tests |
| `DataQualityPopover`/status primitive 강화 | source, updatedAt, quality flags 표준 표시 | 2차 완료: stock detail + dashboard 주요 status 품질 팝오버 DOM hook/클릭/브라우저 시각 QA 통과 |
| 모든 주요 섹션 상태 인벤토리 | stock detail, portfolio digest, market news, discover, learning card | 진행 중: status badge 직접 사용과 EmptyState 문구는 helper 경로로 수렴, dashboard 주요 4섹션 + stock detail 7종 fixture 통과. 남은 것은 discover/learning card 상태화 |
| 빈 상태 copy 표준화 | “왜 비었는지 + 다음 행동 1개” | 완료: `buildEmptyStateCopy` + browser DOM/시각 QA로 종목/포트폴리오/Digest 판독 확인 |

우선순위: 최상. 이후 Phase 9~12에서 상태 누락이 재발하지 않게 하는 기반이다.

#### Phase 8 진행 기록 — 2026-07-07

| 항목 | 상태 | 근거 |
|---|---|---|
| `unsupported` 상태 도입 | 완료 | `packages/contracts/src/index.ts`, `apps/api/src/stocks/read-model.ts`, `apps/web/src/entities/stock/model/schema.ts`, `apps/web/src/shared/ui/primitives/status.ts` |
| DB additive DDL check 정렬 | 완료 | `packages/db-schema/src/migrations/001_app_research_foundation.ts`의 3개 availability CHECK에 `unsupported` 추가 |
| UI DOM 상태 전달 | 완료 | `stock-detail.tsx`가 `unsupported`를 `data-availability`까지 보존 |
| `DataQualityPopover`/품질 설명 | 1차 완료 | `buildDataQualitySummary`가 상태별 이유·다음 행동·원천·갱신시각을 표준화하고, stock detail에 `data-testid="stock-detail-quality-popover"` 연결 |
| 주요 status 품질 팝오버 확산 | 완료 | `market-news-quality-popover`, `stock-list-quality-popover`, `portfolio-quality-popover`, `portfolio-digest-quality-popover` 연결. `StatusQualityStack`으로 dashboard status badge + 품질 설명 묶음 |
| 팝오버 배치 QA | 완료 | 헤더/stock detail 팝오버는 below, digest는 above로 분기. 브라우저 측정상 주요 팝오버 모두 viewport 안에서 클릭·판독 가능 |
| 빈 상태 copy 표준화 | 완료 | `buildEmptyStateCopy`가 `없음 — 이유. 다음 행동: ...` 형식을 보장. 뉴스/종목/수동 원장/Digest EmptyState와 `emptyText`에 적용 |
| E2E 상태 UI smoke | 완료 | `dashboard.spec.ts`가 stock 검색 빈 상태의 표준 copy, `stock-list/market-news/portfolio/portfolio-digest` 4섹션, stock detail 전용 API, learning card, discover 발굴 후보의 `available/text_only/stale/collecting/missing/error/unsupported` 7종 status·popover·viewport containment를 검증. desktop 전체 E2E 통과 |
| 회귀 테스트 | 완료 | web status/schema, API read-model normalize, db-schema migration 테스트 추가 |
| 남은 Phase 8 작업 | 완료 | discover와 learning card까지 실제 데이터 상태 wrapper 적용. 다음 작업은 Phase 9 source-backed collector/backfill |

### Phase 9 — source-backed KR/US 구조화 collector/backfill

목표: text_only 회사 개요와 시장 snapshot만 있는 상태에서, 공식/준공식 출처 기반 구조화 데이터를 늘린다.

| 작업 | 데이터 원천 | 저장 후보 | 주의 |
|---|---|---|---|
| US company facts collector | SEC EDGAR companyfacts/submissions | `company_financials` | CIK 매핑, User-Agent, XBRL tag normalization |
| KR disclosure/financial collector | OpenDART | `company_profiles`, `company_financials` | API key 승인 필요, corp code 매핑 필요 |
| capitalization collector | SEC/OpenDART/검증된 시장데이터 | 신규 `company_capitalization` | 현재 테이블 없음. additive DDL 전 dry-run/backup 필수 |
| market snapshot quality audit | 기존 `stock.market_snapshots` | `company_financials(metric_group='market_snapshot')` 보강 | 이미 20건 있음. source/currency/range gate 유지 |
| glossary extractor | deep report + source docs | `entity_glossary_terms` | 현재 0건. 출처 없는 정의는 text_only로 낮춤 |

완료 기준: `company_profiles` 중 structured available 비중 증가, `company_financials` source/currency 누락 0 유지, `company_capitalization` 도입 시 `as_of_date/source` 없는 값 API available 금지.

#### Phase 9 진행 기록 — 2026-07-07 read-only DB audit

측정 조건: `postgresql://research_app@127.0.0.1:55432/research_app`, `BEGIN READ ONLY`, `transaction_read_only=on`, 측정시각 `2026-07-07T11:31:34+09:00`.

| 항목 | 실측 | 판단 |
|---|---:|---|
| `public.entities` | 748 | 종목은 `entity_type='ticker'`로 저장됨. KR 96, US 85 |
| `public.company_profiles` | 8 | KR 3 / US 5 모두 `text_only`. structured `available` 0 |
| `public.company_financials` | 20 | 전부 US `market_snapshot` + `available`; source/currency 누락 0 |
| `public.company_capitalization` | 없음 | Phase 9 DDL 후보이나 dry-run/backup/승인 전 실제 생성 금지 |
| `public.stock_learning_cards` | 8 | 4 available / 4 text_only. 모두 deep_cache 파생 |
| `public.entity_glossary_terms` | 0 | Phase 10 또는 glossary extractor 전까지 비워두는 것이 정직 |
| `stock.market_snapshots` | 15,266 | US single_stock 12,220행은 가격/기술지표 보강 원천. KR/US market_proxy는 currency 없음 |
| `watchlist.deep_cache` | 8 | report/source 모두 존재. 학습카드·용어 추출 후보 |

앱 표면 8개 deep-cache 종목 기준: KR 3종목은 company financial 0, US 3/5종목(NVDA/PLTR/TSLA)만 `market_snapshot` financial 1행 존재. 따라서 Phase 9 첫 구현은 **SEC EDGAR CIK 매핑 + companyfacts dry-run**이 최우선이다. 이유: 인증키 없이 공식 JSON으로 US `company_financials`를 `market_snapshot` 너머의 source-backed 재무 지표로 확장할 수 있고, OpenDART는 API key 승인 전 write/backfill이 불가하다.

#### Phase 9 진행 기록 — 2026-07-07 SEC EDGAR dry-run

구현: `apps/api/src/backfill/sec-edgar.ts`, `apps/api/src/backfill/run-sec-edgar.ts`, `apps/api/test/sec-edgar-dry-run.test.ts`. dry-run은 `BEGIN READ ONLY`로 앱 표면 US ticker를 읽은 뒤 SEC 공식 JSON(`company_tickers.json`, `companyfacts/CIK*.json`)만 조회한다. 승인 후 apply 경로는 `company_financials(metric_group='sec_annual_facts')`를 idempotent upsert하고 `migration_runs`에 감사 기록을 남긴다.

실행: `DATABASE_URL=postgresql://research_app@127.0.0.1:55432/research_app SEC_USER_AGENT=... pnpm --filter @stock-insight/api backfill:sec-edgar:dry-run`.

| 항목 | dry-run 결과 | 판단 |
|---|---:|---|
| sourceRows / usTickerRows | 5 / 5 | 앱 표면 US deep-cache 종목만 대상 |
| SEC CIK match | 5 / 5 | BMNR, FIG, NVDA, PLTR, TSLA 모두 매핑 |
| companyfacts fetch | 5 / 5 | 공식 SEC JSON 접근 성공 |
| `sec_annual_facts` 후보 | 5 | 모두 `available` 승격 후보 |
| DB write 검증 | `company_financials=20`, `migration_runs(sec)=0` | dry-run 후 DB row 변화 없음 |

승격 후보 metric: revenue, grossProfit, operatingIncome, netIncome, assets, liabilities, equity, grossMarginPct, operatingMarginPct, netMarginPct. 5종목 모두 10개 metric 후보를 만들었고, FIG의 영업·순이익률은 -100% 아래라 extreme warning으로 보존했다.

#### Phase 9 진행 기록 — 2026-07-07 SEC EDGAR apply

사전 백업: `/home/jigoo/.hermes/backups/stock-insight/research_app-sec-edgar-preapply-20260707-121902.dump` (`sha256=4dbc25f6695b8551101dfcca67b082ffd106706c6852f93d41cf21fc6a648bd6`). 적용 명령: `DATABASE_URL=postgresql://research_app@127.0.0.1:55432/research_app SEC_USER_AGENT=... pnpm --filter @stock-insight/api backfill:sec-edgar:apply`.

| 항목 | apply/readback 결과 | 판단 |
|---|---:|---|
| rowsRead / rowsWritten / rowsSkipped | 5 / 5 / 0 | BMNR, FIG, NVDA, PLTR, TSLA 적용 |
| `company_financials` total | 20 → 25 | 신규 `sec_annual_facts` 5건 추가 |
| `sec_annual_facts` source/currency/availability 오류 | 0 / 0 / 0 | 모든 row USD + SEC source 2개 + available |
| metric sanity | total metrics 50, bad gross/income margin 0 | FIG 극단 margin은 warning으로 보존 |
| migration audit | `migration_runs` SEC 1건 | `source_system='sec-edgar'`, completed |
| API/read-model smoke | BMNR, FIG, NVDA, PLTR, TSLA 모두 detail에서 `sec_annual_facts:10` 노출 | financial-only detail anchor 보강 후 fallback gap 해소 |

Phase 9의 SEC EDGAR annual facts backfill은 완료. 추가로 `apps/api/src/stocks/read-model.ts`의 detail anchor를 `latest_candidate` 단독에서 `public.entities` 기반 financial-only anchor까지 확장하여, candidate row가 없는 BMNR/FIG/TSLA도 회사 재무 fact가 있으면 상세 화면에 노출된다.

### Phase 10 — analysis job/learning pipeline 운영화

목표: API key 없이 기존 `watchlist.deep_cache`와 앱 DB만 사용해, 진행 상태·학습 카드·용어 사전을 멱등 생성한다. 매수·매도 시점/주문성 판단은 포함하지 않는다.

구현: `apps/api/src/backfill/phase10.ts`, `apps/api/src/backfill/run-phase10.ts`, `apps/api/test/phase10-learning-pipeline.test.ts`. 사전 백업: `/home/jigoo/.hermes/backups/stock-insight/research_app-phase10-preapply-20260707-130221.dump` (`sha256=d08ade46b0291d90035478007a2a93ae28959096632009230faba8dda10088d5`). 적용 명령: `DATABASE_URL=postgresql://research_app@127.0.0.1:55432/research_app pnpm --filter @stock-insight/api backfill:phase10:apply`.

| 항목 | apply/readback 결과 | 판단 |
|---|---:|---|
| sourceRows | 8 | deep_cache 8개 종목만 사용. 외부 API/API key 없음 |
| `analysis_jobs` | 8 | idempotency_key 기반 completed learning refresh job 생성 |
| `analysis_job_events` | 40 | queued/source_check/summarizing/cards_generated/completed timeline append |
| `stock_learning_cards` | 8 | 기존 카드와 멱등 upsert, source refs 보존 |
| `entity_glossary_terms` | 16 | durable fact 기반 glossary 16건 생성 |
| `migration_runs` | Phase10 1건 | rowsRead 8 / rowsWritten 72 / rowsSkipped 0 |
| API/read-model smoke | 8개 detail에 `analysisJob=completed`, glossary 노출 | 진행률/학습 상태가 DB 기반으로 표시 가능 |

완료 기준 충족. 다만 이것은 “학습/분석 상태 기록”이며, 투자 타이밍 추천·매수·매도 판단 엔진이 아니다.

### Phase 11 — notification center/portfolio alert 운영화

목표: portfolio digest 계산 결과를 사용자별 알림 원장으로 확장하되, 비주식·crypto 누수와 매수/매도 지시 오해를 차단한다.

구현: `packages/db-schema/src/migrations/001_app_research_foundation.ts`, `apps/api/src/backfill/phase11.ts`, `apps/api/src/backfill/run-phase11.ts`, `apps/api/test/phase11-alert-ledger.test.ts`. DDL은 ROLLBACK dry-run 후 백업(`/home/jigoo/.hermes/backups/stock-insight/research_app-phase11-preddl-20260707-131320.dump`, `sha256=b423ae37d6360b8a0351c80a2f148d2790ae964bc50f56c5b843d09bb681571c`)을 만들고 2회 적용해 idempotency를 확인했다.

| 항목 | apply/readback 결과 | 판단 |
|---|---:|---|
| alert sourceRows | 50 | `v_user_feed_dedup` 후보 중 stock-only gate 적용 |
| alertEvents | 3 | `US:NVDA`, `KR:005380`, `KR:005930` |
| filteredNonStock | 47 | crypto/비KRUS 후보 차단 |
| filteredActionAdvice | 0 | 매수·매도 시점/추천성 문구 누수 없음 |
| `user_notification_rules` | 1 | `stock_only=true`, enabled default rule |
| `user_alert_events` | 3 | stock_scoped 3 / non_stock_leaks 0 / action_advice_leaks 0 |
| `migration_runs` | Phase11 1건 | rowsRead 50 / rowsWritten 4 / rowsSkipped 47 |

완료 기준 충족. 알림은 “확인 필요” 원장이지 주문/타이밍 추천이 아니다.

### Phase 12 — decision journal/복기 기능은 데이터 축적 후 제한 도입

목표: 주문 기능 없이 사용자의 판단 근거를 “기록”으로 남기는 최소 journal을 도입한다. 실제 `user_trades`/`user_judgment_evaluations`가 0이므로 성과평가·잘했다/못했다 판정은 만들지 않는다.

구현: `public.user_decision_journal_entries`, `public.v_user_decision_journal`, `apps/api/src/backfill/phase12.ts`, `apps/api/src/backfill/run-phase12.ts`, `apps/api/test/phase12-decision-journal.test.ts`. DDL은 ROLLBACK dry-run 후 백업(`/home/jigoo/.hermes/backups/stock-insight/research_app-phase12-preddl-20260707-132001.dump`, `sha256=9c916a132eea526d8d95ec323a8fb7123a028eb236e3dd0077d8874c1ebbcfe2`)을 만들고 2회 적용했다.

| 항목 | apply/readback 결과 | 판단 |
|---|---:|---|
| journal sourceRows | 3 | Phase11 stock-only alert ledger만 입력 |
| `user_decision_journal_entries` | 3 | `alert_review` 기록 3건 생성 |
| stock_scoped | 3 / 3 | KR/US stock 범위만 기록 |
| advice_prohibited | 3 / 3 | DB CHECK로 true 고정 |
| action_advice_leaks | 0 | 매수·매도 시점/추천성 문구 누수 없음 |
| `v_user_decision_journal` | 3 | entity name/symbol join view 제공 |
| `migration_runs` | Phase12 1건 | rowsRead 3 / rowsWritten 3 / rowsSkipped 0 |

완료 기준 충족. Phase12는 “기록형 alert review”까지만 닫았고, 실제 거래성과 복기/평가는 데이터 축적 후 별도 단계로 남긴다.

## 8. 최종 실행 결과 요약

| Phase | 결과 | 남긴 제한 |
|---|---|---|
| Phase 8 | 상태 contract/UX 불변식 정렬 완료 | 없음 |
| Phase 9 | SEC EDGAR annual facts 5건 + financial-only detail anchor 완료 | OpenDART/FMP/API key 필요 collector 제외 |
| Phase 10 | analysis jobs 8, events 40, glossary 16 운영화 | 매수·매도 시점/추천 판단 제외 |
| Phase 11 | notification rule 1, alert events 3, 비주식 누수 0 | 알림은 확인 원장, 주문 지시 아님 |
| Phase 12 | journal entries 3, advice_prohibited 3/3 | 성과평가·잘했다/못했다 판정 제외 |

## 9. 최종 판단

Phase 8~12의 “데이터 준비도·상태값·공식 출처·학습 상태·알림 원장·기록형 journal”은 닫혔다. 남은 공백은 의도적 보류다: API key 필요한 KR/상업 collector, 실제 보유/거래 데이터 기반 성과평가, 매수·매도 시점 판단은 이번 범위에서 제외했다. 현재 앱은 빈칸을 억지로 채우지 않고, 출처 있는 데이터만 `available`로 승격하는 방향으로 정렬됐다.
