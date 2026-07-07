# Stock Insight × research_app DB 정합 설계안

작성일: 2026-07-06
범위: **로드맵/설계 전용** — Turborepo 구조, UI/API/DB 계약, 데이터 적재/운영, production UI/UX 품질 게이트 정리. 이 문서는 코드 구현을 포함하지 않는다.

## 0. v3 설계 원칙 — Turborepo + 실데이터 적재 + Production UI까지 함께 키운다

이번 설계의 핵심은 “현재 DB에 없는 UI는 지운다” 또는 “현재 UI에 없는 DB 기능은 숨긴다”가 아니다.
반대로 **Mock UI가 암시한 제품 요구**, **research_app DB가 이미 가진 실데이터 자산**, **현재 UI/UX가 production 수준까지 가기 위해 필요한 품질 부채**를 모두 보존·정리하고, 부족한 쪽을 additive하게 확장한다.

### 0.1 삭제 최소화 원칙

| 대상 | 원칙 | 실제 적용 |
|---|---|---|
| Mock UI | 화면/탭/카드의 제품 의도는 최대한 보존 | 기존 `오늘 브리핑/뉴스/종목 분석/테마 지도/포트폴리오/설정`은 유지하되, 내부 섹션을 실제 DB DTO에 맞게 확장 |
| Mock 고정 필드 | 삭제보다 `데이터 상태`를 붙인다 | `자본금/주주/연혁/매출구성`은 제거하지 않고 `company_profiles`, `company_financials` 후보로 승격. 데이터 없으면 “준비중/출처 수집중/text summary” 표시 |
| DB 기존 테이블 | 재사용 우선, 덮어쓰기 금지 | `publication_records`, `v_user_feed_dedup`, `watchlist.deep_cache`, `stock.candidates`를 API view로 감싸서 소비 |
| DB 부족 영역 | destructive 변경 금지, additive DDL | 신규 테이블/뷰는 `CREATE TABLE IF NOT EXISTS`, 기존 컬럼은 `ADD COLUMN IF NOT EXISTS`만 사용 |
| 기능 범위 | 주문 기능은 끝까지 제외 | 매수/매도 버튼·주문 API·브로커 주문권한은 만들지 않음. 판단/학습/복기만 제공 |

### 0.2 Co-evolution 방식

UI와 DB를 한쪽 기준으로 강제로 맞추지 않고, 아래 3단계로 같이 진화시킨다.

1. **Adapter 단계**
   기존 DB를 그대로 두고 read-only BFF/API가 UI DTO로 변환한다. Mock UI의 형태는 유지하고, 빈 필드는 `missing/text_only/stale` 상태로 표현한다.

2. **Additive DB 단계**
   Mock UI가 계속 필요로 하는 구조화 정보가 실제 제품 가치가 있으면 신규 DB 테이블을 더한다. 예: `company_profiles`, `company_financials`, `analysis_jobs`, `stock_learning_cards`.

3. **UI 확장 단계**
   DB가 이미 가진 강점이 UI에 없으면 탭/섹션을 추가한다. 예: 개인화 feed, 그래프 기반 간접 영향, 심층 분석 job 상태, 출처/품질 검증 패널.

### 0.3 데이터 상태를 UI의 1급 개념으로 둔다

주식 리서치 앱은 “모든 정보가 항상 구조화되어 있음”이 현실적이지 않다. 따라서 모든 주요 섹션은 값뿐 아니라 상태를 가진다.

```ts
type DataAvailability =
  | 'available'      // 구조화 데이터 있음
  | 'text_only'      // deep report/본문에는 있으나 테이블 구조화는 안 됨
  | 'stale'          // 있으나 오래됨
  | 'collecting'     // 분석/수집 작업 진행 중
  | 'missing'        // 아직 없음
  | 'unsupported';   // KR/US 주식 범위 밖
```

이 원칙 덕분에 UI 카드를 지우지 않고도 “현재는 없음/수집중/텍스트 기반”을 정직하게 보여줄 수 있다.

### 0.4 Turborepo 우선 원칙

이 프로젝트는 현재 `pnpm-workspace.yaml`이 있지만 `packages: ['.']`인 단일 패키지 앱이다. 앞으로는 단일 앱 안에 API, DB 계약, UI 컴포넌트, 데이터 적재 로직을 계속 누적하지 않고 **Turborepo 기반 apps/packages 구조**로 분리한다.

원칙:

1. **앱과 계약 분리**
   화면은 `apps/web`, API/BFF는 `apps/api`, Zod DTO·공통 타입은 `packages/contracts`, 브라우저/서버 공용 클라이언트는 `packages/api-client`로 분리한다.

2. **DB 스키마와 ETL 계약 분리**
   DB migration/뷰 정의는 `packages/db-schema` 또는 `apps/api/src/db` 하위에 두되, 기존 `research-app-db` 운영 DB를 함부로 복제하지 않는다. 앱 repo에는 API가 소비하는 contract/migration만 둔다.

3. **UI primitive 단일화**
   `packages/ui` 또는 `apps/web/src/shared/ui`를 design-system source of truth로 삼고, 버튼/input/card/badge/skeleton/toast/dialog를 화면별 CSS에서 임의 구현하지 않는다.

4. **Turbo pipeline으로 검증 순서 고정**
   `contracts → api-client/db-schema → api → web → e2e` 순서로 `typecheck/build/test/lint`가 돌아야 한다. clean checkout에서 빌드 순서가 깨지지 않게 `routeTree.gen.ts` 생성/커밋 정책을 명확히 둔다.

### 0.5 DB 변경은 “테이블 생성”이 아니라 “데이터가 채워지는 생애주기”까지 설계한다

`company_profiles` 같은 테이블을 만드는 것만으로는 제품이 좋아지지 않는다. 모든 신규 테이블은 아래 5가지를 같이 가진다.

| 항목 | 설계 기준 |
|---|---|
| 최초 백필 | 기존 `watchlist.deep_cache`, `publication_records`, `source_documents`, `stock.candidates`, 외부 공시/재무 수집기로 무엇을 먼저 채울지 명시 |
| 증분 갱신 | 어떤 cron/job/API action이 새 데이터를 만들고 갱신할지 명시 |
| 출처 보존 | `source_refs_json`, `source_url`, `record_sources`, `raw_json` 중 하나 이상으로 근거 추적 가능 |
| 품질 상태 | `available/text_only/stale/collecting/missing` 같은 상태가 UI까지 전달 |
| 검증 | row count, freshness, FK, 출처 없는 숫자 금지, idempotent rerun 검증 |

### 0.6 제품 정체성: “투자 행동”이 아니라 “근거 기반 개인 리서치 터미널”

Futur Insight의 정체성은 매수/매도 버튼이 없는 **개인화 리서치·학습·복기 터미널**이다.

- 주문·브로커 권한·API secret 저장은 제외한다.
- 사용자가 직접 넣은 관심/보유/메모를 기준으로 개인화한다.
- 모든 주장에는 출처·수집시각·품질상태를 붙인다.
- “왜 내 종목과 관련 있나?”를 그래프 경로로 설명한다.
- 초보/고급 모두를 위해 `쉬운 설명 → 근거 → 원문`으로 내려갈 수 있게 한다.
- 시스템 예측 품질과 사용자 판단 복기는 UI와 DB에서 명확히 분리한다.

### 0.7 Production UI/UX는 별도 phase가 아니라 로드맵의 필수 축이다

실데이터 연결 후 화면이 “돌아가는 것”과 production 수준은 다르다. 특히 input 안팎 border 중복, 로딩/빈상태/오류 흐름, focus/hover/active 불일치, 모바일 collapse, 긴 텍스트/한국어 줄바꿈, 접근성, 차트 bundle 크기까지 품질 게이트에 포함한다.

구현 원칙:

- composite input/search/composer는 **외부 container가 border를 소유**하고 내부 `input/textarea`는 `bare/unstyled` variant로 chrome을 제거한다.
- border를 CSS override로 지우지 말고, 애초에 chrome class를 붙이지 않는 구조로 만든다.
- 모든 primitive는 default/hover/focus/active/disabled/loading/error 상태를 가진다.
- 모든 화면은 loading/skeleton, empty, error, stale, collecting, permission-denied 상태를 가진다.
- Playwright + axe + visual smoke로 desktop/mobile/reduced-motion을 확인한다.

## 1. 현재 상태 요약

### 1.1 Repo 세팅

- 위치: `/home/jigoo/.hermes/workspace/stock-insight`
- 원격: `https://github.com/Jigoooo/stock-insight`
- 브랜치: `master`
- 현재 앱 성격: TanStack Start + React + Vite 기반의 **정적 mock UI**
- 검증:
  - `pnpm install --frozen-lockfile` 성공
  - `pnpm build` 성공
  - agent-owned dev server `127.0.0.1:6100`에서 화면 확인 완료

### 1.2 현재 UI 구조

현재 앱은 단일 라우트(`/`)에서 `DashboardPage`가 mock 데이터를 주입하고, `DashboardShell` 내부 state로 탭을 전환한다.

주요 파일:

- `apps/web/src/routes/index.tsx` — `/` 라우트
- `apps/web/src/pages/dashboard/ui/dashboard-page.tsx` — mock 데이터를 `DashboardShell`에 주입
- `apps/web/src/widgets/dashboard-shell/ui/dashboard-shell.tsx` — 전체 레이아웃/탭/검색/섹션 렌더링
- `apps/web/src/entities/stock/data/mock-stocks.ts` — 종목 mock
- `apps/web/src/entities/portfolio/data/mock-portfolio.ts` — 포트폴리오 mock
- `apps/web/src/entities/insight/data/mock-insights.ts` — 뉴스/인사이트 mock
- `apps/web/src/entities/theme/data/mock-themes.ts` — 테마 mock
- `apps/web/src/entities/stock/ui/stock-detail.tsx` — 개별 종목 상세 mock UI

현재 탭:

1. 오늘 브리핑
2. 뉴스
3. 종목 분석
4. 테마 지도
5. 포트폴리오
6. 설정

현재 종목 상세 UI는 “기업 개요/현재가/기초 재무/연혁/매출 구성/주주/확인 포인트/리스크/매수 당시 조건 복기”를 보여주지만, 대부분 DB에 구조화되어 있지 않은 mock 필드다.

### 1.3 현재 repo/UX debt 점검 결과

문서 v3 작성 시점에 확인한 구조적 debt:

| 영역 | 현재 상태 | production 로드맵 반영 |
|---|---|---|
| Workspace | `pnpm-workspace.yaml`은 `packages: ['.']`만 포함 | 실제 Turborepo `apps/*`, `packages/*`, `tooling/*`로 전환 필요 |
| Package boundary | root `package.json` 하나에 web/build/e2e/lint가 모두 있음 | `apps/web`, `apps/api`, `packages/contracts`, `packages/api-client`, `packages/ui`, `packages/db-schema` 분리 |
| UI primitives | 화면 CSS에 `.primaryButton`, `.secondaryButton`, `.search`, `.avatar`, `.card`가 직접 정의 | 공통 `Button/Input/Field/Card/Badge/Skeleton/Toast/Dialog` primitive 필요 |
| Input chrome | 현재 검색 input은 `.search` 외부 border + 내부 `input { border: 0 }`로 단일 border를 유지 중 | 향후 shared `Input`을 composite 안에 넣을 때 double border가 재발하지 않게 `bare/unstyled` variant 필수 |
| 상태 UI | mock 데이터 기준이라 loading/empty/error/stale/collecting 상태가 화면 모델에 거의 없음 | 모든 데이터 섹션에 `DataAvailability` + skeleton/empty/error state 추가 |
| 한국어 줄바꿈 | 일부 `overflow-wrap: anywhere` 사용 | 본문은 `word-break: keep-all`, URL/code/ticker는 `overflow-wrap: anywhere`로 분리 |
| React Compiler | `babel-plugin-react-compiler` 사용 중이나 일부 `useMemo/useCallback` 존재 | 새 코드에서는 수동 memo 기본 금지. 차트 option/라이브러리 instance처럼 필요한 곳만 유지 |
| Bundle | `recharts`와 `echarts`를 동시에 사용, build에서 500kB+ chunk warning 발생 | route/section lazy loading, chart adapter 통합, dynamic import 검토 |
| Accessibility | nav/search aria는 일부 존재하나 account/avatar, 상태/오류 flow는 mock 수준 | keyboard/focus/aria-live/toast/dialog/axe gate 필요 |

### 1.4 목표 Turborepo 구조

```text
stock-insight/
  apps/
    web/                 # TanStack Start/React UI
    api/                 # read-only BFF + later write APIs; server-only DB access
  packages/
    contracts/           # Zod DTO, API error envelope, DataAvailability, entity ids
    api-client/          # typed fetch/SSE client; browser+node dual target
    ui/                  # shared primitives + tokens bridge; no product data
    db-schema/           # app-facing additive migrations/views, not whole research DB clone
    config/              # tsconfig/eslint/oxlint shared config
  e2e/                   # Playwright flows against web+api
  docs/                  # roadmap/design/ADR
  turbo.json
  pnpm-workspace.yaml
```

경계:

- `apps/web`은 DB에 직접 접근하지 않는다.
- `apps/api`만 `DATABASE_URL`을 읽고, client bundle에는 secret이 들어가지 않는다.
- `packages/contracts`는 framework-free여야 한다.
- `packages/ui`는 투자 도메인 단어를 알면 안 된다. 도메인 UI는 `entities/features/widgets`에 둔다.
- `packages/db-schema`는 app이 필요한 additive DDL/view만 관리한다. 기존 `research-app-db`의 운영 파이프라인은 그대로 존중한다.

초기 turbo task:

```json
{
  "tasks": {
    "lint": { "dependsOn": ["^lint"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".output/**"] },
    "e2e": { "dependsOn": ["apps/api#build", "apps/web#build"] }
  }
}
```

## 2. 실제 research_app DB 구조 요약

접속 대상: `research_app` PostgreSQL, `127.0.0.1:55432`
주의: DB 암호/자격증명은 문서화하지 않는다.

### 2.1 웹앱에 바로 쓸 수 있는 핵심 public 계층

| 용도 | 테이블/뷰 | 비고 |
|---|---|---|
| 사용자 | `public.app_users` | 현재 `discord:*` external_ref 기반 사용자 1명 존재 |
| 수동 관심종목 | `public.user_watchlist` | 웹앱의 manual add 기준 테이블로 적합 |
| 수동 보유종목 | `public.user_positions` | 평균단가/수량/상태 보관 가능 |
| 수동 거래기록 | `public.user_trades` | 매수/매도 타이밍 복기용. 단, MVP에서는 보류 |
| 판단 평가 | `public.user_judgment_evaluations` | 현재 비어 있음. 향후 개인 판단력 평가용 |
| 발행 리서치 | `public.publication_records` | stock/crypto/macro 후보·브리핑·스냅샷 발행물 |
| 개인화 피드 인덱스 | `public.user_feed_index` | 관심종목과 리서치 record 연결 |
| 개인화 피드 뷰 | `public.v_user_feed_dedup`, `v_user_feed_by_entity`, `v_user_feed_items` | UI feed의 1차 소스 |
| 종목/테마/매크로 엔티티 | `public.entities` | `ticker`, `theme`, `macro`, `org` 등 |
| 그래프 관계 | `public.graph_edges`, `public.entity_reach_cache` | 간접 관련 뉴스/테마 추천 근거 |
| 출처 | `public.source_documents`, `public.record_sources` | 뉴스/자료 출처 표시용 |
| 원시 신호 | `public.market_signals` | 뉴스/정책/수급/심리/펀더멘털 신호 |

### 2.2 stock/watchlist 원천 계층

| 용도 | 테이블 | 비고 |
|---|---|---|
| 주목 종목 후보 | `stock.candidates` | ticker/name/thesis/buy_zone/fair_value/confidence/horizon 존재 |
| 가격/지수 스냅샷 | `stock.market_snapshots` | symbol/name/value/change_pct/currency 존재 |
| 주식 브리핑 | `stock.briefings` | 발행 단위 요약 |
| 매크로 지표 | `stock.macro_observations` | KR/US 매크로 데이터 |
| 소스 문서 | `stock.source_documents` | stock 원천 기사/문서 |
| 심층 리서치 캐시 | `watchlist.deep_cache` | ticker별 장문 report/durable_facts/sources |
| 예측 | `watchlist.predictions` | 방향/기준가/목표/무효화/근거 |
| 예측 평가 | `watchlist.prediction_evals` | 예측별 사후 평가 |
| 예측 품질 리뷰 | `watchlist.prediction_review` | 방향/시장/confidence별 승률·제안 |

### 2.3 현재 DB 샘플에서 확인한 사실

- 지원 가능한 ticker 엔티티가 이미 존재:
  - KR ticker 약 83개
  - US ticker 약 85개
- 개인 watchlist 예시:
  - `KR:005930` 삼성전자
  - `KR:005380` 현대차
  - `KR:452450` 피아이이
  - `US:NVDA` NVIDIA
  - `US:PLTR` Palantir
  - `US:TSLA` Tesla
  - `US:FIG` Figma
  - `US:BMNR` BitMine
- 개인화 피드 예시:
  - `direct`: watchlist 종목 직접 후보/뉴스
  - `related`: 그래프상 관련 후보 종목
  - `indirect`: 매크로/테마 관찰치
- 심층 리서치 캐시 예시:
  - `watchlist.deep_cache`에 NVDA/TSLA/PLTR/삼성전자/현대차/피아이이 등 장문 보고서 존재
- 판단 평가:
  - `public.user_judgment_evaluations`는 현재 비어 있음
  - 대신 `watchlist.prediction_review`에는 시스템 예측 품질 리뷰가 있음

### 2.4 Phase 1 read adapter 매핑 실측 결과

확인 방식(2026-07-06): `research_app` PostgreSQL 컨테이너에서 `BEGIN READ ONLY` 트랜잭션으로 schema/table/column/row count/freshness만 조회했다. DDL, INSERT, UPDATE, DELETE는 하지 않았다.

| API/화면 | 1차 원천 | 보조 원천 | 현재 실측 | Phase 1 판단 |
|---|---|---|---|---|
| `/api/stocks` list | `stock.candidates` | `stock.market_snapshots`, `public.user_watchlist`, `watchlist.deep_cache` | candidates 1,152 rows(KR/US), latest 2026-07-04; snapshots 14,191 rows, latest 2026-07-06; active watchlist 8 rows | **바로 구현 가능**. 최신 후보 + 최신 가격을 left join하고, 가격 없는 KR 개별종목은 `text_only/stale`로 반환 |
| `/api/stocks/:entityKey` detail | `stock.candidates`, `public.entities` | `watchlist.deep_cache`, `watchlist.predictions`, `public.v_user_feed_dedup` | deep_cache 8 rows, predictions 918 rows, feed 259 rows | **부분 구현 가능**. company profile/financial은 아직 구조화 부족이므로 report/thesis/risk/checkpoint 중심 |
| `/api/dashboard/today` | `stock.candidates`, `stock.market_snapshots`, `public.v_user_feed_dedup` | `public.user_watchlist`, `public.user_positions`, `watchlist.deep_cache` | dashboard live smoke 기준 stocks 8, insights 5, focusTheme watchlist | **구현 완료**. stock domain + KR/US 후보/스냅샷/관심종목만 read-only로 축약 매핑 |
| `/api/market-news` | `public.v_user_feed_dedup`, `public.publication_records` | `public.record_sources`, `public.source_documents`, `stock.source_documents` | publication_records 416 rows, stock.source_documents 3,732 rows | **구현 가능**. 개인화 feed와 전체 시장 뉴스는 query scope로 분리 필요 |
| `/api/discover/stocks` | `stock.candidates` | `public.entity_reach_cache`, `public.graph_edges` | candidate category/confidence/horizon 존재 | **구현 가능**. 관련성 설명은 2차에서 graph path DTO로 보강 |
| portfolio/holding | `public.user_positions` | `public.user_trades`, `public.user_watchlist` | positions 0 rows | **fallback 유지**. 보유종목 UI는 missing/collecting으로 표시, watchlist와 혼동 금지 |

필드 매핑 1차 기준:

| DTO 필드 | DB 컬럼 후보 | 상태 정책 |
|---|---|---|
| `entityKey` | `concat(market, ':', ticker)` 또는 `entities.entity_key` | market/ticker가 없으면 제외 |
| `market` | `stock.candidates.market`, `user_watchlist.market`, `entities.market` | `KR`/`US`만 기본 API에 노출 |
| `ticker` / `name` | `stock.candidates.ticker/name`, `entities.symbol/name` | candidate 우선, entity로 보강 |
| `price` / `changePct` | `stock.market_snapshots.value/change_pct` latest per `(region,symbol)` | 없으면 `availability: text_only` 또는 field null |
| `summary` | `stock.candidates.thesis`, `publication_records.summary_text` | 매수/매도 권유 표현으로 변환 금지 |
| `risk` / `checkpoint` | `stock.candidates.risks/check_indicators`, `watchlist.predictions.invalidation` | null 가능, UI는 수집중 표시 |
| `analysisStatus` | `watchlist.deep_cache.report` 존재 여부, `researched_at` | report length가 작으면 `text_only`, 없으면 `missing` |
| `isWatchlisted` | active `public.user_watchlist.entity_key` | user bootstrap 전까지 anonymous default user 선택 금지 |
| `sources` | `record_sources`, `source_documents`, candidate `source_urls` | Phase 1은 링크 수 제한, Phase 2에서 품질 badge 보강 |

주의:

- KR 개별 종목 가격은 현재 `stock.market_snapshots`에 시장 proxy 위주라 일부 비어 있다. 가격 필드가 없다고 후보 자체를 버리면 안 된다.
- `public.v_user_feed_dedup`에는 crypto domain도 섞여 있으므로 `domain='stock'` 필터가 필수다.
- `public.user_positions`는 현재 비어 있으므로 holdings scope는 빈 배열/fallback이 정상이다.
- `stock.candidates.created_at` 일부는 빈 문자열일 수 있어 adapter에서 안전한 timestamp parse가 필요하다.
- `watchlist.deep_cache`에는 report 길이가 55자 수준인 row도 있으므로 “존재=available”로 단정하지 않는다.

## 3. UI mock과 DB의 불일치

이 섹션은 v1처럼 “DB와 맞지 않는 mock 필드는 축소”가 아니라, **mock 의도 보존 + DB additive 확장** 기준으로 재정리한다.

### 3.1 Mock UI 필드 보존 매핑

| 현재 UI/mock 요구 | 기존 DB에서 바로 가능한 것 | DB additive 확장 | UI additive 확장 | 설계 판단 |
|---|---|---|---|---|
| 현재가/등락률 | `stock.market_snapshots.value/change_pct`, `watchlist.predictions.base_price` | `market_data.latest_quotes` view 또는 table | 가격 카드에 `asOf`, `source`, `stale` badge 추가 | 유지. 가격은 없을 때만 fallback 표시 |
| 기업 개요 | `entities.name/symbol/market`, `watchlist.deep_cache.report` 텍스트 | `company_profiles` | 개요 카드에 `structured/text_only/missing` 상태 표시 | 유지. mock 개요를 실제 profile 수집 목표로 승격 |
| 자본금/상장주식수/주주 | 현재 구조화 없음 | `company_capitalization`, 또는 `company_profiles.shareholders_json` | “자본·주주” 카드 보존, 출처/갱신일 필수 | 삭제하지 않음. MVP에서는 text summary/fallback |
| 재무제표 | 일부 deep report 텍스트, 후보 근거 | `company_financials`, `company_financial_metrics` | 연도/분기 토글, 주요 지표 표 | mock의 재무표는 제품 핵심이므로 DB 확장 대상으로 유지 |
| 매출 구성/사업부 | deep report 텍스트 가능 | `company_business_segments` 또는 JSON | 사업 구조 카드 유지 | 구조화 전까지 text_only |
| 연혁 | deep report 텍스트 가능 | `company_events` 또는 `company_profiles.history_json` | “중요 이벤트/연혁” 타임라인 | 투자 판단에 영향 있는 이벤트 중심으로 유지 |
| 긍정 요인 | `stock.candidates.thesis`, `watchlist.predictions.rationale`, `deep_cache.report` | 필요 시 `entity_research_factors` | “상승 근거” 섹션 확장 | 유지. 단, 매수 권유 표현 금지 |
| 리스크 | `stock.candidates.risks`, prediction invalidation | 필요 시 `entity_risk_factors` | 리스크 severity/source 표시 | 유지. check-point와 분리 |
| 체크포인트 | `stock.candidates.check_indicators`, `watchlist.predictions.invalidation` | `entity_checkpoints` | 확인 일정/조건 카드 | 유지. 사용자 학습에 중요 |
| 매수 당시 조건 복기 | `user_positions`, `user_trades`, `user_judgment_evaluations` 골격만 있음 | `user_decision_notes`, 평가 기준 view | “판단 복기”는 locked/준비중 상태 | 보류하되 UI 자리 보존 |
| 전체 시장 뉴스 | `publication_records`, `market_signals`, `source_documents`, `stock.briefings` | `v_market_news_feed` view | 뉴스 탭을 `내 종목 뉴스`와 `시장 전체 뉴스`로 분리 | UI 확장 필요 |
| 주목 종목 | `stock.candidates`, `v_user_feed_dedup.related`, `entity_reach_cache` | `v_discover_stocks` view | “주목 종목” 탭/섹션 추가 | UI 확장 필요 |
| 종목 분석 추가/대기 | 완료 캐시: `watchlist.deep_cache` | `analysis_jobs`, `analysis_job_events` | 분석 요청 버튼 + 진행상태/완료 알림 | DB/UI 둘 다 확장 필요 |
| 종목 공부/학습 | deep report 원문 | `stock_learning_cards`, `entity_glossary_terms` | “이 종목 공부하기” 모드 | 신규 핵심 기능으로 추가 |

### 3.2 DB가 이미 가진데 UI가 아직 못 쓰는 자산

| DB 자산 | 현재 UI 상태 | UI 확장 방향 |
|---|---|---|
| `v_user_feed_dedup`의 `direct/related/indirect` | 오늘 브리핑에 섞어 넣을 곳 부족 | “내 종목 직접 이슈 / 관련 종목 / 매크로 간접 영향” 3단으로 노출 |
| `entity_reach_cache`, `graph_edges` | 테마 지도 mock 수준 | 특정 종목 상세에서 “왜 이 뉴스가 관련 있나” 경로 설명 |
| `watchlist.deep_cache.report` | mock 상세와 분리되어 있음 | 종목 상세의 “심층 리포트” 탭으로 흡수 |
| `watchlist.predictions`, `prediction_review` | UI에 없음 | 시스템 전망 품질/신뢰도 badge로 사용. 사용자의 판단력 평가와 혼동 금지 |
| `publication_records` | UI feed 모델 없음 | 발행 리서치 카드의 canonical source |
| `record_sources/source_documents` | 출처 링크 UI 약함 | 모든 주장 카드에 출처/수집시각/품질 표시 |

### 3.3 결론

불일치를 “삭제 대상”으로 보지 않는다.
Mock UI가 가진 정적 회사정보 요구는 **DB 구조화 로드맵**으로 승격하고, DB가 가진 개인화/그래프/리서치 자산은 **UI 신규 섹션**으로 끌어올린다.

### 3.4 UI/DB 양쪽에 아직 없지만 제품 정체성상 추가해야 할 영역

“주식 정보가 많다”만으로는 Futur Insight의 정체성이 약하다. 아래 영역은 현재 mock UI와 DB 어디에도 충분히 표현되지 않지만, 근거 기반 개인 리서치 터미널이 되려면 로드맵에 포함해야 한다.

| 부족 영역 | 왜 필요한가 | UI 방향 | DB/API 방향 |
|---|---|---|---|
| 관련성 설명 | 사용자는 “왜 내 종목에 이 뉴스가 뜨는지” 알아야 신뢰한다 | 카드마다 `관련 이유` 접기/펼치기 | `entity_reach_cache`, `indirect_paths`, `graph_edges` 경로 DTO |
| 출처 품질 패널 | 금융 정보는 출처 없는 숫자가 가장 위험하다 | 모든 주장/숫자 옆 source/freshness/quality indicator | `source_documents`, `record_sources`, `quality_guard_results`, 신규 `source_quality_scores` 후보 |
| 쉬운 설명/공부 모드 | 초보 사용자는 raw report만으로 판단하기 어렵다 | `처음 읽는 사람용 설명`, `용어`, `질문 리스트` | `stock_learning_cards`, `entity_glossary_terms`, LLM 추출 결과 + 근거 refs |
| 시나리오/체크리스트 | “오르면/내리면/횡보하면 뭘 봐야 하는가”가 필요 | bull/base/bear scenario + 확인 조건 | `entity_scenarios`, `entity_checkpoints` 후보 또는 `stock_learning_cards` section 확장 |
| 데이터 신선도/수집 상태 | stale DB를 실시간처럼 보이면 제품 신뢰가 깨진다 | 섹션별 `최신/지연/수집중/없음` badge | `migration_runs`, `analysis_jobs`, `data_fitness` API |
| 사용자 메모/판단 근거 | 보유종목 복기는 사용자의 당시 생각이 있어야 가능 | 종목별 decision note, 태그, 근거 링크 | `user_decision_notes`, `user_note_sources` 후보 |
| 알림/변화 감지 | 사용자가 매일 들어오지 않아도 중요한 변화는 잡아야 한다 | watchlist 변화 알림, “어제와 달라진 것” | `change_events`, `user_notification_rules`, `user_alert_events` 후보 |
| 포트폴리오 노출 설명 | 단순 수익률보다 섹터/테마/매크로 노출이 중요 | `내 포트폴리오가 어디에 베팅되어 있나` | `user_positions` + graph aggregation view |
| 안전 문구/규제 경계 | 주문 없는 리서치 제품 정체성을 지켜야 한다 | 화면 고정 원칙: 조회 전용, 주문 없음, 권유 아님 | API response에도 `advisoryBoundary` meta 포함 |

우선순위는 `관련성 설명 → 출처/품질 → 공부 모드 → 데이터 신선도 → 사용자 메모` 순서가 좋다. 이 다섯 개가 있어야 단순 종목 대시보드가 아니라 “내 투자 판단을 훈련시키는 리서치 터미널”이 된다.

## 4. 제품 정보구조(IA) 제안

최종 제품 포지션: **매수/매도 주문을 제외하고, 주식 투자 판단에 필요한 모든 리서치 맥락을 제공하는 개인화 리서치 터미널**.

### 4.1 Today / 오늘 브리핑

목적: “내 관심·보유 종목 기준 오늘 봐야 할 것”을 한 화면에 압축.

구성:

- 내 watchlist/position 요약
- 오늘의 핵심 개인화 이슈
- KR/US 시장 전체 상태
- 내 종목 직접 뉴스
- 그래프상 관련 테마/매크로 뉴스
- 주의 신호/확인 일정

주 데이터:

- `public.v_user_feed_dedup`
- `public.user_watchlist`
- `public.user_positions`
- `public.publication_records`
- `public.market_signals`

### 4.2 My Stocks / 종목 분석

목적: 사용자가 수동 추가한 종목과 후보 종목을 같은 기준으로 분석.

하위 탭:

1. 개요
   - ticker, market, name, latest price, change, confidence
2. 투자 논리/전망
   - `stock.candidates.thesis`, `watchlist.predictions.rationale`, deep report 요약
3. 뉴스·시황
   - 직접 뉴스, 관련 테마/매크로 뉴스, source links
4. 재무·사업
   - 초기에는 deep_cache/report 기반 요약
   - 향후 정규화된 financial table 필요
5. 리스크/체크포인트
   - `stock.candidates.risks`, `check_indicators`, prediction invalidation
6. 분석 리포트
   - `watchlist.deep_cache.report`
   - 분석 중이면 job status 표시
7. 판단 복기
   - MVP에서는 보류/데이터 부족
   - 나중에 `user_trades` + `user_judgment_evaluations` 연결

추가 원칙:

- 기존 mock 상세의 “회사 백과사전” 성격은 버리지 않는다.
- 단, 화면 순서는 `투자 판단에 당장 필요한 정보 → 회사 이해 → 세부 원문/출처` 순서로 재배치한다.
- 매수/매도 직접 액션은 만들지 않고, 모든 CTA는 `관심종목 추가`, `보유종목 수동 입력`, `분석 요청`, `출처 보기`, `공부하기`로 제한한다.

### 4.3 Market News / 전체 시장 뉴스

목적: 개별 종목과 무관하게 한국/미국 주식시장 전체 흐름 확인.

필터:

- 시장: KR / US / GLOBAL
- 유형: macro, policy, source_document, market_snapshot, candidate, briefing
- 중요도: magnitude/confidence/relevance_score

주 데이터:

- `public.publication_records`
- `public.market_signals`
- `public.source_documents`
- `stock.macro_observations`
- `stock.briefings`

### 4.4 Discover / 주목해야 할 주식

현재 UI에는 별도 탭이 없지만 제품상 필요하다. 기존 “테마 지도”를 확장하거나 “주목 종목” 탭을 추가하는 것이 맞다.

구성:

- 오늘 후보 종목
- 내 watchlist와 그래프상 관련 높은 종목
- 시장별 KR/US 분리
- 왜 주목해야 하는지: thesis + top_reason + source count

주 데이터:

- `stock.candidates`
- `public.v_user_feed_dedup`의 `related` records
- `public.entity_reach_cache`
- `public.graph_edges`

추천 카드 필수 문구:

- “왜 주목?” — 후보 thesis 또는 주요 signal
- “내 종목과의 관계” — 직접/관련/간접 여부
- “검증 필요” — 리스크/체크포인트
- “출처” — source document 또는 publication record

추천 카드 금지 문구:

- “매수 추천”
- “지금 사야 함”
- “목표가 보장”
- “손절/익절 지시”

### 4.5 Portfolio / 보유 주식 전망

MVP는 사용자가 수동 입력한 보유 종목만 사용한다. API key/broker 연동은 후순위.

구성:

- 수동 보유종목 입력/수정
- 총 노출/시장별 노출/KR-US 비중
- 종목별 전망 요약
- 포트폴리오 리스크: 특정 테마/시장 쏠림, 관련 뉴스 수, 악재 신호
- “매수·매도 지시”가 아닌 “확인 포인트” 문구만 사용

주 데이터:

- `public.user_positions`
- `public.user_watchlist`
- `public.v_user_feed_dedup`
- `watchlist.predictions`

### 4.6 Settings / 연결·보안

현재는 수동 입력 중심.

- API key 연결: “나중에”
- 주문 기능 없음 고정
- key 원문 서버 저장 금지 원칙 표시
- 데이터 출처/갱신 시각 표시

### 4.7 Learn / 종목 공부 모드

목적: 사용자가 특정 종목을 “투자 전 공부”할 수 있게 만든다. 이는 단순 뉴스 목록이 아니라, 종목을 이해하기 위한 구조화 학습 화면이다.

진입점:

- 종목 상세의 `공부하기` 버튼
- 검색 결과에서 `분석 추가 + 공부 시작`
- 주목 종목 카드의 `왜 주목받는지 공부`

구성:

1. 회사가 무엇을 하는가
   - 사업모델, 주요 제품/서비스, 매출원
2. 왜 요즘 언급되는가
   - 최근 뉴스, 후보 thesis, 테마/매크로 연결
3. 무엇이 유망한가
   - 성장 동력, 경쟁력, 산업 트렌드
4. 무엇을 조심해야 하는가
   - 리스크, 무효화 조건, 체크포인트
5. 어떤 숫자를 봐야 하는가
   - 재무/가격/밸류에이션/수급 지표
6. 더 볼 출처
   - 뉴스, 공시, 리서치 발행물, deep report 원문

주 데이터:

- 1차: `watchlist.deep_cache.report`, `stock.candidates`, `market_signals`, `source_documents`
- 2차 확장: `stock_learning_cards`, `entity_glossary_terms`, `company_profiles`, `company_financials`

상태:

- `not_started`: 분석/학습 자료 없음
- `queued`: 사용자가 분석 추가 요청
- `running`: 수집/분석 중
- `available`: 학습 카드 생성 완료
- `stale`: 생성 후 일정 기간 초과
- `failed`: 분석 실패, 재시도 가능

### 4.8 Analyze / 장시간 종목 분석 작업

목적: 사용자가 새 종목을 추가했을 때 즉시 빈 화면을 보여주지 않고, “분석이 생성되는 과정”을 제품 경험으로 만든다.

흐름:

1. 사용자가 KR/US ticker 또는 회사명 입력
2. entity resolve
3. 이미 deep cache가 있으면 즉시 상세 제공
4. 없거나 오래됐으면 `analysis_jobs` 생성
5. UI는 `queued/running` 상태와 예상 산출물을 표시
6. 완료되면 deep report + learning cards + feed 연결

분석 작업 산출물:

- `deep_report`: 장문 분석 원문
- `learning_cards`: 공부 모드용 구조화 카드
- `risk_factors`: 리스크 목록
- `checkpoints`: 추적 조건
- `sources`: 출처 목록
- `profile/financials`: 가능한 경우 구조화 저장

주의:

- 이 작업은 나중에 외부 API/크롤러/LLM 분석 비용이 붙을 수 있으므로 job 상태/재시도/실패 사유를 반드시 DB에 남긴다.
- 사용자가 분석 요청을 눌렀다고 해서 주문/투자 판단을 대신 내려주는 표현은 금지한다.

## 5. API/BFF 계약 제안

브라우저에서 PostgreSQL에 직접 붙지 않고, TanStack Start/Nitro 서버 계층에 읽기 API를 둔다.

### 5.1 사용자/초기화

`GET /api/me/bootstrap`

반환:

```ts
type BootstrapResponse = {
  user: { id: string; displayName: string; externalRef?: string };
  supportedMarkets: ['KR', 'US'];
  featureFlags: {
    brokerApiConnection: false;
    tradeTimingEvaluation: false;
    manualWatchlist: true;
    manualPositions: true;
  };
};
```

### 5.2 오늘 브리핑

`GET /api/dashboard/today`

반환:

```ts
type DashboardBootstrap = {
  portfolio: {
    value: string;
    dailyChange: string;
    relatedIssueCount: number;
    focusTheme: string;
    scheduleCount: number;
    cautionLevel: '낮음' | '중간' | '높음';
    bars: number[];
    trend: Array<{ label: string; value: number }>;
    themeShare: Array<{ id: string; label: string; value: number; colorRole: string }>;
  };
  insights: DashboardInsight[];
  stocks: DashboardStock[];
  themes: DashboardTheme[];
};
```

Phase 1 구현은 기존 mock UI DTO를 보존하기 위해 `stock.candidates`, `stock.market_snapshots`, `public.v_user_feed_dedup(domain='stock')`, `public.user_watchlist`, `public.user_positions`, `watchlist.deep_cache`를 read-only로 읽어 위 DTO로 축약 매핑한다. 구조화되지 않은 회사 프로필/재무 필드는 허위 숫자 대신 `수집중` 텍스트로 닫는다.

### 5.3 종목 목록

`GET /api/stocks?userId=...&market=KR|US&scope=watchlist|holding|discover|all&q=...`

반환:

```ts
type StockListItem = {
  entityKey: string;        // KR:005930, US:NVDA
  ticker: string;
  market: 'KR' | 'US';
  name: string;
  displayName: string;
  isWatched: boolean;
  isHolding: boolean;
  latestPrice?: number;
  currency?: 'KRW' | 'USD';
  changePct?: number;
  primaryThesis?: string;
  confidence?: 'low' | 'medium' | 'high';
  latestPrediction?: PredictionSummary;
  analysisStatus: 'none' | 'cached' | 'queued' | 'running' | 'failed' | 'stale';
  lastAnalyzedAt?: string;
};
```

### 5.4 종목 상세

`GET /api/stocks/:entityKey?userId=...`

반환:

```ts
type StockDetailResponse = {
  stock: StockIdentity;
  latestSnapshot?: PriceSnapshot;
  thesis?: CandidateThesis;
  prediction?: PredictionSummary;
  deepReport?: {
    status: 'available' | 'missing' | 'stale' | 'failed';
    reportMarkdown?: string;
    durableFacts?: string[];
    researchedAt?: string;
    sources?: SourceLink[];
  };
  relatedNews: FeedItem[];
  marketSignals: SignalItem[];
  financials: {
    status: 'structured' | 'text_only' | 'missing';
    summary?: string;
    metrics?: FinancialMetric[];
  };
  risks: string[];
  checkpoints: string[];
};
```

### 5.5 수동 관심종목 추가

`POST /api/watchlist`

입력:

```ts
type AddWatchlistRequest = {
  userId: string;
  tickerOrName: string;
  market: 'KR' | 'US';
};
```

처리:

1. `entities`에서 `market + symbol` 또는 alias resolve
2. 없으면 `watchlist.pending_add`/resolver 후보로 넘김
3. `public.user_watchlist`에 active insert/upsert
4. 관련 `user_feed_index` rebuild 또는 refresh trigger
5. 분석 캐시가 없거나 오래됐으면 analysis job 생성 가능

### 5.6 종목 분석 작업

`POST /api/stocks/:entityKey/analysis-jobs`

반환:

```ts
type AnalysisJob = {
  id: string;
  entityKey: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  progressMessage?: string;
  resultCacheKey?: string;
};
```

초기 구현에서는 기존 `watchlist.deep_cache`를 완료 결과 캐시로 사용하되, 별도 job 상태 테이블이 필요하다.

### 5.7 시장 뉴스

`GET /api/market-news?market=KR|US|GLOBAL&type=macro|policy|news|briefing|all`

반환:

```ts
type MarketNewsItem = {
  id: string;
  market: 'KR' | 'US' | 'GLOBAL';
  title: string;
  summary?: string;
  sourceName?: string;
  url?: string;
  publishedAt?: string;
  affectedEntities: StockIdentity[];
  signalType?: string;
  polarity?: 'positive' | 'negative' | 'neutral';
  magnitude?: number;
};
```

### 5.8 주목 종목

`GET /api/discover/stocks?market=KR|US&userId=...&reason=all|watchlist_related|market_momentum|new_candidate`

반환:

```ts
type DiscoverStockItem = {
  entityKey: string;
  ticker: string;
  market: 'KR' | 'US';
  name: string;
  reasonType: 'direct' | 'related' | 'indirect' | 'market_candidate';
  reasonTitle: string;
  reasonSummary: string;
  confidence?: 'low' | 'medium' | 'high';
  relatedToMyStocks?: StockIdentity[];
  topRisks: string[];
  checkpoints: string[];
  sourceCount: number;
  sources: SourceLink[];
  canStartAnalysis: boolean;
  analysisStatus: 'none' | 'cached' | 'queued' | 'running' | 'failed';
};
```

데이터 소스:

- `stock.candidates`
- `public.entity_reach_cache`
- `public.user_watchlist`
- `watchlist.deep_cache`

### 5.9 종목 공부 모드

`GET /api/stocks/:entityKey/learning?userId=...`

반환:

```ts
type StockLearningResponse = {
  entityKey: string;
  status: DataAvailability;
  generatedAt?: string;
  sections: Array<{
    key:
      | 'business_model'
      | 'why_now'
      | 'growth_drivers'
      | 'risks'
      | 'numbers_to_watch'
      | 'sources';
    title: string;
    summary: string;
    bullets: string[];
    sourceRefs: string[];
  }>;
  glossary: Array<{ term: string; explanation: string; sourceRefs?: string[] }>;
  nextQuestions: string[];
};
```

초기 구현 전략:

- `stock_learning_cards`가 없으면 `watchlist.deep_cache.report`를 BFF에서 section화한다.
- 이후 분석 job이 완료되면 `stock_learning_cards`에 구조화 결과를 저장한다.

### 5.10 보유종목 전망

`GET /api/portfolio/outlook?userId=...`

반환:

```ts
type PortfolioOutlook = {
  generatedAt: string;
  positions: Array<{
    entityKey: string;
    ticker: string;
    market: 'KR' | 'US';
    quantity?: number;
    averageCost?: number;
    currency?: 'KRW' | 'USD';
    latestPrice?: number;
    unrealizedReturnPct?: number;
    outlookSummary: string;
    relevantNews: FeedItem[];
    risks: string[];
    checkpoints: string[];
  }>;
  concentrationRisks: Array<{ label: string; explanation: string }>;
  marketExposure: Array<{ market: 'KR' | 'US'; weightPct: number }>;
};
```

주의:

- 이 API는 매수/매도 판단을 반환하지 않는다.
- 표현은 “확인할 점/리스크/전망”으로 제한한다.

### 5.11 수동 보유종목 입력

`POST /api/positions`

입력:

```ts
type UpsertManualPositionRequest = {
  userId: string;
  entityKey: string;
  quantity?: number;
  averageCost?: number;
  currency?: 'KRW' | 'USD';
  note?: string;
};
```

처리:

1. KR/US ticker만 허용한다.
2. 주문·브로커 연결 없이 `user_positions`에 수동 입력값만 저장한다.
3. 저장 후 portfolio outlook refresh 대상에 포함한다.

## 6. DB 보강 필요사항

현재 DB로 MVP는 가능하지만, “주식의 모든 정보” 수준으로 가려면 아래 보강이 필요하다.

### 6.1 꼭 필요한 신규/보강 테이블

#### `analysis_jobs`

종목 분석 추가 후 오래 걸리는 작업의 상태 추적.

필드 예:

- `id`
- `user_id`
- `entity_key`
- `job_type` (`deep_research`, `refresh`, `financials`)
- `status`
- `requested_at`
- `started_at`
- `completed_at`
- `error_message`
- `result_ref`

#### `company_financials`

재무제표 구조화 저장. 현재 mock의 `sales`, `operatingProfit`, `debtRatio`, `roe` 같은 필드를 안정적으로 채우려면 필요.

필드 예:

- `entity_key`
- `fiscal_year`
- `fiscal_period`
- `revenue`
- `operating_income`
- `net_income`
- `assets`
- `liabilities`
- `equity`
- `roe`
- `debt_ratio`
- `source_url`
- `collected_at`

#### `company_profiles`

연혁/사업부/주주/본사/설립일 등 회사 개요 구조화.

필드 예:

- `entity_key`
- `founded`
- `headquarters`
- `business_segments_json`
- `shareholders_json`
- `history_json`
- `updated_at`

#### `analysis_job_events`

장시간 분석 작업의 진행 로그. UI가 “분석 중”을 믿을 수 있게 만드는 이벤트 스트림용 보조 테이블.

필드 예:

- `id`
- `job_id`
- `event_type` (`queued`, `started`, `progress`, `source_collected`, `completed`, `failed`)
- `message`
- `payload_json`
- `created_at`

#### `stock_learning_cards`

종목 공부 모드용 구조화 카드. deep report 원문을 그대로 보여주는 것을 넘어, 사용자가 종목을 이해할 수 있게 섹션화한다.

필드 예:

- `id`
- `entity_key`
- `section_key` (`business_model`, `why_now`, `growth_drivers`, `risks`, `numbers_to_watch`, `sources`)
- `title`
- `summary`
- `bullets_json`
- `source_refs_json`
- `generated_from` (`deep_cache`, `manual`, `analysis_job`)
- `generated_at`
- `valid_until`

#### `entity_glossary_terms`

종목/산업 공부 중 반복 등장하는 용어 설명.

필드 예:

- `id`
- `entity_key`
- `term`
- `explanation`
- `source_refs_json`
- `created_at`

#### `company_capitalization`

자본금/상장주식수/시가총액/주요 주주 등 mock UI가 이미 요구하는 자본·주주 카드의 구조화 저장소.

필드 예:

- `entity_key`
- `as_of_date`
- `market_cap`
- `shares_outstanding`
- `capital_stock`
- `major_shareholders_json`
- `source_url`
- `collected_at`

### 6.2 Additive DDL 스케치

실제 적용 전에는 별도 migration 파일과 백업/검증이 필요하다. 여기서는 설계 스케치만 둔다.

```sql
-- 기존 테이블 삭제/rename 없이 additive 생성만 한다.
CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id bigserial PRIMARY KEY,
  user_id bigint REFERENCES public.app_users(id),
  entity_key text NOT NULL REFERENCES public.entities(entity_key),
  job_type text NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  result_ref text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.analysis_job_events (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_profiles (
  entity_key text PRIMARY KEY REFERENCES public.entities(entity_key),
  founded text,
  headquarters text,
  business_segments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  shareholders_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  history_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_financials (
  entity_key text NOT NULL REFERENCES public.entities(entity_key),
  fiscal_year int NOT NULL,
  fiscal_period text NOT NULL,
  revenue numeric,
  operating_income numeric,
  net_income numeric,
  assets numeric,
  liabilities numeric,
  equity numeric,
  roe numeric,
  debt_ratio numeric,
  currency text,
  source_url text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_key, fiscal_year, fiscal_period)
);

CREATE TABLE IF NOT EXISTS public.stock_learning_cards (
  id bigserial PRIMARY KEY,
  entity_key text NOT NULL REFERENCES public.entities(entity_key),
  section_key text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  bullets_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_from text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  UNIQUE(entity_key, section_key, generated_from)
);
```

### 6.3 API용 view 후보

Raw table을 UI가 직접 조합하지 않게 하고, DB/API 경계에 view를 둔다.

| View | 목적 | 1차 소스 |
|---|---|---|
| `v_stock_app_entities` | KR/US 주식 entity만 노출 | `entities` |
| `v_stock_latest_snapshot` | 최신 가격/등락률 | `stock.market_snapshots`, `watchlist.predictions` fallback |
| `v_market_news_feed` | KR/US/GLOBAL 전체 시장 뉴스 | `publication_records`, `market_signals`, `source_documents` |
| `v_discover_stocks` | 주목 종목 후보 | `stock.candidates`, `entity_reach_cache`, `v_user_feed_dedup` |
| `v_stock_detail_base` | 종목 상세 기본 DTO | `entities`, latest snapshot, candidate, deep_cache |
| `v_stock_learning_status` | 공부 모드 상태 | `stock_learning_cards`, `watchlist.deep_cache`, `analysis_jobs` |
| `v_portfolio_outlook_base` | 보유종목 전망 기초 | `user_positions`, `v_user_feed_dedup`, `watchlist.predictions` |

### 6.4 기존 테이블 중 web canonical로 삼을 것

- 사용자/관심/보유: `public.app_users`, `public.user_watchlist`, `public.user_positions`
- 발행/피드: `public.publication_records`, `public.user_feed_index`, `public.v_user_feed_dedup`
- 종목 정체성: `public.entities`
- 심층 리포트 캐시: `watchlist.deep_cache`
- 예측/품질: `watchlist.predictions`, `watchlist.prediction_review`

`watchlist.watchlist`는 기존 chat_id 기반 레거시 계층으로 보고, 웹앱의 canonical write target으로 쓰지 않는 편이 안전하다.

### 6.5 신규/보강 DB의 데이터 적재 설계

신규 테이블은 “DDL 생성”과 동시에 “처음 어떻게 채우고, 이후 어떻게 갱신하고, 실패를 어떻게 표시할지”가 정해져야 한다.

#### 6.5.1 데이터 계층

```text
원천층
  stock/crypto/watchlist SQLite archive
  research_app public/stock/watchlist schemas
  external disclosures / company profile / financial APIs
  user manual inputs

정규화층
  entities
  source_documents
  publication_records
  record_sources
  market_signals
  graph_edges

보강층
  company_profiles
  company_financials
  company_capitalization
  stock_learning_cards
  entity_glossary_terms
  analysis_jobs / analysis_job_events

앱 소비층
  v_stock_detail_base
  v_stock_latest_snapshot
  v_market_news_feed
  v_discover_stocks
  v_stock_learning_status
  v_portfolio_outlook_base
```

#### 6.5.2 테이블별 채움 전략

| 대상 | 최초 백필 | 증분 갱신 | 실패/결측 UI |
|---|---|---|---|
| `analysis_jobs` | 백필 없음. 사용자 분석 요청부터 생성 | `POST /api/analysis-jobs`, worker, scheduled refresh | `collecting/failed/stale` badge + 이벤트 로그 |
| `analysis_job_events` | 백필 없음 | worker 단계별 append-only insert | “수집 중/출처 확인/요약 중/완료” timeline |
| `company_profiles` | `entities` 기본값 + `watchlist.deep_cache.report`에서 본사/설립/사업부/연혁 text extraction | DART/SEC/거래소/회사 IR 수집기, 분석 job 완료 시 upsert | structured 없으면 `text_only`, 출처 없으면 숫자 표시 금지 |
| `company_financials` | deep report 내 재무 숫자는 `text_only`로만 노출, 구조화 row는 신뢰 가능한 출처부터 | KR: DART 재무제표, US: SEC company facts/filing, 수집일 기준 upsert | 결측은 `null`, 0 대체 금지, currency/source 필수 |
| `company_capitalization` | `stock.market_snapshots`/deep report에서 시총 text fallback | KR/US quote/profile collector, 주요 주주/발행주식수 수집기 | stale badge, `as_of_date` 없는 값 표시 금지 |
| `stock_learning_cards` | `watchlist.deep_cache.report`, `publication_records`, `source_documents`를 section extractor로 변환 | analysis job 완료 시 재생성, `valid_until` 만료 시 refresh | `text_only` report fallback, 생성 실패 시 원문 리포트 노출 |
| `entity_glossary_terms` | deep report/market_signals에서 반복 용어 추출 | learning card 생성 pipeline에서 같이 upsert | 용어 없음은 빈 카드 대신 “아직 추출 전” |
| `entity_scenarios` 후보 | 초기에는 `stock_learning_cards` section으로 대체 | 분석 job v2에서 bull/base/bear 구조화 | 준비중 badge. 투자 조언 문구 금지 |
| `user_decision_notes` 후보 | 백필 없음. 사용자 입력부터 시작 | note CRUD, position/trade와 선택 연결 | 판단 복기 화면은 note 없으면 “기록 없음” |
| `source_quality_scores` 후보 | `quality_guard_results`, source domain, source_type 기반 초기 점수 | 품질 audit/validator 실행 시 갱신 | 낮은 품질은 경고, 숨기지는 않음 |

#### 6.5.3 기존 research_app 파이프라인과 연결

현재 확인된 운영 자산:

- 발행 동기화: `/home/jigoo/hermes-work/research-app-db/migrate/app_db/sync_daily_to_postgres.py`
- publication loader: `/home/jigoo/hermes-work/research-app-db/migrate/app_db/sync_publication.py`
- graph sync: `/home/jigoo/hermes-work/research-app-db/migrate/app_db/sync_graph_to_postgres.py`
- watchlist sync: `/home/jigoo/hermes-work/research-app-db/migrate/app_db/sync_watchlist_to_postgres.py`
- relation builders: `build_ownership_edges.py`, `build_industry_edges.py`, `build_news_comention_edges.py`, `build_common_owner_edges.py`, `build_etf_basket_edges.py`, `build_flow_pressure_signals.py`
- audit: `audit/daily_data_fitness.py`, `audit/link_completeness_validator.py`
- schema init: `/home/jigoo/hermes-work/research-app-db/db/init/*.sql`

로드맵 원칙:

1. Stock Insight 앱 repo가 기존 발행 DB를 직접 장악하지 않는다.
2. 기존 sync/graph/audit 파이프라인은 `research-app-db`에 남기고, Stock Insight는 app-facing view/contract만 소비한다.
3. 신규 app 테이블이 `research_app` DB에 추가될 경우에도 migration은 백업 + dry-run + idempotent 검증 후 적용한다.
4. 데이터 적재는 `migration_runs` 또는 신규 `app_data_jobs`에 실행 결과를 남긴다.
5. UI는 run success 여부를 믿지 않고 실제 table freshness/API freshness를 표시한다.

#### 6.5.4 백필 순서

1. **읽기 전용 view 먼저**
   `v_stock_app_entities`, `v_stock_latest_snapshot`, `v_market_news_feed`, `v_discover_stocks`, `v_stock_detail_base`를 기존 테이블만으로 만든다.

2. **deep_cache 기반 text fallback 연결**
   `watchlist.deep_cache`를 종목 상세/공부 모드의 원문 fallback으로 연결한다. 이 단계에서는 새 숫자를 만들지 않는다.

3. **learning card 백필**
   deep report를 section화하되, 모든 bullet에 source ref를 붙인다. 출처 없는 LLM 생성문은 product copy에 쓰지 않는다.

4. **company profile/financial 구조화 백필**
   KR/US 각각 신뢰 가능한 공시/재무 소스가 있는 종목부터 채운다. `source_refs_json` 없는 row는 API에서 `available`로 내보내지 않는다.

5. **analysis job 연결**
   사용자가 종목 추가/갱신을 누르면 job 생성 → worker → deep_cache/learning/profile/financial upsert → UI freshness 갱신으로 이어진다.

6. **사용자 메모/복기 데이터 시작**
   수동 position/trade/note가 쌓인 뒤에만 판단력 평가를 설계한다. 데이터 없는 상태에서 “잘 샀다/못 샀다”를 만들지 않는다.

#### 6.5.5 데이터 품질 게이트

| 게이트 | 기준 |
|---|---|
| Idempotency | 같은 백필/동기화를 2회 실행해도 row 폭증 없음 |
| Freshness | feed/detail/news/financial/profile별 `max(updated_at/collected_at)` 측정 |
| Source completeness | 숫자·재무·주주 정보는 source 없는 경우 `available` 금지 |
| FK integrity | `entity_key`, `record_id`, `source_key` 고아 0 |
| Market scope | 기본 화면에는 KR/US stock만. crypto/realestate는 명시 필터 전 노출 금지 |
| Korean/JSON fidelity | 한글 텍스트와 JSON payload round-trip 검증 |
| Advisory safety | 매수/매도 지시형 문구 quality gate |

## 7. 화면 개편 방향

### 7.1 현재 종목 상세 화면 문제

- 정보량은 보기 좋지만 mock 고정 필드가 많아 DB와 맞지 않는다.
- 상세 화면이 “회사 백과사전”처럼 정적이고, 실제 강점인 개인화 feed/리서치/출처/분석작업 상태가 드러나지 않는다.
- `매수 당시 조건 복기`는 현재 데이터가 없어서 바로 구현하면 허위/빈 UI가 된다.

### 7.2 권장 종목 상세 구조

```
[종목 헤더]
  이름 / ticker / market / watch/holding badge / latest price / analysis status

[핵심 판단 요약]
  - 현재 전망 요약
  - confidence/horizon
  - 상승 근거 / 리스크 / 무효화 조건

[뉴스·시황]
  - 직접 뉴스
  - 관련 테마·매크로 뉴스
  - 출처 링크

[심층 리포트]
  - deep_cache report markdown
  - durable facts
  - last researched at
  - refresh/add analysis 버튼

[재무·사업]
  - 구조화 데이터 있으면 표
  - 없으면 report 기반 text summary
  - 출처/미제공 명확히 표시

[보유 맥락]
  - manual position
  - 수익률/노출
  - 확인 포인트
  - 매수·매도 판단력 평가는 준비중
```

### 7.3 Production UI/UX Hardening 로드맵

현재 mock shell은 방향성이 좋지만 production 수준으로 가려면 화면별 CSS를 계속 늘리는 방식이 아니라, 공통 primitive와 상태 모델을 먼저 잠가야 한다.

#### 7.3.1 공통 컴포넌트 inventory

| Primitive | 필수 상태/variant | 사용처 |
|---|---|---|
| `Button` | primary, secondary, ghost, destructive, disabled, loading, icon-leading/trailing | CTA, tab action, form submit |
| `IconButton` | default, selected, disabled, tooltip, aria-label mandatory | 알림, 계정, 카드 action |
| `Input` | default, error, disabled, loading, `bare/unstyled` | 검색, 종목 resolve, form field |
| `Textarea` | default, auto-grow, maxRows, `bare/unstyled` | 사용자 메모/판단 근거 |
| `Field` | label, help, error, required, describedby | 모든 form |
| `Card/Panel` | default, interactive, selected, stale, warning | briefing/feed/detail |
| `Badge/Status` | availability, market, confidence, freshness, advisoryBoundary | 데이터 상태 표현 |
| `Skeleton` | delayed 300ms, lines/card/table/message | 로딩 플래시 방지 |
| `EmptyState` | title, body, CTA, illustration 없음/최소 | 데이터 없음 |
| `ErrorState` | recover action, retry, technical details 접기 | API 실패 |
| `Toast` | success/info/warning/error, aria-live | 저장/실패/복사 |
| `Dialog/Sheet` | 최소 사용, focus trap, Esc, close affordance | 삭제 확인, 상세 설정 |
| `DataQualityPopover` | source, updatedAt, quality flags | 출처/품질 설명 |

#### 7.3.2 Single-border input invariant

input/textarea double border 재발 방지 규칙:

```text
Composite surface owns border:
  SearchBox / Composer / FieldShell / InlineEditor

Inner control is bare:
  <Input variant="bare" /> or <Textarea variant="bare" />

Forbidden:
  outer .box border + inner .cwInput border
  CSS import order로 inner border를 나중에 덮어쓰기
```

검증:

- 모든 composite input 스크린샷에서 border가 한 겹인지 확인
- focus ring은 outer surface에만 표시
- error ring도 outer surface에만 표시하고, inner control에는 background/border/padding chrome 없음

#### 7.3.3 Form/검색 UX

- 빈 required field는 blur만으로 에러를 띄우지 않는다. submit 후 또는 dirty+format error일 때만 표시한다.
- submit 실패 시 첫 invalid field로 focus 이동.
- 종목 검색은 ticker/name/theme 초성·띄어쓰기 무시 검색을 고려하되, 서버/클라이언트 matcher를 하나로 공유한다.
- 검색 결과가 많으면 단일 right panel 또는 dedicated result surface를 둔다. dropdown + panel 중복 노출 금지.
- manual position 입력은 주문처럼 보이지 않게 `수동 보유 정보 기록` 문구를 쓴다.

#### 7.3.4 상태 UX

모든 데이터 섹션은 아래 상태를 가져야 한다.

| 상태 | UI 표현 |
|---|---|
| loading | 300ms delayed skeleton |
| empty | 왜 비었는지 + 다음 행동 1개 |
| error | 사용자 언어 오류 + retry + 기술상세 접기 |
| stale | 마지막 갱신시각 + 갱신 요청 가능 여부 |
| collecting | job 단계 + 취소/백그라운드 안내 |
| text_only | 구조화 전, 원문 리포트 기반임을 표시 |
| unsupported | KR/US stock 범위 밖 |

#### 7.3.5 Typography/responsive/accessibility

- 한국어 본문: `word-break: keep-all; overflow-wrap: break-word`.
- ticker/URL/code/source key: `overflow-wrap: anywhere`.
- 모바일에서는 좌측 nav → bottom tab 또는 drawer, detail/list는 master-detail collapse.
- chart/table은 모바일에서 축약 summary + drilldown으로 전환.
- 모든 interactive element는 `button/a/input` semantic element 사용.
- icon-only button은 `aria-label` 필수.
- 상태 변화 toast는 `aria-live`를 가진다.
- 색상만으로 positive/risk를 구분하지 않는다.

#### 7.3.6 Motion/performance

- React Compiler가 있으므로 수동 `useMemo/useCallback`은 기본 금지. chart option/imperative instance처럼 필요한 경우만 유지한다.
- `echarts`와 `recharts`를 동시에 전역 chunk에 싣지 않는다. 섹션 lazy import 또는 chart adapter 통합 검토.
- hover/focus/active motion은 120-180ms, transform/opacity 중심.
- `prefers-reduced-motion`에서는 reveal/stagger/press animation을 제거한다.
- theme switch가 생기면 전환 중 `html[data-theme-switching] * { transition: none !important; }`로 flicker 방지.

#### 7.3.7 UI QA gate

구현 phase마다 아래를 통과해야 production 후보로 본다.

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test:e2e
git diff --check
```

추가 browser QA:

- desktop 1440px, tablet, mobile 390px
- light/dark 또는 dark-only contrast
- reduced motion
- keyboard-only tab order
- 검색 → 결과 선택 → 종목 상세
- 빈 데이터/stale/error/collecting 상태
- input double border 없음
- long Korean text/URL overflow 없음
- axe critical violation 0

## 8. 구현 순서 제안 — Turborepo + 데이터 적재 + Production UX까지 포함

진행 결정(2026-07-07 KST): 사용자는 Phase 6을 제외하고 Phase 2.5, 3, 3.5, 4, 5, 7을 모두 완료하는 방향을 승인했다. 각 phase는 문서 문구를 그대로 맹목 실행하지 않고, 현재 코드/DB를 먼저 probe한 뒤 더 나은 경로가 확인되면 계획과 판단을 즉시 수정해 반영한다.

### Phase 0 — 현재 완료

- repo pull/clone
- dependency install
- production build 검증
- UI mock 구조 확인
- DB schema/sample 확인
- 본 설계 문서 v1 작성
- v2 원칙 추가: **Mock UI와 DB를 서로 삭제하지 않고 함께 확장**
- v3 원칙 추가: **Turborepo 구조, 데이터 적재 생애주기, production UI/UX hardening까지 로드맵에 포함**

### Phase 0.5 — Turborepo foundation 전환

목표: 단일 패키지 앱을 실제 `apps/*` + `packages/*` 기반 Turborepo로 전환하고, 이후 API/DB/UI 작업이 서로 엉키지 않게 한다.

진행 상태(2026-07-06): **완료**

- root `package.json`은 `stock-insight-workspace` orchestrator로 전환했고 `turbo`/`packageManager`를 명시했다.
- 기존 TanStack Start 앱은 `apps/web`으로 이동했으며, `@/*` alias와 Playwright webServer command를 새 위치 기준으로 보정했다.
- `packages/contracts`, `packages/api-client`, `packages/ui`, `packages/db-schema`, `apps/api`의 최소 buildable skeleton을 생성했다.
- `packages/ui`는 금융/투자 도메인 지식을 포함하지 않는 순수 primitive helper만 보유하도록 시작했다.
- `packages/db-schema`는 운영 research DB 복제가 아니라 app-facing additive migration contract만 보유하도록 시작했다.
- 검증 완료: `pnpm install`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`, `git diff --check`, secret pattern scan.

작업:

1. root `package.json`을 workspace orchestrator로 축소하고 `turbo` 추가
2. `pnpm-workspace.yaml`을 `apps/*`, `packages/*`, `tooling/*`로 확장
3. 현재 TanStack Start 앱을 `apps/web`으로 이동
4. `packages/contracts` 생성: `DataAvailability`, stock identity, API envelope, error envelope
5. `packages/api-client` 생성: typed fetch client, browser `fetch` this-binding 안전 처리
6. `packages/ui` 또는 `apps/web/src/shared/ui` foundation 생성: Button/Input/Field/Card/Skeleton 등
7. `apps/api` 생성: health/readiness, env validation, server-only DB client skeleton
8. build pipeline: `contracts → api-client → api → web → e2e`

검증:

- clean checkout 기준 `pnpm install` 후 `pnpm build` 성공
- `pnpm turbo run typecheck lint build` 성공
- client bundle에 `DATABASE_URL`/secret 문자열이 포함되지 않음
- 기존 UI가 이동 후에도 동일하게 렌더링
- `routeTree.gen.ts` 생성/커밋 정책 확정

### Phase 1 — Adapter 우선: Mock UI 보존형 Read-only BFF

목표: 현재 UI를 크게 깨지 않고, DB 실데이터를 UI DTO로 변환할 수 있는 adapter 계층을 만든다.

진행 상태(2026-07-06): **Phase 1 read-only BFF tranche 완료 — dashboard/stocks/me/news/discover HTTP route + `/api/dashboard/today`, `/api/stocks` list, `/api/stocks/:entityKey` detail, `/api/me/bootstrap`, `/api/market-news`, `/api/discover/stocks` PostgreSQL read-only adapter 완료**

- `packages/contracts`에 `DataAvailability`, API envelope/error envelope, stock identity, dashboard DTO/Zod schema를 추가했다.
- `apps/api/src/dashboard/read-model.ts`에 read-only dashboard PostgreSQL adapter와 DB 미연결 fallback envelope를 추가했다. DDL/DB write/운영 DB 변경은 하지 않았다.
- `apps/api/src/server/*`에 server-only env validation과 PostgreSQL `pg` 기반 read-only DB client를 추가했다. 실제 쿼리는 매 호출 `BEGIN READ ONLY` 후 `ROLLBACK`으로 닫히며, `DATABASE_URL` 미설정 시 기존 fallback을 유지한다.
- TanStack Start/Nitro route handler로 `GET /api/health`, `GET /api/dashboard/today`를 추가했다. `/api/dashboard/today`는 `DATABASE_URL`이 있으면 PostgreSQL read-only adapter를 사용하고, 미설정/실패/빈 데이터는 contract-valid fallback/error envelope로 닫힌다.
- `packages/contracts`에 stock list/detail DTO, KR/US market filter, watchlist/holding/discover/all scope, analysis status, detail missing envelope, me bootstrap DTO, market news DTO를 추가했다.
- TanStack Start/Nitro route handler로 `GET /api/stocks`, `GET /api/stocks/:entityKey`를 추가했다. 두 route 모두 `DATABASE_URL`이 있으면 PostgreSQL read-only adapter를 사용하고, 미설정/실패/미존재 entity는 기존 fallback/error envelope로 닫힌다.
- `apps/api/test/read-model.test.ts`에 Node 내장 `node:test` 기반 unit test를 추가해 dashboard/stocks/me/market-news/discover read-model의 empty fallback, missing detail, database success, read failure가 모두 contract-valid envelope로 닫히는지 고정했다.
- `packages/api-client`에 `/api/health`, `/api/dashboard/today`, `/api/me/bootstrap`, `/api/market-news`, `/api/discover/stocks`, `/api/stocks`, `/api/stocks/:entityKey` typed fetch method를 추가하고, 응답은 contract schema로 parse하게 했다.
- `apps/web/scripts/smoke-dashboard-api.mjs`에 live HTTP smoke를 추가해 production build artifact에서 api-client가 health/dashboard/me/news/discover/stocks/detail route 응답을 parse하는지 확인한다.
- `apps/web`은 기존 mock UI를 유지하되 `DashboardPage` 앞단에서 `dashboardBootstrapSchema.parse(...)`를 통과시키도록 compile/runtime boundary를 연결했다.
- `research_app` PostgreSQL을 `BEGIN READ ONLY`로 실측해 Phase 1 read adapter 매핑을 확정했다. `/api/stocks` list는 `stock.candidates`, `stock.market_snapshots`, `public.user_watchlist`, `public.user_positions`, `watchlist.deep_cache`를 조인해 KR/US 종목 목록 DTO로 변환한다.
- live smoke 결과: DB 연결 production artifact에서 `/api/stocks?market=KR&scope=all&q=삼성`은 `source: database`, `availability: available`, `count: 7`, 첫 row `KR:005930`을 반환했다. 직접 `watchlist/q=삼성` probe는 `count: 1`, 첫 row `KR:005930`, KR 가격 sparse row 보존을 확인했다.
- `/api/stocks/:entityKey` detail은 `stock.candidates`, `stock.market_snapshots`, `public.user_watchlist`, `public.user_positions`, `watchlist.deep_cache`, `public.v_user_feed_dedup(domain='stock')`를 read-only 조인해 stock/detail DTO로 변환한다. `KR:005930` production artifact live smoke는 `source: database`, `availability: available`, `deepReportStatus: available`, `relatedNewsCount: 3`, 직접 probe 기준 report 7,743 chars / risks 3 / checkpoints 3 / news 3을 반환했다.
- `/api/me/bootstrap`은 `public.user_watchlist`, `public.user_positions`, 보조 `stock.candidates`를 read-only로 읽어 사용자 bootstrap DTO로 변환한다. production artifact live smoke는 `source: database`, `availability: available`, `watchlistCount: 8`, `positionCount: 0`, 직접 probe 기준 첫 watchlist `KR:005380`, `defaultMarket: KR`을 반환했다.
- `/api/market-news`는 `public.v_user_feed_dedup(domain='stock')`를 read-only로 읽어 시장 뉴스 DTO로 변환한다. `market=KR&type=all` production artifact live smoke는 `source: database`, `availability: available`, `count: 16`, 첫 row `feed:582`, `firstMarket: KR`을 반환했고, KR 필터 밖 row 누수가 없음을 확인했다.
- `/api/discover/stocks`는 `stock.candidates`를 1차 원천으로, `public.entity_reach_cache` + `public.user_watchlist`를 관심종목 관련성 보조 원천으로 read-only 조인해 주목 종목 DTO로 변환한다. `market=KR&reason=all` production artifact live smoke는 `source: database`, `availability: available`, `count: 27`, 첫 row `KR:000660`, `firstReason: related`를 반환했다. 추가 probe에서 `KR/all` 27개, `KR/watchlist_related` 8개, `KR/new_candidate` 7개, `US/all` 33개, `US/market_momentum` 30개를 반환했고, 각 market 필터 밖 row 누수가 없음을 확인했다.
- `/api/dashboard/today`는 `stock.candidates`, `stock.market_snapshots`, `public.v_user_feed_dedup(domain='stock')`, `public.user_watchlist`, `public.user_positions`, `watchlist.deep_cache`를 read-only로 읽어 기존 dashboard mock UI DTO로 축약 매핑한다. latest production artifact live smoke는 `source: database`, `availability: available`, `stockCount: 8`, `insightCount: 5`, `focusTheme: watchlist`를 반환했다.
- 검증 완료: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, production artifact live smoke(`SMOKE_BASE_URL=http://127.0.0.1:6123 pnpm --filter @stock-insight/web smoke:api`), secret pattern scan.

남은 Phase 1 범위:

- 없음. 다음 concrete step은 Phase 2의 UI data loader 전환이다.

작업:

1. [v] server-only env/DB boundary skeleton 추가
2. [v] 공통 DTO/Zod schema 정의
3. [v] `DataAvailability` 상태 모델 도입
4. [v] `/api/health`, `/api/dashboard/today` fallback route 구현
5. [v] `/api/stocks`, `/api/stocks/:entityKey` fallback route 구현
6. [v] PostgreSQL read-only schema/table/column/freshness audit와 adapter 매핑 작성
7. [v] `/api/stocks` list 실제 DB read adapter 구현
8. [v] `/api/stocks/:entityKey` detail 실제 DB read adapter 구현
9. [v] `/api/me/bootstrap` read-only 구현
10. [v] `GET /api/market-news` read-only 구현
11. [v] `GET /api/discover/stocks` read-only 구현
12. [v] `GET /api/dashboard/today` PostgreSQL read-only 구현
13. [v] KR/US stock contract/query filter 추가
14. [v] DB 연결 실패/빈 데이터 fallback 정책 unit test 고정

검증:

- [v] DB 연결 없이 fallback HTTP route가 contract-valid envelope를 반환하는지 live smoke로 확인
- [v] production artifact live smoke가 `/api/me/bootstrap`, `/api/market-news`, `/api/stocks`, `/api/stocks/:entityKey` fallback/database envelope를 api-client로 parse하는지 확인
- [v] secret이 client bundle/source scan에 포함되지 않는지 확인
- [v] API read-model unit test: empty fallback / database success / read failure error envelope
- [v] PostgreSQL audit는 `BEGIN READ ONLY`로 수행했고 운영 DB write/DDL 없음
- [v] DB 연결 production artifact live smoke: `/api/stocks`가 실제 PostgreSQL에서 database/available row를 반환하는지 확인
- [v] no-write audit: live smoke 전후 `stock.candidates`, `stock.market_snapshots`, `public.user_watchlist`, `public.user_positions`, `public.v_user_feed_dedup(domain='stock')`, `watchlist.deep_cache` row count 동일
- [v] API HTTP/integration smoke: `/api/stocks/:entityKey` detail 실제 DB adapter가 `KR:005930`을 database/available envelope로 반환하고, 존재하지 않는 `KR:000000`은 `STOCK_NOT_FOUND` missing envelope로 닫히는지 확인
- [v] API HTTP/integration smoke: `/api/me/bootstrap` 실제 DB adapter가 active watchlist 8개와 open positions 0개를 database/available envelope로 반환하는지 확인
- [v] API HTTP/integration smoke: `/api/market-news?market=KR&type=all` 실제 DB adapter가 stock-domain KR 뉴스 16개를 database/available envelope로 반환하고 crypto/realestate/US row 누수가 없는지 확인
- [v] API HTTP/integration smoke: `/api/discover/stocks?market=KR&reason=all` 실제 DB adapter가 주목 종목 27개를 database/available envelope로 반환하는지 확인
- [v] API HTTP/integration smoke: `/api/discover/stocks` KR/US/reason filter probe에서 market 밖 row 누수가 없는지 확인
- [v] no-write audit: discover live smoke/probe 전후 `public.user_positions`, `public.user_watchlist`, `public.entity_reach_cache`, `public.graph_edges`, `stock.candidates`, `watchlist.deep_cache` row count 동일
- [v] API HTTP/integration smoke: `/api/dashboard/today` 실제 DB adapter가 dashboard bootstrap을 `source: database`, `availability: available`, `stockCount: 8`, `insightCount: 5`, `focusTheme: watchlist`로 반환하는지 확인
- [v] no-write audit: dashboard live smoke 전후 `public.user_positions`, `public.user_watchlist`, `public.entity_reach_cache`, `public.graph_edges`, `stock.candidates`, `stock.market_snapshots`, `watchlist.deep_cache` row count 동일
- [v] KR/US 외 crypto/realestate가 기본 화면에 새지 않는지 detail/discover 구현 시 재확인

### Phase 2 — UI 데이터 주입 전환: 제거보다 상태표시

목표: mock props를 server loader/API data로 교체하되, 기존 카드/섹션은 삭제하지 않고 데이터 상태를 표시한다.

진행 상태(2026-07-07 KST): **완료 — today bootstrap + market news + stocks + portfolio dedicated loader/status UI 주입 완료**

- `apps/web/src/routes/index.tsx`에 `/` route loader를 추가해 `/api/dashboard/today` typed client 응답을 `DashboardPage`로 전달한다.
- `DashboardPage`는 `DashboardResponse`가 `source: database`, `availability: available`일 때 DB bootstrap을 우선 사용하고, loader 실패/collecting/fallback envelope일 때 기존 local mock bootstrap을 fallback으로 유지한다.
- client hydration 이후에도 fallback 상태면 `/api/dashboard/today`를 1회 재시도해, SSR 상대 fetch 제약이나 일시 실패가 있어도 화면은 비지 않고 database/available로 승격될 수 있게 했다.
- `DashboardShell`은 `data-source`/`data-availability` dataset을 노출해 실제 화면이 mock/fallback인지 database인지 브라우저 smoke로 검증 가능하게 했다.
- `apps/web/test/dashboard-bootstrap-resolver.test.ts`에 database 우선/collecting fallback/loader failure fallback resolver unit test를 추가했다.
- latest production artifact smoke 결과: `/api/dashboard/today`는 `source: database`, `availability: available`, `stockCount: 8`, `insightCount: 5`, `focusTheme: watchlist`를 반환했고, 브라우저 hydration 후 `[data-testid="dashboard-shell"]`은 `data-source="database"`, `data-availability="available"`, 종목 탭은 DB 기반 stock card 8개를 표시했다.
- `/` route loader는 `/api/market-news`도 병렬로 읽고, `DashboardPage`는 `MarketNewsResponse`가 `source: database`, `availability: available`일 때 시장 뉴스 feed를 우선 사용한다. loader 실패/collecting/fallback일 때는 dashboard insight 기반 fallback을 유지한다.
- `DashboardShell` 뉴스 탭은 `내 종목 뉴스`와 `시장 전체 뉴스` scope 버튼으로 분리했고, `data-news-source`/`data-news-availability`와 `market-news-status` badge를 노출한다.
- `apps/web/test/market-news-resolver.test.ts`에 database market-news 매핑/collecting fallback/loader failure fallback resolver unit test를 추가했다.
- latest production artifact smoke 결과: `/api/market-news?type=all`은 `source: database`, `availability: available`, `count: 100`, 첫 row `feed:589`를 반환했고, 브라우저 뉴스 탭은 `시장 뉴스 DB · 사용 가능` 상태와 `내 종목 뉴스`/`시장 전체 뉴스` 전환을 표시했다. console error 0.
- `/` route loader는 `/api/stocks`도 병렬로 읽고, `DashboardPage`는 `StockListResponse`가 `source: database`, `availability: available`일 때 dashboard bootstrap의 축약 stocks 대신 dedicated stock list를 우선 사용한다. loader 실패/collecting/fallback이면 기존 local/mock 화면을 유지한다.
- `apps/web/src/pages/dashboard/model/resolve-stocks.ts`를 추가해 dedicated stock list/detail response를 dashboard stock UI 모델로 변환한다. DB에 없는 회사 프로필/재무/연혁/주주 구조 필드는 허위 숫자로 채우지 않고 `구조화 수집중`/`출처 수집중`/`가격 수집중`/`등락률 수집중`으로 표시한다.
- `StockDetail`은 선택된 `entityKey` 기준으로 `/api/stocks/:entityKey`를 로드해 심층 리포트, 출처 링크, 분석 상태, 관련 뉴스, 공부하기 진입점을 표시한다. 상세 API가 없거나 missing/fallback이면 기존 화면 보존용 mock/fallback 상세를 유지한다.
- `apps/web/test/stocks-resolver.test.ts`에 database stock list 우선/collecting fallback/detail database success/detail missing fallback resolver unit test를 추가했다. RED 단계에서 `resolve-stocks.ts` 미존재로 실패를 확인한 뒤 구현했다.
- latest production artifact smoke 결과: `/api/stocks?market=KR&scope=all&q=삼성`은 `source: database`, `availability: available`, `count: 7`, 첫 row `KR:005930`을 반환했고, `/api/stocks/KR%3A005930`은 `source: database`, `availability: available`, `deepReportStatus: available`, `relatedNewsCount: 3`을 반환했다.
- latest browser smoke 결과: hydrated dashboard shell은 `data-source="database"`, `data-availability="available"`, 종목 탭은 dedicated stock list `60개 · 전용 종목 API`를 표시했다. `삼성전자` 검색 시 DB stock card 2개로 필터링되고, 상세 영역은 `전용 API`, `심층 리포트`, `공부 카드 준비중`을 표시했다. console error 0.
- `/` route loader는 `/api/me/bootstrap`도 병렬로 읽고, `DashboardPage`는 `MeBootstrapResponse`가 `source: database`, `availability: available`일 때 portfolio card를 dedicated user bootstrap 기반으로 재계산한다. loader 실패/collecting/fallback이면 기존 dashboard/local portfolio fallback을 유지한다.
- `apps/web/src/pages/dashboard/model/resolve-portfolio.ts`를 추가해 관심종목/보유종목 수, KR/US 시장 분포, 가격·수량 입력 완성도, 조회 전용 상태를 `PortfolioSnapshot`으로 변환한다. 보유 가격/수량이 없으면 허위 평가금액을 만들지 않고 `보유 입력 없음`/`가격·수량 확인` 상태로 표현한다.
- `DashboardShell`과 포트폴리오 탭은 `data-portfolio-source`/`data-portfolio-availability`와 `portfolio-status` badge를 노출해 브라우저 smoke에서 포트폴리오가 mock인지 database인지 검증 가능하게 했다. 공통 `조회 전용 목업` 헤더 문구도 live DB 화면과 충돌하지 않도록 `조회 전용`으로 정리했다.
- latest production artifact smoke 결과: `/api/me/bootstrap`은 `source: database`, `availability: available`, `watchlistCount: 8`, `positionCount: 0`, `defaultMarket: KR`를 반환했다. `/api/stocks?scope=watchlist`는 database/available, `/api/stocks?scope=holding`은 보유 입력이 없어 collecting/fallback 0건을 반환했다.
- latest browser smoke 결과: 포트폴리오 탭은 `포트폴리오 DB · 사용 가능`, `보유종목 0개 · 관심 8개`, `보유 입력 없음 · 관심 8개`, `관련 이슈 8건`, KR/US 시장 구분 차트를 표시했다. `data-portfolio-source="database"`, `data-portfolio-availability="available"`, console error 0, 포트폴리오 화면 내 `목업` 문구 0건을 확인했다.

작업:

1. [v] `DashboardPage`에서 mock import를 직접 화면 데이터로 쓰는 구조를 adapter 호출로 전환 — today bootstrap 1차 완료, local mock은 fallback으로만 유지
2. [v] today/stocks/news/portfolio data loader 추가 — today bootstrap + news + stocks + portfolio dedicated loader 완료
3. [v] mock 필드가 DB에 없으면 해당 카드 제거가 아니라 `text_only/missing/collecting` 상태 표시 — Phase 2 slice별 적용 완료, 공통 status primitive 통합은 Phase 2.5로 이관
4. [v] 뉴스 탭을 `내 종목 뉴스`와 `시장 전체 뉴스`로 분리
5. [v] 종목 상세에 `심층 리포트`, `출처`, `분석 상태`, `공부하기` 진입점 추가
6. [v] “조회 전용/주문 기능 없음”을 명확히 유지

검증:

- [v] `pnpm format:check`
- [v] `pnpm lint`
- [v] `pnpm typecheck`
- [v] `pnpm build`
- [v] `pnpm test`
- [v] `pnpm test:e2e`
- [v] production artifact HTTP smoke: `/api/dashboard/today` database/available
- [v] browser smoke: hydrated dashboard shell dataset `database/available`, stock tab card 8개, console error 0
- [v] production artifact HTTP smoke: `/api/market-news?type=all` database/available, count 100
- [v] browser smoke: news tab dataset `database/available`, personal/market scope 전환, console error 0
- [v] resolver unit test: dedicated stock list database 우선, collecting fallback, detail database success, missing fallback
- [v] production artifact HTTP smoke: `/api/stocks?market=KR&scope=all&q=삼성` database/available, count 7, first `KR:005930`
- [v] production artifact HTTP smoke: `/api/stocks/:entityKey` `KR:005930` database/available, `deepReportStatus: available`, `relatedNewsCount: 3`; missing `KR:000000`은 `STOCK_NOT_FOUND`
- [v] browser smoke: stock tab dedicated list `60개 · 전용 종목 API`, `삼성전자` 검색 결과 2개, detail `전용 API`/`심층 리포트`/`공부 카드 준비중`, console error 0
- [v] resolver unit test: dedicated portfolio database 우선, collecting fallback
- [v] production artifact HTTP smoke: `/api/me/bootstrap` database/available, `watchlistCount: 8`, `positionCount: 0`, `defaultMarket: KR`
- [v] browser smoke: portfolio tab `포트폴리오 DB · 사용 가능`, `보유종목 0개 · 관심 8개`, `data-portfolio-source="database"`, `data-portfolio-availability="available"`, console error 0, `목업` 문구 0건

주의:

- React Compiler가 활성화되어 있으므로 새 코드에 불필요한 `useMemo/useCallback`을 추가하지 않는다.
- UI가 비는 경우도 “아직 수집 안 됨/분석 필요”로 보여주고, 허위 데이터를 만들지 않는다.

### Phase 2.5 — Production UI/UX hardening pass `[완료]`

목표: 실데이터 연결 전에 공통 컴포넌트와 상태 UX를 잠가서, 이후 기능 추가 때 UI debt가 재발하지 않게 한다.

작업:

[x] 1. shared `Button/IconButton/Input/Textarea/Field/Card/Badge/Skeleton/EmptyState/ErrorState/Toast/Dialog` 1차 foundation 정의
[x] 2. `Input`/`Textarea`에 `bare` variant 추가해 double border 재발 차단
[x] 3. 기존 `.primaryButton`, `.secondaryButton`, `.search`, empty/status 사용처를 primitive로 점진 교체
[x] 4. Korean typography rule 적용: 본문 keep-all, URL/ticker/source anywhere
[x] 5. loading/empty/error/stale/collecting/text_only 상태 컴포넌트 추가
[x] 6. chart section lazy import 적용: `echarts`/`recharts`를 dashboard shell 즉시 import에서 분리
[x] 7. Playwright에 desktop/mobile/reduced-motion/accessibility + shared hardening smoke 추가

검증:

- [v] input/search/composite surface border 한 겹: `SearchField` + `TextInput variant="bare"`
- [v] keyboard-only navigation 가능: 기존 desktop/mobile Playwright nav + focus smoke 유지
- [v] axe critical violation 0: `expectNoAccessibilityViolations` desktop/mobile/reduced-motion 통과
- [v] long Korean/URL overflow 없음: Playwright computed style `keep-all`/`anywhere` 검증
- [v] skeleton이 300ms 미만 instant loading에서 깜빡이지 않음: `shouldShowDelayedFeedback` unit test 통과
- [v] build chunk warning 개선: client `routes` chunk `1,064.91kB -> 142.47kB`, chart는 lazy chunk로 격리

완료 증거:

- [v] TDD RED: `test/ui-primitives.test.ts`가 `src/shared/ui/primitives/status.ts` 미존재로 실패
- [v] TDD GREEN: `node --test test/*.test.ts` web 15개 통과, api 24개 통과
- [v] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` 통과
- [v] `pnpm build` 통과. 남은 Vite chunk warning은 초기 route가 아니라 lazy `theme-flow-chart`(`564.65kB`, gzip `190.89kB`)에 격리됨. Phase 4/7에서 차트가 늘어날 때 ECharts 대체 SVG/Canvas adapter 여부를 재평가한다.

### Phase 3 — Additive DB 보강 1차: 분석 job + 공부 카드 `[완료]`

목표: 사용자가 종목을 추가했을 때 장시간 분석/공부 모드가 실제 제품 흐름으로 작동할 기반을 만든다.

DB 후보:

1. `analysis_jobs`
2. `analysis_job_events`
3. `stock_learning_cards`
4. `entity_glossary_terms`
5. `v_stock_learning_status`

작업:

[x] 1. DDL은 별도 migration 파일로 작성: `packages/db-schema/src/migrations/001_app_research_foundation.ts`
[x] 2. 적용 전 `pg_dump -Fc` 백업: `research_app_pre_phase3_20260706T164930Z.dump`
[x] 3. `CREATE TABLE IF NOT EXISTS` 중심 additive DDL
[x] 4. 기존 테이블 drop/rename/update 금지
[x] 5. 기존 deep_cache를 완료 결과 캐시로 연결: 종목 상세 API가 `watchlist.deep_cache`와 Phase 3 테이블을 함께 매핑
[x] 6. 분석 job은 실제 외부 수집기 연결 전에도 queued/running/completed 상태만 먼저 표현 가능하게 설계
[x] 7. contracts/API/web 상세 UI에 `analysisJob`, `learningCards`, `glossaryTerms` 필드 연결

검증:

- [v] FK가 `entities(entity_key)`와 깨지지 않는지 확인: live PostgreSQL dry-run + 실제 적용 후 FK/view 검증 통과
- [v] job 생성/이벤트 append가 멱등 또는 중복 방지되는지 확인: migration SQL 2회 연속 적용 통과
- [v] analysis가 실패해도 기존 feed/종목 상세가 깨지지 않는지 확인: API fallback/read-model 단위 테스트 통과
- [v] 임시 smoke marker 정리: `__phase3_smoke_20260706T165156Z__`, `__phase3_http_smoke_20260706T165821Z__` 모두 `analysis_jobs/stock_learning_cards/entity_glossary_terms` 0건 확인
- [v] HTTP smoke: `GET /api/stocks/KR%3A005930`가 `source=database`, `analysisJob.status=running`, `progressPct=37.5`, learning card/glossary term 반환 확인
- [v] Browser smoke: 종목 분석 → 삼성전자 상세에서 “분석 진행 중 · 38%”, “HTTP smoke 학습 카드”, “HTTP smoke” 용어 DOM 렌더링 확인. 카드/용어 rect가 상세 viewport 내부에 있고 겹침 없음 확인
- [v] 최종 품질 게이트: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` 통과
- [v] E2E: `pnpm test:e2e` 6 passed, 2 skipped 통과

### Phase 3.5 — 데이터 적재/백필 파이프라인 `[완료]`

목표: Phase 3/4의 신규 테이블이 빈 껍데기로 남지 않도록, 기존 research_app 자산과 외부 수집기를 통해 실제 데이터를 채운다.

작업:

[x] 1. `v_stock_detail_base`/`v_stock_learning_status`가 기존 테이블만으로 fallback 가능한지 먼저 구현: Phase 3 read-model이 기존 `stock.candidates`/`watchlist.deep_cache`/feed + 신규 learning table을 함께 읽음
[x] 2. `watchlist.deep_cache` → `stock_learning_cards` section 백필: `apps/api/src/backfill/phase35.ts`
[x] 3. `publication_records`/`source_documents` → learning/source refs 연결: `record_sources` + `source_documents` URL aggregate를 publication source로 병합
[x] 4. `company_profiles`는 deep_cache text extraction으로 `text_only` seed 생성: 8개 profile seed 적재
[x] 5. `company_financials`는 KR/US 출처별 collector 전까지 source/currency 없는 row를 `available`로 노출하지 않음: `financial_available_missing_source_or_currency=0` audit gate 확인
[x] 6. `migration_runs`에 백필 결과 기록: `job_name=stock-insight-phase35-backfill`, 최신 run `rows_read=8`, `rows_written=16`, `rows_skipped=4`
[x] 7. 데이터 품질 audit: freshness, FK, source completeness, advisory safety

검증:

- [v] 백필 2회 실행 시 row count 폭증 없음: `stock_learning_cards 8 -> 8`, `company_profiles 8 -> 8`, migration run만 실행 이력으로 증가
- [v] source 없는 숫자/재무 row가 API에서 `available`로 나오지 않음: `company_financials` available + source/currency 누락 0건
- [v] deep_cache가 없는 종목도 화면이 깨지지 않고 `missing/collecting`으로 표시: 기존 fallback/read-model 정책 유지, 신규 백필은 deep_cache eligible 8건만 upsert
- [v] `stock_learning_cards`의 모든 bullet/source ref가 추적 가능: URL source 4건은 `available`, URL 없는 4건은 `text_only`로 강등해 허위 source 생성 금지
- [v] 한글/JSON payload round-trip 통과: `KR:005930` read-model에서 learning card 1건, sources 3개, bullets 6개 반환 확인
- [v] FK audit 통과: `card_fk_orphans=0`, `profile_fk_orphans=0`
- [v] 실행 명령 등록/검증: `pnpm --filter @stock-insight/api backfill:phase35` dry-run 정상, `backfill:phase35:apply` runner apply 경로 정상

### Phase 4 — Additive DB 보강 2차: 회사정보/재무 구조화 `[완료]`

목표: mock UI가 이미 암시한 회사 백과사전 정보를 실제 DB 구조로 흡수한다.

DB 후보:

1. `company_profiles`
2. `company_financials`
3. `company_capitalization`
4. `v_stock_detail_base`
5. `v_stock_latest_snapshot`

작업:

1. [x] deep report에서 text summary fallback 유지: `company_profiles`는 Phase 3.5 deep_cache seed를 `text_only` 회사 개요로 상세 API에 노출
2. [x] 구조화 데이터가 있는 종목부터 점진적으로 표시: `companyMetrics` DTO와 `StockDetail` 회사 구조화 데이터 블록 추가
3. [x] KR/US 데이터 출처 차이를 `source_refs_json`으로 보존: Phase 4 market snapshot metric group은 `Yahoo Finance` source ref 포함
4. [x] 재무제표는 단일 currency 가정 금지: `company_financials.currency`가 있는 metric group만 통화값으로 표시
5. [x] 결측값은 0으로 채우지 않고 null + availability로 표시: 출처/통화 없는 row는 API/UI에서 `available` 지표로 노출하지 않음
6. [x] 백필 planner/runner 추가: `apps/api/src/backfill/phase4.ts`, `apps/api/src/backfill/run-phase4.ts`, `backfill:phase4`, `backfill:phase4:apply`
7. [x] 기존 `stock.market_snapshots` 최신 source-backed row를 `company_financials(metric_group='market_snapshot')`로 멱등 upsert
8. [x] web 표시 helper 추가: `format-company-metrics.ts`가 source/currency gate와 currency/percent/score/shares 포맷을 담당

검증:

- [v] mock의 재무/주주/연혁 카드가 삭제되지 않고 상태 기반으로 살아 있음: 상세 상단 기존 `설립/본사/자본금/발행주식/시가총액/매출/영업이익/ROE` 카드는 `수집중` 상태로 유지
- [v] 출처 없는 숫자가 UI에 표시되지 않음: DB audit `missing_source_or_currency=0`, API DTO `unsourcedAvailableMetricGroups=0`, web helper test로 source/currency gate 고정
- [v] stale/갱신일 badge 경로 확인: company profile은 `capturedAt` 기반 갱신일, market snapshot은 `reportedAt` 기반 `2026.07.07 · Yahoo Finance` source summary 표시
- [v] Phase 4 DB 적용: `company_financials.metric_group='market_snapshot'` 20건 적재, 동일 upsert 2회 실행 후 row count 20 유지
- [v] DB audit: `total=20`, `missing_source_or_currency=0`, `bad_ranges=0`, `migration_runs rows_read=48 rows_written=20 rows_skipped=28`
- [v] API unit/type gate: `pnpm --filter @stock-insight/api typecheck`, `pnpm --filter @stock-insight/api test` 통과
- [v] Web unit/type/build gate: `pnpm --filter @stock-insight/web test` 17/17, `typecheck`, `build` 통과
- [v] HTTP DB smoke: `GET /api/stocks/US:NVDA`가 `source=database`, `availability=available`, `companyMetricsCount=1`, `firstMetricSource=Yahoo Finance`, labels `현재가/등락률/20일 이동평균/50일 이동평균/RSI(14)/거래량` 반환
- [v] Browser smoke: NVDA 상세 DOM에 `회사 구조화 데이터`, `출처 기반 시장지표`, `Yahoo Finance`, `RSI(14)` 렌더링. 상세 viewport hit-test에서 회사 데이터 블록 rect `top=92 bottom=298`, 내부 hit 대상 `회사 구조화 데이터`/`$202.35`, console error 0

### Phase 5 — 수동 관심종목/보유종목 입력 — 완료

목표: API key 없이 사용자가 직접 관심종목과 보유종목을 넣고, 그 종목 기준으로 전망/뉴스/리스크를 본다.

작업:

1. [v] KR/US 명시 ticker 입력 UI
2. [v] `POST /api/watchlist`
3. [v] `DELETE /api/watchlist/:entityKey` → DB 물리 삭제가 아닌 `active=false` soft remove
4. [v] `POST /api/positions`
5. [v] `DELETE /api/positions/:entityKey` → DB 물리 삭제가 아닌 `status='closed'` close
6. [v] `user_positions` 기반 portfolio summary refresh
7. [v] 관심종목/보유종목 변경 후 refresh 전략: mutation 응답으로 최신 `MeBootstrapResponse`를 반환하고, 클라이언트는 즉시 me-bootstrap 상태와 stock list를 갱신한다. 별도 주문/브로커/feed write는 수행하지 않는다.

검증:

- [v] KR/US ticker만 허용: API unit test에서 KR 6자리/US equity symbol만 통과
- [v] 동일 사용자 중복 관심종목 방지: `ON CONFLICT (user_id, entity_key)` upsert로 중복 row 방지
- [v] 주문·브로커 연결 코드 없음: manual write model/API/UI 모두 order/broker/API key 필드 없이 `user_watchlist`, `user_positions`만 사용
- [v] 보유종목 close/remove는 사용자 입력 원장만 바꾸고 `entities`, `stock.*`, `watchlist.*` 원천 데이터는 미수정
- [v] 테스트 게이트: `@stock-insight/api` manual/API tests 42/42, `@stock-insight/api-client` 2/2, `@stock-insight/web` 17/17, api/api-client/web typecheck 통과
- [v] build gate: `pnpm --filter @stock-insight/web build` 통과
- [v] HTTP live smoke: agent-owned 서버 `6110`에서 `POST /api/watchlist`, `POST /api/positions`, `DELETE /api/watchlist/US%3AZZXQ`, `DELETE /api/positions/US%3AZZXQ` 모두 `200`, `availability=available`, mutation 직후 watchlist/positions 반영 확인. smoke rows cleanup 후 `watchlist=0`, `positions=0` 확인
- [v] Browser smoke: 포트폴리오 탭에서 관심 8→9, 보유 0→1, 관련 이슈 8→10 즉시 갱신, 입력폼 자동 초기화, console error 0. smoke rows cleanup 후 DB 잔여 0

### Phase 6 — 판단력 평가/매수매도 타이밍 복기

현재 보류. 나중에 사용자가 명시적으로 원할 때 진행.

필요 데이터:

- `user_trades`
- `user_positions`
- `user_decision_notes`
- `user_judgment_evaluations`
- 기준가격/기간/벤치마크 정의

표현 정책:

- “잘했다/못했다”보다 “당시 근거 대비 결과와 빠진 확인점” 중심
- 주문 권유 금지
- 사용자의 판단 복기와 시스템의 `prediction_review`를 UI에서 명확히 분리

### Phase 7 — Alerts/changes/portfolio exposure — 완료

목표: 단순 조회 앱을 넘어서 “내 종목에 달라진 것”과 “내 포트폴리오가 노출된 리스크”를 알려주는 개인 리서치 터미널로 확장한다.

진행 상태(2026-07-07 KST): **완료 — `GET /api/portfolio/digest` + portfolio tab 변화 알림/노출/신선도 UI + SSR database loader 정합성 완료**

- `packages/contracts`에 `PortfolioDigest` DTO/Zod schema를 추가했다. 변화 알림, 노출, 데이터 신선도, 통계(`nonStockFilteredCount`)가 contract-valid envelope로 닫힌다.
- `apps/api/src/portfolio/read-model.ts`에 PostgreSQL read-only digest adapter를 추가했다. `change_events`가 없거나 stock 변화가 비어 있으면 `public.v_user_feed_dedup(domain='stock')` 기반 개인화 피드로 fallback해 “현재 달라진 점/확인 필요 항목”을 만든다.
- 노출 집계는 `public.user_watchlist`/`public.user_positions`의 KR/US 종목과 `public.entity_reach_cache` 그래프 테마를 묶되, 표시 비중 합계가 100이 되도록 정규화한다.
- 신선도는 `change_events`, `public.v_user_feed_dedup`, `public.source_documents`의 최신성을 분리해서 표시하며, 아직 수집 기록이 없는 경우 “아직 수집 기록이 없습니다”로 정직하게 닫는다.
- `GET /api/portfolio/digest` route와 `api-client.portfolioDigest()`를 추가했고, `/` route loader와 client hydration refresh, 수동 관심/보유 mutation 후 digest refresh를 연결했다.
- 포트폴리오 탭에는 “변화 알림·노출·신선도” 섹션을 추가했다. 변화 알림, 포트폴리오 노출, 데이터 신선도 3개 카드가 `Digest DB · 사용 가능` 상태로 표시된다.
- SSR loader에서 Node relative `fetch('/api/...')`가 실패해 initial response가 `void 0`으로 떨어지던 문제를 공통 `createDashboardApiClient` helper로 수정했다. browser/client fetch는 상대 URL을 유지하고, SSR에서만 `HOST`/`PORT` 또는 `STOCK_INSIGHT_API_BASE_URL` 기반 absolute URL을 사용한다.
- 포트폴리오 요약 차트의 반올림 표시가 `KR 38% + US 63% = 101%`로 보이던 수치 신뢰도 문제를 수정해 표시 합계가 정확히 100이 되도록 했다.

작업:

1. [v] `change_events` 기반 “어제와 달라진 것” API — `change_events` read 경로 + stock feed fallback으로 구현
2. [v] watchlist/position별 변화 알림 규칙 — active watchlist/open positions 기준으로 KR/US stock alert만 노출
3. [v] portfolio exposure graph: 보유 종목 → theme/macro/industry 경로 집계 — market + graph theme exposure DTO로 구현
4. [v] source quality/data freshness alert — change/feed/source freshness 카드로 구현
5. [v] notification center 또는 digest feed — portfolio tab digest 섹션으로 1차 구현

검증:

- [v] 알림은 매수/매도 지시가 아니라 변화/확인 필요 항목만 표현: UI 문구 “매수·매도 지시가 아니라…”와 alert reason/title/summary만 표시
- [v] 동일 이벤트 중복 알림 방지: API unit test에서 row id 기반 digest alert mapping 고정, fallback feed는 distinct row 기반 제한
- [v] 사용자가 관심 없는 crypto/realestate 이벤트가 KR/US stock 기본 feed에 새지 않음: live HTTP smoke `nonStockAlertCount=0`, `nonStockFilteredCount=0`
- [v] exposure 합계 invariant: live HTTP smoke `exposureSum=100`, web resolver test `themeShare sum=100`
- [v] freshness invariant: live HTTP smoke `negativeAgeCount=0`, `freshnessCount=3`
- [v] SSR initial loader: final production artifact HTML에서 `data-source="database"`, `data-portfolio-source="database"`, `portfolioDigestResponse:void 0` 없음
- [v] Browser smoke: 포트폴리오 탭 `포트폴리오 DB · 사용 가능`, `Digest DB · 사용 가능`, `변화 알림·노출·신선도`, `포트폴리오 노출`, `데이터 신선도` 렌더링, `KR 38% + US 62% = 100%`, console error 0
- [v] Test/type/build gate: `pnpm typecheck`, `pnpm test`, `pnpm --filter @stock-insight/web build` 통과. Build는 기존 lazy chart chunk warning만 남음.

## 9. 주요 리스크와 결정 필요사항

| 리스크/결정 | 설명 | 권장 결정 |
|---|---|---|
| 웹 사용자 식별 | 현재 `app_users.external_ref`가 Discord 기반 | MVP는 default user로 시작하고, 이후 auth 연결 |
| 재무제표 정규화 부족 | mock의 재무/주주/연혁과 DB가 1:1 매칭 안 됨 | 1차는 deep report/text summary, 2차에 `company_financials/profile` 추가 |
| 장시간 분석 작업 | deep_cache는 결과 캐시지만 job 상태는 부족 | `analysis_jobs` 보강 필요 |
| 전체 시장 뉴스와 개인화 뉴스 분리 | 현재 UI는 섞여 있음 | `Market News`와 `My Feed`를 명확히 분리 |
| 매수/매도 판단 평가 | DB 테이블은 있지만 데이터 없음 | MVP 보류, UI에는 “준비중”만 표시 |
| 주문 기능 오해 | 사용자가 “모든 것”을 원하지만 실제 주문 제외 | 모든 화면에 “조회 전용/주문 기능 없음” 유지 |
| KR/US 외 데이터 노출 | DB에는 crypto/realestate도 있음 | 웹 API에서 domain/market 필터로 KR/US stock만 기본 노출 |

## 10. 최종 판단

현재 mock UI는 단순히 버릴 시안이 아니라, 사용자가 기대하는 제품 범위를 꽤 많이 암시한다. 다만 지금 형태 그대로는 실데이터 DB와 1:1로 맞지 않는다. 따라서 정답은 **UI를 DB에 맞춰 줄이는 것**도, **DB를 mock에 맞춰 무리하게 갈아엎는 것**도 아니다.

최종 방향은 아래다.

1. **Mock UI 보존**
   기존 탭과 카드의 제품 의도는 살린다. 재무/주주/연혁/사업구조 같은 mock 필드는 삭제하지 않고, 구조화 DB 확장 목표로 승격한다.

2. **DB additive 확장**
   기존 `publication_records`, `user_feed_index`, `watchlist.deep_cache`, `stock.candidates`는 그대로 재사용한다. 부족한 영역만 `analysis_jobs`, `stock_learning_cards`, `company_profiles`, `company_financials`처럼 additive로 추가한다.

3. **UI additive 확장**
   DB가 이미 가진 개인화 피드/그래프/출처/심층 리포트 자산은 UI에 새 섹션으로 끌어올린다. 특히 `시장 전체 뉴스`, `주목 종목`, `종목 공부 모드`, `분석 진행 상태`는 신규 핵심 화면이다.

4. **주문 제외 정책 고정**
   제품은 “주식에 대한 거의 모든 리서치/학습/전망”을 제공하지만, 실제 매수·매도 주문과 주문권한 API는 포함하지 않는다.

1차 MVP의 핵심은 아래 5개다.

1. 수동 관심종목/보유종목 관리
2. 종목별 개인화 뉴스·시황·심층 리포트 조회
3. KR/US 전체 시장 뉴스와 주목 종목 탐색
4. 종목 공부 모드와 장시간 분석 job 상태
5. 매수/매도 주문 없는 조회 전용 투자 리서치 정책

매수/매도 타이밍 판단력 평가는 테이블 골격은 있으나 데이터와 평가 기준이 아직 부족하므로, 지금은 UI 자리를 보존하되 구현은 보류한다.
